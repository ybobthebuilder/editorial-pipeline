'use strict';

// Migration tests against a clean Postgres. They run the real psql client, so
// they need a running server. Connection comes from the standard PG* variables.
//
// Fails loudly when no server is configured. A skipped suite would be the same
// empty pass that the validator CI guard refuses.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const MIGRATION = join(__dirname, '..', '..', 'supabase', 'migrations', '001_init_editorial_schema.sql');
const SUFFIX = randomBytes(4).toString('hex');
const DB = `editorial_migration_test_${SUFFIX}`;
const PLAIN_ROLE = `plain_role_${SUFFIX}`;
const SUPABASE_ROLES = ['anon', 'authenticated'];
const CLEAN_ROLES = ['n8n_pipeline', ...SUPABASE_ROLES];

if (!process.env.PGHOST) {
  throw new Error('PGHOST não definido: os testes de migração exigem um Postgres limpo. Não há pulo silencioso.');
}

// Runs SQL from stdin as one psql session. SET ROLE, when given, applies to the whole script.
function psql(db, sql, { role } = {}) {
  const prefix = role ? `SET ROLE ${role};\n` : '';
  return spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', db, '-f', '-'], {
    input: prefix + sql,
    encoding: 'utf8',
  });
}

function ok(db, sql, opts) {
  const result = psql(db, sql, opts);
  assert.equal(result.status, 0, `esperava sucesso, stderr: ${result.stderr}`);
  return result.stdout.trim();
}

function fails(db, sql, pattern, opts) {
  const result = psql(db, sql, opts);
  assert.notEqual(result.status, 0, `esperava erro, saída: ${result.stdout}`);
  assert.match(result.stderr, pattern);
}

function roleExists(name) {
  const result = spawnSync('psql', ['-X', '-At', '-d', 'postgres', '-c',
    `SELECT 1 FROM pg_roles WHERE rolname = '${name}'`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim() === '1';
}

before(() => {
  for (const name of CLEAN_ROLES) {
    assert.equal(roleExists(name), false, `cluster não está limpo: papel ${name} já existe`);
  }
  // Create the Supabase roles so the conditional REVOKE branch is exercised.
  ok('postgres', SUPABASE_ROLES.map((r) => `CREATE ROLE ${r} NOLOGIN;`).join('\n'));
  ok('postgres', `CREATE DATABASE ${DB};`);
  const applied = spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-1', '-d', DB, '-f', MIGRATION],
    { encoding: 'utf8' });
  assert.equal(applied.status, 0, `migração falhou: ${applied.stderr}`);
});

after(() => {
  spawnSync('psql', ['-X', '-q', '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DB};`], { encoding: 'utf8' });
  spawnSync('psql', ['-X', '-q', '-d', 'postgres', '-c', `DROP ROLE IF EXISTS ${PLAIN_ROLE};`], { encoding: 'utf8' });
  spawnSync('psql', ['-X', '-q', '-d', 'postgres', '-c', `DROP ROLE IF EXISTS ${CLEAN_ROLES.join(', ')};`],
    { encoding: 'utf8' });
});

test('the migration does not reference the private schema in executable SQL', () => {
  // Comments may name the private schema to explain the decision; statements may not.
  const code = readFileSync(MIGRATION, 'utf8')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
  assert.equal(/editorial_intel/.test(code), false);
});

test('schema, tables and both functions exist after applying the migration', () => {
  const out = ok(DB, `SELECT to_regclass('editorial.state_transitions') IS NOT NULL,
    to_regclass('editorial.config_baseline') IS NOT NULL,
    to_regprocedure('editorial.guard_transition(text,text)') IS NOT NULL,
    to_regprocedure('editorial.get_config(text)') IS NOT NULL;`);
  assert.equal(out, 't|t|t|t');
});

test('state_transitions holds 31 rows: 12 happy path, 3 stage failures, 16 to NEEDS_REVIEW', () => {
  const out = ok(DB, `SELECT count(*),
      count(*) FILTER (WHERE NOT is_error_path),
      count(*) FILTER (WHERE to_status = 'NEEDS_REVIEW')
    FROM editorial.state_transitions;`);
  assert.equal(out, '31|12|16');
});

test('every happy-path arrow of CLAUDE.md section 5 is accepted by guard_transition', () => {
  const arrows = [
    ['RECEIVED', 'PDF_PARSED'], ['PDF_PARSED', 'EVIDENCE_EXTRACTED'],
    ['EVIDENCE_EXTRACTED', 'EVIDENCE_VERIFIED'], ['EVIDENCE_VERIFIED', 'INSIGHTS_GENERATED'],
    ['INSIGHTS_GENERATED', 'INSIGHTS_RANKED'], ['INSIGHTS_RANKED', 'VISUAL_PLANNED'],
    ['VISUAL_PLANNED', 'COVERS_SPECIFIED'], ['COVERS_SPECIFIED', 'COVERS_RENDERED'],
    ['COVERS_RENDERED', 'QA_PASSED'], ['QA_PASSED', 'AWAITING_APPROVAL'],
    ['AWAITING_APPROVAL', 'HUMAN_APPROVED'], ['HUMAN_APPROVED', 'PUBLISHED'],
  ];
  const script = arrows.map(([a, b]) => `SELECT editorial.guard_transition('${a}', '${b}');`).join('\n');
  ok(DB, script);
});

test('skips, reversals and self-loops are refused by guard_transition', () => {
  const refused = [['RECEIVED', 'PUBLISHED'], ['PDF_PARSED', 'RECEIVED'], ['RECEIVED', 'RECEIVED']];
  for (const [a, b] of refused) {
    fails(DB, `SELECT editorial.guard_transition('${a}', '${b}');`, /transição inválida/);
  }
});

test('stage failures are entered only from the stage input state', () => {
  ok(DB, `SELECT editorial.guard_transition('EVIDENCE_EXTRACTED', 'VERIFICATION_FAILED');
    SELECT editorial.guard_transition('COVERS_SPECIFIED', 'RENDER_FAILED');
    SELECT editorial.guard_transition('COVERS_RENDERED', 'QA_FAILED');`);
  fails(DB, `SELECT editorial.guard_transition('RECEIVED', 'VERIFICATION_FAILED');`, /transição inválida/);
  fails(DB, `SELECT editorial.guard_transition('COVERS_RENDERED', 'RENDER_FAILED');`, /transição inválida/);
});

test('every non-error state can go to NEEDS_REVIEW, including PUBLISHED', () => {
  const sources = [
    'RECEIVED', 'PDF_PARSED', 'EVIDENCE_EXTRACTED', 'EVIDENCE_VERIFIED', 'INSIGHTS_GENERATED',
    'INSIGHTS_RANKED', 'VISUAL_PLANNED', 'COVERS_SPECIFIED', 'COVERS_RENDERED', 'QA_PASSED',
    'AWAITING_APPROVAL', 'HUMAN_APPROVED', 'PUBLISHED', 'VERIFICATION_FAILED', 'QA_FAILED', 'RENDER_FAILED',
  ];
  ok(DB, sources.map((s) => `SELECT editorial.guard_transition('${s}', 'NEEDS_REVIEW');`).join('\n'));
});

test('error states have no exits except NEEDS_REVIEW (retry and rewind are undefined, U11-i)', () => {
  ok(DB, `SELECT editorial.guard_transition('VERIFICATION_FAILED', 'NEEDS_REVIEW');`);
  fails(DB, `SELECT editorial.guard_transition('VERIFICATION_FAILED', 'EVIDENCE_EXTRACTED');`, /transição inválida/);
  fails(DB, `SELECT editorial.guard_transition('QA_FAILED', 'COVERS_RENDERED');`, /transição inválida/);
  fails(DB, `SELECT editorial.guard_transition('NEEDS_REVIEW', 'RECEIVED');`, /transição inválida/);
  fails(DB, `SELECT editorial.guard_transition('NEEDS_REVIEW', 'PUBLISHED');`, /transição inválida/);
});

test('unknown or lowercase status names are refused by the CHECK constraints', () => {
  fails(DB, `INSERT INTO editorial.state_transitions VALUES ('FOO', 'PDF_PARSED', false);`,
    /state_transitions_from_known/);
  fails(DB, `INSERT INTO editorial.state_transitions VALUES ('RECEIVED', 'pdf_parsed', false);`,
    /state_transitions_to_known/);
});

// Pairs below are chosen so that no primary-key conflict can hide the CHECK being tested.
test('is_error_path must match whether the destination is an error state', () => {
  fails(DB, `INSERT INTO editorial.state_transitions VALUES ('RECEIVED', 'INSIGHTS_RANKED', true);`,
    /state_transitions_error_flag/);
  fails(DB, `INSERT INTO editorial.state_transitions VALUES ('RECEIVED', 'QA_FAILED', false);`,
    /state_transitions_error_flag/);
});

test('a status cannot transition to itself at the constraint level', () => {
  fails(DB, `INSERT INTO editorial.state_transitions VALUES ('RECEIVED', 'RECEIVED', false);`,
    /state_transitions_no_self_loop/);
});

test('get_config returns the stored row with source public, and refuses a missing key', () => {
  ok(DB, `INSERT INTO editorial.config_baseline (key, content, version, hash)
    VALUES ('test.key', '{"a": 1}', 'v1', 'h1');`);
  const out = ok(DB, `SELECT editorial.get_config('test.key');`, { role: 'n8n_pipeline' });
  assert.deepEqual(JSON.parse(out), { content: { a: 1 }, source: 'public', version: 'v1', hash: 'h1' });
  fails(DB, `SELECT editorial.get_config('missing.key');`, /configuração ausente/, { role: 'n8n_pipeline' });
});

test('n8n_pipeline reads the public tables and cannot change them', () => {
  ok(DB, `SELECT count(*) FROM editorial.state_transitions;`, { role: 'n8n_pipeline' });
  fails(DB, `INSERT INTO editorial.state_transitions VALUES ('RECEIVED', 'PDF_PARSED', false);`,
    /permission denied/, { role: 'n8n_pipeline' });
  fails(DB, `UPDATE editorial.config_baseline SET version = 'x';`, /permission denied/, { role: 'n8n_pipeline' });
  fails(DB, `DELETE FROM editorial.state_transitions;`, /permission denied/, { role: 'n8n_pipeline' });
  fails(DB, `TRUNCATE editorial.config_baseline;`, /permission denied/, { role: 'n8n_pipeline' });
  fails(DB, `CREATE TABLE editorial.intruder (id int);`, /permission denied/, { role: 'n8n_pipeline' });
});

test('a role with no grants cannot execute the functions or read the tables', () => {
  ok('postgres', `CREATE ROLE ${PLAIN_ROLE} NOLOGIN;`);
  fails(DB, `SELECT editorial.guard_transition('RECEIVED', 'PDF_PARSED');`, /permission denied/,
    { role: PLAIN_ROLE });
  fails(DB, `SELECT editorial.get_config('test.key');`, /permission denied/, { role: PLAIN_ROLE });
  fails(DB, `SELECT count(*) FROM editorial.state_transitions;`, /permission denied/, { role: PLAIN_ROLE });
});

test('row level security is enabled on both public tables', () => {
  const out = ok(DB, `SELECT string_agg(relname || '=' || relrowsecurity, ',' ORDER BY relname)
    FROM pg_class WHERE oid IN ('editorial.state_transitions'::regclass, 'editorial.config_baseline'::regclass);`);
  assert.equal(out, 'config_baseline=true,state_transitions=true');
});

test('the migration revokes anon and authenticated when those roles exist', () => {
  for (const role of SUPABASE_ROLES) {
    const out = ok(DB, `SELECT has_schema_privilege('${role}', 'editorial', 'USAGE'),
      has_function_privilege('${role}', 'editorial.get_config(text)', 'EXECUTE'),
      has_table_privilege('${role}', 'editorial.state_transitions', 'SELECT');`);
    assert.equal(out, 'f|f|f', `${role} deve ficar sem privilégios`);
  }
});
