'use strict';

// Shared code for seed-baseline.js and verify-baseline.js. No dependencies: the database is
// reached through the psql client, with the standard PG* environment variables.
//
// PROPOSED conventions (no source defines them; change the constants here to change them):
//   - config key = file name without .json, snake_case ([a-z0-9_]+)
//   - hash = sha256 of the file bytes, hex
//   - config/baseline/.checksums = sha256sum text format: "<64 hex>  <file name>"
//   - version = given by the caller (--version); the files carry none
//   - prompts (decision D-12: skills/ is the single source of the prompts): each skills/<name>/SKILL.md
//     becomes one config row. The key comes from PROMPT_KEYS (CLAUDE.md section 9), the hash is the
//     sha256 of the whole file, and the content is { name, description, body } with body = the text
//     after the frontmatter. skills/.checksums lists "<name>/SKILL.md". The content format is PROPOSED.

const { createHash } = require('node:crypto');
const { existsSync, readFileSync, readdirSync, statSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const KEY_PATTERN = /^[a-z0-9_]+$/;
const CHECKSUM_LINE = /^([0-9a-f]{64}) [ *](.+)$/;
const MAX_PAYLOAD_BYTES = 100000; // one psql -v argument must stay under the OS limit

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Reads every config/baseline/*.json. An empty directory is an error, never a pass.
function readBaseline(dir) {
  const errors = [];
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return { entries: [], errors: [`diretório não encontrado: ${dir}`] };
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('.')).sort();
  if (files.length === 0) errors.push(`nenhum arquivo .json em ${dir}`);
  const entries = [];
  for (const file of files) {
    const bytes = readFileSync(join(dir, file));
    const key = file.slice(0, -'.json'.length);
    if (!KEY_PATTERN.test(key)) {
      errors.push(`${file}: nome de chave inválido (use [a-z0-9_])`);
      continue;
    }
    let content;
    try {
      content = JSON.parse(bytes.toString('utf8'));
    } catch (error) {
      errors.push(`${file}: JSON inválido (${error.message})`);
      continue;
    }
    entries.push({ key, file, hash: sha256(bytes), content });
  }
  return { entries, errors };
}

// Compares the files with .checksums: every file listed, every entry present, hashes equal.
function checkChecksums(dir, entries) {
  const errors = [];
  const path = join(dir, '.checksums');
  if (!existsSync(path)) return [`.checksums não encontrado em ${dir}`];
  const listed = new Map();
  readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
    if (line.trim() === '') return;
    const match = CHECKSUM_LINE.exec(line);
    if (!match) {
      errors.push(`.checksums linha ${i + 1}: formato inválido`);
      return;
    }
    if (listed.has(match[2])) errors.push(`.checksums: ${match[2]} aparece duas vezes`);
    listed.set(match[2], match[1]);
  });
  for (const entry of entries) {
    if (!listed.has(entry.file)) errors.push(`${entry.file}: não está em .checksums`);
    else if (listed.get(entry.file) !== entry.hash) errors.push(`${entry.file}: hash difere de .checksums`);
  }
  const present = new Set(entries.map((e) => e.file));
  for (const name of listed.keys()) {
    if (!present.has(name)) errors.push(`.checksums lista ${name}, que não existe`);
  }
  return errors;
}

// Offline check used by both scripts. Returns { entries, errors }.
function loadVerified(dir) {
  const { entries, errors } = readBaseline(dir);
  if (errors.length) return { entries, errors };
  return { entries, errors: checkChecksums(dir, entries) };
}

// The closed list of prompt keys of CLAUDE.md section 9 that have a skill. A skill folder that is not
// here is an error, so a new prompt is a reviewed change to this table.
const PROMPT_KEYS = {
  'art-director': 'prompt.06_visual',
  'copywriter-cfm': 'prompt.07_covers',
  'qa-validator': 'prompt.09_qa',
};
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

function parseSkill(text) {
  const match = FRONTMATTER.exec(text);
  if (!match) return { error: 'frontmatter ausente' };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const kv = /^([a-z-]+): (.+)$/.exec(line);
    if (!kv) return { error: `linha de frontmatter inválida: ${line}` };
    if (kv[1] in meta) return { error: `campo repetido no frontmatter: ${kv[1]}` };
    meta[kv[1]] = kv[2];
  }
  if (Object.keys(meta).sort().join(',') !== 'description,name') {
    return { error: 'o frontmatter deve ter só name e description' };
  }
  return { meta, body: match[2] };
}

// Reads skills/<name>/SKILL.md. An empty directory is an error, never a pass.
function readSkills(dir) {
  const errors = [];
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return { entries: [], errors: [`diretório não encontrado: ${dir}`] };
  }
  const names = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  if (names.length === 0) errors.push(`nenhuma skill em ${dir}`);
  const entries = [];
  for (const name of names) {
    const key = PROMPT_KEYS[name];
    if (!key) {
      errors.push(`${name}: sem chave de prompt definida em PROMPT_KEYS`);
      continue;
    }
    const path = join(dir, name, 'SKILL.md');
    if (!existsSync(path)) {
      errors.push(`${name}/SKILL.md não encontrado`);
      continue;
    }
    const bytes = readFileSync(path);
    const parsed = parseSkill(bytes.toString('utf8'));
    if (parsed.error) {
      errors.push(`${name}/SKILL.md: ${parsed.error}`);
      continue;
    }
    if (parsed.meta.name !== name) {
      errors.push(`${name}/SKILL.md: name (${parsed.meta.name}) difere da pasta`);
      continue;
    }
    entries.push({
      key,
      file: `${name}/SKILL.md`,
      hash: sha256(bytes),
      content: { name: parsed.meta.name, description: parsed.meta.description, body: parsed.body },
    });
  }
  return { entries, errors };
}

function loadVerifiedSkills(dir) {
  const { entries, errors } = readSkills(dir);
  if (errors.length) return { entries, errors };
  return { entries, errors: checkChecksums(dir, entries) };
}

function psql(args, input) {
  const result = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', ...args], { input, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}

// One transaction: either every file lands or none does.
function seed(entries, version) {
  const payload = JSON.stringify(entries.map((e) => ({ key: e.key, content: e.content, version, hash: e.hash })));
  if (Buffer.byteLength(payload) > MAX_PAYLOAD_BYTES) {
    throw new Error(`baseline grande demais para uma carga (${Buffer.byteLength(payload)} bytes)`);
  }
  const sql = `INSERT INTO editorial.config_baseline (key, content, version, hash)
    SELECT e->>'key', e->'content', e->>'version', e->>'hash'
      FROM jsonb_array_elements(:'payload'::jsonb) AS e
    ON CONFLICT (key) DO UPDATE
      SET content = EXCLUDED.content, version = EXCLUDED.version, hash = EXCLUDED.hash;`;
  const result = psql(['-1', '-v', `payload=${payload}`, '-f', '-'], sql);
  if (result.status !== 0) throw new Error(`psql falhou: ${result.stderr.trim()}`);
}

function readDatabaseRows() {
  const result = psql(['-c', `SELECT coalesce(jsonb_agg(jsonb_build_object(
      'key', key, 'version', version, 'hash', hash, 'content', content) ORDER BY key), '[]'::jsonb)
    FROM editorial.config_baseline;`]);
  if (result.status !== 0) throw new Error(`psql falhou: ${result.stderr.trim()}`);
  return JSON.parse(result.stdout);
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return keysA.length === keysB.length && keysA.every((k) => k in b && deepEqual(a[k], b[k]));
}

// Compares the verified files with config_baseline: same keys, same hash, same content, and
// the same version when one is given. scope says which rows of the table are being checked:
// baseline files own every key without the prompt. prefix, skills own the prompt. keys, and a row
// outside the scope is not reported as orphan.
function compareWithDatabase(entries, rows, version, scope = { baseline: true, skills: false }) {
  const errors = [];
  const byKey = new Map(rows.map((r) => [r.key, r]));
  for (const entry of entries) {
    const row = byKey.get(entry.key);
    if (!row) { errors.push(`${entry.key}: ausente no banco`); continue; }
    if (row.hash !== entry.hash) errors.push(`${entry.key}: hash do banco difere do arquivo`);
    if (!deepEqual(row.content, entry.content)) errors.push(`${entry.key}: conteúdo do banco difere do arquivo`);
    if (version !== undefined && row.version !== version) errors.push(`${entry.key}: versão do banco é ${row.version}, esperada ${version}`);
  }
  const files = new Set(entries.map((e) => e.key));
  for (const row of rows) {
    const inScope = row.key.startsWith('prompt.') ? scope.skills : scope.baseline;
    if (inScope && !files.has(row.key)) errors.push(`${row.key}: está no banco e não tem arquivo`);
  }
  return errors;
}

// Minimal --name value parser. Unknown flags are errors, so a typo never passes silently.
function parseArgs(argv, allowed) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i];
    if (!name.startsWith('--') || !allowed.includes(name.slice(2))) throw new Error(`argumento desconhecido: ${name}`);
    if (i + 1 >= argv.length) throw new Error(`falta o valor de ${name}`);
    out[name.slice(2)] = argv[i + 1];
  }
  return out;
}

module.exports = { readBaseline, readSkills, checkChecksums, loadVerified, loadVerifiedSkills, PROMPT_KEYS, seed, readDatabaseRows, compareWithDatabase, parseArgs, sha256, deepEqual };
