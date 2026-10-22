'use strict';

// seed-baseline.js and verify-baseline.js against a Postgres built up to migration 006, with
// synthetic baseline files in a temporary directory. Run with --test-concurrency=1.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const h = require('../migrations/_harness');

const { ok } = h;
const SEED = join(__dirname, '..', '..', 'scripts', 'seed-baseline.js');
const VERIFY = join(__dirname, '..', '..', 'scripts', 'verify-baseline.js');
const FILES = {
  'scoring_weights.json': '{"a": 1, "b": [1, 2]}\n',
  'visual_library.json': '{"grammars": ["x", "y"]}\n',
};
let db;
const dirs = [];

const sha = (text) => createHash('sha256').update(text).digest('hex');

// Writes a baseline directory with a consistent .checksums unless told otherwise.
function makeDir(files = FILES, { checksums } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'baseline-'));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  // checksums: undefined = a consistent file, null = no .checksums at all, an array = those lines.
  const lines = checksums === undefined
    ? Object.entries(files).filter(([n]) => n.endsWith('.json')).map(([n, t]) => `${sha(t)}  ${n}`)
    : checksums;
  if (lines !== null) writeFileSync(join(dir, '.checksums'), lines.join('\n') + '\n');
  return dir;
}

function run(script, args, env = {}) {
  return spawnSync('node', [script, ...args], { encoding: 'utf8', env: { ...process.env, PGDATABASE: db, ...env } });
}

const reset = () => ok(db, 'TRUNCATE editorial.config_baseline;');
const rows = () => ok(db, `SELECT key || '|' || version || '|' || hash FROM editorial.config_baseline ORDER BY key;`);

before(() => {
  db = h.createDatabase('006');
});

after(() => {
  h.dropDatabase(db);
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

test('verify --offline accepts files that match .checksums', () => {
  const r = run(VERIFY, ['--dir', makeDir(), '--offline', 'true']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /2 arquivo\(s\) conferem/);
});

test('verify rejects a tampered file, and names it', () => {
  const dir = makeDir();
  writeFileSync(join(dir, 'scoring_weights.json'), '{"a": 2, "b": [1, 2]}\n');
  const r = run(VERIFY, ['--dir', dir, '--offline', 'true']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /scoring_weights\.json: hash difere de \.checksums/);
});

test('verify rejects every malformed baseline directory (none passes by being empty or incomplete)', () => {
  const good = Object.entries(FILES).map(([n, t]) => `${sha(t)}  ${n}`);
  const cases = [
    ['missing .checksums', makeDir(FILES, { checksums: null }), /\.checksums não encontrado/],
    ['file not listed', makeDir(FILES, { checksums: [good[0]] }), /visual_library\.json: não está em \.checksums/],
    ['entry without file', makeDir(FILES, { checksums: [...good, `${'a'.repeat(64)}  ghost.json`] }), /lista ghost\.json, que não existe/],
    ['malformed line', makeDir(FILES, { checksums: [...good, 'not a checksum'] }), /linha 3: formato inválido/],
    ['duplicate entry', makeDir(FILES, { checksums: [...good, good[0]] }), /aparece duas vezes/],
    ['invalid JSON', makeDir({ 'broken.json': '{nope' }), /broken\.json: JSON inválido/],
    ['invalid key name', makeDir({ 'Bad-Name.json': '{}' }), /nome de chave inválido/],
    ['no json files', makeDir({}), /nenhum arquivo \.json/],
    ['missing directory', join(tmpdir(), 'baseline-does-not-exist'), /diretório não encontrado/],
  ];
  for (const [label, dir, pattern] of cases) {
    const r = run(VERIFY, ['--dir', dir, '--offline', 'true']);
    assert.equal(r.status, 1, label);
    assert.match(r.stderr, pattern, label);
  }
});

test('bad usage exits with 2: unknown flag, missing value, seed without --version', () => {
  assert.equal(run(VERIFY, ['--nope', 'x']).status, 2);
  assert.equal(run(VERIFY, ['--dir']).status, 2);
  assert.equal(run(SEED, ['--dir', makeDir()]).status, 2);
  assert.equal(run(SEED, ['--dir', makeDir(), '--version', ' ']).status, 2);
});

test('seed writes every file with its sha256, content and the given version', () => {
  reset();
  const r = run(SEED, ['--dir', makeDir(), '--version', 'v1']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(rows(), [
    `scoring_weights|v1|${sha(FILES['scoring_weights.json'])}`,
    `visual_library|v1|${sha(FILES['visual_library.json'])}`,
  ].join('\n'));
  assert.equal(ok(db, `SELECT content::text FROM editorial.config_baseline WHERE key = 'scoring_weights';`), '{"a": 1, "b": [1, 2]}');
});

test('seed is idempotent: running again updates rows and never duplicates them', () => {
  reset();
  const dir = makeDir();
  assert.equal(run(SEED, ['--dir', dir, '--version', 'v1']).status, 0);
  assert.equal(run(SEED, ['--dir', dir, '--version', 'v2']).status, 0);
  assert.equal(ok(db, `SELECT count(*) || '|' || min(version) || '|' || max(version) FROM editorial.config_baseline;`), '2|v2|v2');
});

test('seed refuses files that do not match .checksums and writes nothing', () => {
  reset();
  const dir = makeDir();
  writeFileSync(join(dir, 'visual_library.json'), '{"grammars": []}\n');
  const r = run(SEED, ['--dir', dir, '--version', 'v1']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Nada foi gravado/);
  assert.equal(ok(db, 'SELECT count(*) FROM editorial.config_baseline;'), '0');
});

test('seed is one transaction: a failing row leaves no partial baseline', () => {
  reset();
  ok(db, `CREATE FUNCTION public.refuse_zzz() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.key = 'zzz' THEN RAISE EXCEPTION 'chave recusada'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER refuse_zzz BEFORE INSERT ON editorial.config_baseline FOR EACH ROW EXECUTE FUNCTION public.refuse_zzz();`);
  const dir = makeDir({ 'aaa.json': '{"a": 1}\n', 'zzz.json': '{"z": 1}\n' });
  const r = run(SEED, ['--dir', dir, '--version', 'v1']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /chave recusada/);
  assert.equal(ok(db, 'SELECT count(*) FROM editorial.config_baseline;'), '0');
  ok(db, 'DROP TRIGGER refuse_zzz ON editorial.config_baseline; DROP FUNCTION public.refuse_zzz();');
});

test('seed needs a role that can write config_baseline: n8n_pipeline cannot', () => {
  reset();
  const r = run(SEED, ['--dir', makeDir(), '--version', 'v1'], { PGOPTIONS: '-c role=n8n_pipeline' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /permission denied/);
  assert.equal(ok(db, 'SELECT count(*) FROM editorial.config_baseline;'), '0');
});

test('verify agrees after a seed, also for the read-only n8n_pipeline role', () => {
  reset();
  const dir = makeDir();
  assert.equal(run(SEED, ['--dir', dir, '--version', 'v1']).status, 0);
  assert.equal(run(VERIFY, ['--dir', dir, '--version', 'v1']).status, 0);
  const r = run(VERIFY, ['--dir', dir], { PGOPTIONS: '-c role=n8n_pipeline' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /conferem entre arquivos, \.checksums e banco/);
});

test('verify reports each kind of drift between the files and the database', () => {
  const dir = makeDir();
  const drift = [
    ['content changed in the database', `UPDATE editorial.config_baseline SET content = '{"a": 9}' WHERE key = 'scoring_weights';`, /scoring_weights: conteúdo do banco difere/],
    ['hash changed in the database', `UPDATE editorial.config_baseline SET hash = 'deadbeef' WHERE key = 'scoring_weights';`, /scoring_weights: hash do banco difere/],
    ['key missing in the database', `DELETE FROM editorial.config_baseline WHERE key = 'visual_library';`, /visual_library: ausente no banco/],
    ['extra key in the database', `INSERT INTO editorial.config_baseline VALUES ('orphan', '{}', 'v1', 'h');`, /orphan: está no banco e não tem arquivo/],
  ];
  for (const [label, sql, pattern] of drift) {
    reset();
    assert.equal(run(SEED, ['--dir', dir, '--version', 'v1']).status, 0);
    ok(db, sql);
    const r = run(VERIFY, ['--dir', dir]);
    assert.equal(r.status, 1, label);
    assert.match(r.stderr, pattern, label);
  }
  reset();
  assert.equal(run(SEED, ['--dir', dir, '--version', 'v1']).status, 0);
  const r = run(VERIFY, ['--dir', dir, '--version', 'v2']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /versão do banco é v1, esperada v2/);
});

test('verify compares numbers by value, not by how the database prints them', () => {
  reset();
  const dir = makeDir({ 'numbers.json': '{"x": 1.0, "y": 2.50}\n' });
  assert.equal(run(SEED, ['--dir', dir, '--version', 'v1']).status, 0);
  assert.equal(run(VERIFY, ['--dir', dir]).status, 0);
});
