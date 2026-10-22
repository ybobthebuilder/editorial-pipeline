'use strict';

// seed-baseline.js and verify-baseline.js with --skills (decision D-12: skills/ is the single source of
// the prompts). Synthetic skills in a temporary directory, a Postgres built up to migration 006.
// Run with --test-concurrency=1.

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
let db;
const dirs = [];

const sha = (text) => createHash('sha256').update(text).digest('hex');
const skill = (name, body = '\n# manual\n\nTexto do prompt.\n') =>
  `---\nname: ${name}\ndescription: Descrição sintética de ${name} para o teste.\n---\n${body}`;
const SKILLS = {
  'art-director': skill('art-director'),
  'copywriter-cfm': skill('copywriter-cfm'),
  'qa-validator': skill('qa-validator'),
};
const EXPECTED_KEYS = {
  'art-director': 'prompt.06_visual', 'copywriter-cfm': 'prompt.07_covers', 'qa-validator': 'prompt.09_qa',
};

// checksums: undefined = a consistent file, null = none, an array = those lines.
function makeSkills(files = SKILLS, { checksums } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'skills-'));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name));
    writeFileSync(join(dir, name, 'SKILL.md'), text);
  }
  const lines = checksums === undefined
    ? Object.entries(files).map(([n, t]) => `${sha(t)}  ${n}/SKILL.md`)
    : checksums;
  if (lines !== null) writeFileSync(join(dir, '.checksums'), lines.join('\n') + '\n');
  return dir;
}

function makeBaseline() {
  const dir = mkdtempSync(join(tmpdir(), 'baseline-'));
  dirs.push(dir);
  const text = '{"a": 1}\n';
  writeFileSync(join(dir, 'scoring_weights.json'), text);
  writeFileSync(join(dir, '.checksums'), `${sha(text)}  scoring_weights.json\n`);
  return dir;
}

function run(script, args, env = {}) {
  return spawnSync('node', [script, ...args], { encoding: 'utf8', env: { ...process.env, PGDATABASE: db, ...env } });
}
const reset = () => ok(db, 'TRUNCATE editorial.config_baseline;');
const keys = () => ok(db, `SELECT string_agg(key, ',' ORDER BY key) FROM editorial.config_baseline;`);

before(() => {
  db = h.createDatabase('006');
});
after(() => {
  h.dropDatabase(db);
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

test('verify --offline accepts skills that match .checksums, without a baseline directory', () => {
  const r = run(VERIFY, ['--skills', makeSkills(), '--offline', 'true']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /3 arquivo\(s\) conferem/);
});

test('skills are refused when malformed, tampered or unknown, and an empty folder never passes', () => {
  const good = Object.entries(SKILLS).map(([n, t]) => `${sha(t)}  ${n}/SKILL.md`);
  const tampered = makeSkills();
  writeFileSync(join(tampered, 'art-director', 'SKILL.md'), skill('art-director', '\n# outro texto\n'));
  const cases = [
    ['tampered file', tampered, /art-director\/SKILL\.md: hash difere de \.checksums/],
    ['missing .checksums', makeSkills(SKILLS, { checksums: null }), /\.checksums não encontrado/],
    ['file not listed', makeSkills(SKILLS, { checksums: [good[0]] }), /não está em \.checksums/],
    ['unknown skill folder', makeSkills({ 'brief-researcher': skill('brief-researcher') }), /brief-researcher: sem chave de prompt definida/],
    ['name differs from the folder', makeSkills({ 'art-director': skill('outro-nome') }), /name \(outro-nome\) difere da pasta/],
    ['frontmatter with tools', makeSkills({ 'art-director': '---\nname: art-director\ndescription: x y z\ntools: Read\n---\n\ncorpo\n' }), /só name e description/],
    ['no frontmatter', makeSkills({ 'art-director': '# sem frontmatter\n' }), /frontmatter ausente/],
    ['no skills at all', makeSkills({}), /nenhuma skill/],
    ['missing directory', join(tmpdir(), 'skills-does-not-exist'), /diretório não encontrado/],
  ];
  for (const [label, dir, pattern] of cases) {
    const r = run(VERIFY, ['--skills', dir, '--offline', 'true']);
    assert.equal(r.status, 1, label);
    assert.match(r.stderr, pattern, label);
  }
});

test('seed --skills writes one row per skill under the CLAUDE.md prompt keys, with the file sha256', () => {
  reset();
  const r = run(SEED, ['--skills', makeSkills(), '--version', 'v1']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(keys(), 'prompt.06_visual,prompt.07_covers,prompt.09_qa');
  for (const [name, key] of Object.entries(EXPECTED_KEYS)) {
    assert.equal(ok(db, `SELECT hash || '|' || version FROM editorial.config_baseline WHERE key = '${key}';`), `${sha(SKILLS[name])}|v1`, key);
  }
});

test('the stored content is the name, the description and the body after the frontmatter', () => {
  reset();
  assert.equal(run(SEED, ['--skills', makeSkills(), '--version', 'v1']).status, 0);
  const content = JSON.parse(ok(db, `SELECT content::text FROM editorial.config_baseline WHERE key = 'prompt.07_covers';`));
  assert.deepEqual(content, {
    name: 'copywriter-cfm',
    description: 'Descrição sintética de copywriter-cfm para o teste.',
    body: '\n# manual\n\nTexto do prompt.\n',
  });
});

test('get_config returns the prompt for n8n_pipeline, which is how the workflow will read it', () => {
  reset();
  assert.equal(run(SEED, ['--skills', makeSkills(), '--version', 'v1']).status, 0);
  const out = JSON.parse(ok(db, `SELECT editorial.get_config('prompt.06_visual');`, { role: 'n8n_pipeline' }));
  assert.equal(out.source, 'public');
  assert.equal(out.version, 'v1');
  assert.equal(out.content.body, '\n# manual\n\nTexto do prompt.\n');
});

test('seed refuses skills that fail the checks and writes nothing', () => {
  reset();
  const dir = makeSkills();
  writeFileSync(join(dir, 'qa-validator', 'SKILL.md'), skill('qa-validator', '\n# adulterado\n'));
  const r = run(SEED, ['--skills', dir, '--version', 'v1']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Nada foi gravado/);
  assert.equal(ok(db, 'SELECT count(*) FROM editorial.config_baseline;'), '0');
});

test('seed with baseline files and skills together, then verify each scope on its own', () => {
  reset();
  const baseline = makeBaseline();
  const skills = makeSkills();
  assert.equal(run(SEED, ['--dir', baseline, '--skills', skills, '--version', 'v1']).status, 0);
  assert.equal(keys(), 'prompt.06_visual,prompt.07_covers,prompt.09_qa,scoring_weights');
  assert.equal(run(VERIFY, ['--dir', baseline, '--skills', skills, '--version', 'v1']).status, 0);
  // Each scope ignores the rows that belong to the other one.
  assert.equal(run(VERIFY, ['--dir', baseline]).status, 0);
  assert.equal(run(VERIFY, ['--skills', skills]).status, 0);
});

test('seed is idempotent for prompts: a second run updates and never duplicates', () => {
  reset();
  const skills = makeSkills();
  assert.equal(run(SEED, ['--skills', skills, '--version', 'v1']).status, 0);
  assert.equal(run(SEED, ['--skills', skills, '--version', 'v2']).status, 0);
  assert.equal(ok(db, `SELECT count(*) || '|' || min(version) FROM editorial.config_baseline;`), '3|v2');
});

test('verify reports each kind of prompt drift between the files and the database', () => {
  const skills = makeSkills();
  const drift = [
    ['body changed in the database', `UPDATE editorial.config_baseline SET content = jsonb_set(content, '{body}', '"x"') WHERE key = 'prompt.09_qa';`, /prompt\.09_qa: conteúdo do banco difere/],
    ['hash changed in the database', `UPDATE editorial.config_baseline SET hash = 'deadbeef' WHERE key = 'prompt.06_visual';`, /prompt\.06_visual: hash do banco difere/],
    ['prompt missing in the database', `DELETE FROM editorial.config_baseline WHERE key = 'prompt.07_covers';`, /prompt\.07_covers: ausente no banco/],
    ['orphan prompt in the database', `INSERT INTO editorial.config_baseline VALUES ('prompt.02_extract', '{}', 'v1', 'h');`, /prompt\.02_extract: está no banco e não tem arquivo/],
  ];
  for (const [label, sql, pattern] of drift) {
    reset();
    assert.equal(run(SEED, ['--skills', skills, '--version', 'v1']).status, 0);
    ok(db, sql);
    const r = run(VERIFY, ['--skills', skills]);
    assert.equal(r.status, 1, label);
    assert.match(r.stderr, pattern, label);
  }
});

test('an orphan prompt row is invisible when only the baseline files are verified, and visible with --skills', () => {
  reset();
  const baseline = makeBaseline();
  assert.equal(run(SEED, ['--dir', baseline, '--version', 'v1']).status, 0);
  ok(db, `INSERT INTO editorial.config_baseline VALUES ('prompt.02_extract', '{}', 'v1', 'h');`);
  assert.equal(run(VERIFY, ['--dir', baseline]).status, 0);
  const r = run(VERIFY, ['--dir', baseline, '--skills', makeSkills()]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /prompt\.02_extract: está no banco e não tem arquivo/);
});

test('without --dir nor --skills the old default still applies, and a bad flag is a usage error', () => {
  assert.equal(run(VERIFY, ['--nope', 'x']).status, 2);
  assert.equal(run(SEED, ['--skills', makeSkills()]).status, 2); // no --version
});
