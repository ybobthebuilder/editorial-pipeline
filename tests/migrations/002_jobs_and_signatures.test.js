'use strict';

// Migration 002 tests against a clean Postgres. Each run applies 001, then 002, to a fresh
// database. Run with --test-concurrency=1: the suites create cluster-wide roles, so two
// files running at once would collide on CREATE ROLE anon.
//
// Fails loudly when no server is configured. A skipped suite would be the same empty pass
// that the validator CI guard refuses.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const MIGRATIONS = join(__dirname, '..', '..', 'supabase', 'migrations');
const M001 = join(MIGRATIONS, '001_init_editorial_schema.sql');
const M002 = join(MIGRATIONS, '002_jobs_and_signatures.sql');
const SUFFIX = randomBytes(4).toString('hex');
const DB = `editorial_migration_test_${SUFFIX}`;
const PLAIN_ROLE = `plain_role_${SUFFIX}`;
const SUPABASE_ROLES = ['anon', 'authenticated'];
const CLEAN_ROLES = ['n8n_pipeline', ...SUPABASE_ROLES];

if (!process.env.PGHOST) {
  throw new Error('PGHOST não definido: os testes de migração exigem um Postgres limpo. Não há pulo silencioso.');
}

// Job ids are fixed per test case so that every assertion names the job it is about.
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

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

// Test-only setup: inserts a job directly, as the owner. set_status does not exist yet.
const seedJob = (n, status) => `INSERT INTO editorial.jobs (id, status) VALUES ('${id(n)}', '${status}');`;

const HAPPY_PATH = [
  ['RECEIVED', 'PDF_PARSED'], ['PDF_PARSED', 'EVIDENCE_EXTRACTED'],
  ['EVIDENCE_EXTRACTED', 'EVIDENCE_VERIFIED'], ['EVIDENCE_VERIFIED', 'INSIGHTS_GENERATED'],
  ['INSIGHTS_GENERATED', 'INSIGHTS_RANKED'], ['INSIGHTS_RANKED', 'VISUAL_PLANNED'],
  ['VISUAL_PLANNED', 'COVERS_SPECIFIED'], ['COVERS_SPECIFIED', 'COVERS_RENDERED'],
  ['COVERS_RENDERED', 'QA_PASSED'], ['QA_PASSED', 'AWAITING_APPROVAL'],
];

before(() => {
  for (const name of CLEAN_ROLES) {
    assert.equal(roleExists(name), false, `cluster não está limpo: papel ${name} já existe`);
  }
  ok('postgres', SUPABASE_ROLES.map((r) => `CREATE ROLE ${r} NOLOGIN;`).join('\n'));
  ok('postgres', `CREATE DATABASE ${DB};`);
  for (const file of [M001, M002]) {
    const applied = spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-1', '-d', DB, '-f', file],
      { encoding: 'utf8' });
    assert.equal(applied.status, 0, `${file} falhou: ${applied.stderr}`);
  }
});

after(() => {
  spawnSync('psql', ['-X', '-q', '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DB};`], { encoding: 'utf8' });
  spawnSync('psql', ['-X', '-q', '-d', 'postgres', '-c', `DROP ROLE IF EXISTS ${PLAIN_ROLE};`], { encoding: 'utf8' });
  spawnSync('psql', ['-X', '-q', '-d', 'postgres', '-c', `DROP ROLE IF EXISTS ${CLEAN_ROLES.join(', ')};`],
    { encoding: 'utf8' });
});

test('002 does not reference editorial_intel in executable SQL', () => {
  // Comments may name the private schema to explain the decision; statements may not.
  const code = readFileSync(M002, 'utf8')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
  assert.equal(/editorial_intel/.test(code), false);
});

test('jobs and signatures have exactly the columns the contract names', () => {
  const out = ok(DB, `SELECT string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable,
      ',' ORDER BY table_name, ordinal_position)
    FROM information_schema.columns
    WHERE table_schema = 'editorial' AND table_name IN ('jobs', 'signatures');`);
  assert.equal(out, [
    'jobs.id:uuid:NO', 'jobs.status:text:NO',
    'jobs.created_at:timestamp with time zone:NO', 'jobs.updated_at:timestamp with time zone:NO',
    'signatures.id:uuid:NO', 'signatures.job_id:uuid:NO', 'signatures.reviewer_name:text:NO',
    'signatures.crm_uf:text:NO', 'signatures.decision:text:NO', 'signatures.notes:text:YES',
    'signatures.signed_at:timestamp with time zone:NO',
  ].join(','));
});

test('state_transitions holds 34 rows: 15 without error, 16 to NEEDS_REVIEW', () => {
  const out = ok(DB, `SELECT count(*),
      count(*) FILTER (WHERE NOT is_error_path),
      count(*) FILTER (WHERE to_status = 'NEEDS_REVIEW')
    FROM editorial.state_transitions;`);
  assert.equal(out, '34|15|16');
});

test('each error state has exactly two exits: its working state and NEEDS_REVIEW', () => {
  const out = ok(DB, `SELECT string_agg(from_status || '>' || to_status, ',' ORDER BY from_status, to_status)
    FROM editorial.state_transitions
    WHERE from_status IN ('VERIFICATION_FAILED', 'RENDER_FAILED', 'QA_FAILED');`);
  assert.equal(out, [
    'QA_FAILED>COVERS_RENDERED', 'QA_FAILED>NEEDS_REVIEW',
    'RENDER_FAILED>COVERS_SPECIFIED', 'RENDER_FAILED>NEEDS_REVIEW',
    'VERIFICATION_FAILED>EVIDENCE_EXTRACTED', 'VERIFICATION_FAILED>NEEDS_REVIEW',
  ].join(','));
});

// U11-l is open: the rule for leaving NEEDS_REVIEW is not defined. This test pins the gap so
// that it cannot change without a test change.
test('NEEDS_REVIEW has no exit yet (open question, pinned)', () => {
  const out = ok(DB, `SELECT count(*) FROM editorial.state_transitions WHERE from_status = 'NEEDS_REVIEW';`);
  assert.equal(out, '0');
});

test('a job in an error state rewinds to the working state it failed from', () => {
  ok(DB, [
    seedJob(20, 'VERIFICATION_FAILED'),
    `SELECT editorial.guard_transition('${id(20)}', 'VERIFICATION_FAILED', 'EVIDENCE_EXTRACTED');`,
    seedJob(21, 'RENDER_FAILED'),
    `SELECT editorial.guard_transition('${id(21)}', 'RENDER_FAILED', 'COVERS_SPECIFIED');`,
    seedJob(22, 'QA_FAILED'),
    `SELECT editorial.guard_transition('${id(22)}', 'QA_FAILED', 'COVERS_RENDERED');`,
  ].join('\n'));
});

test('guard refuses a job that is not in the transition source state', () => {
  ok(DB, seedJob(30, 'RECEIVED'));
  fails(DB, `SELECT editorial.guard_transition('${id(30)}', 'PDF_PARSED', 'EVIDENCE_EXTRACTED');`,
    /está em RECEIVED, não em PDF_PARSED/);
});

test('guard refuses an unknown job id', () => {
  fails(DB, `SELECT editorial.guard_transition('${id(99)}', 'RECEIVED', 'PDF_PARSED');`,
    /job inexistente/);
});

test('the human gate opens only for an approved signature on the same job', () => {
  ok(DB, [
    seedJob(31, 'AWAITING_APPROVAL'), seedJob(32, 'AWAITING_APPROVAL'),
    seedJob(33, 'AWAITING_APPROVAL'), seedJob(34, 'AWAITING_APPROVAL'), seedJob(35, 'AWAITING_APPROVAL'),
    `INSERT INTO editorial.signatures (job_id, reviewer_name, crm_uf, decision) VALUES
       ('${id(32)}', 'revisor sintético', 'SP', 'rejected'),
       ('${id(34)}', 'revisor sintético', 'SP', 'approved'),
       ('${id(35)}', 'revisor sintético', 'SP', 'approved');`,
  ].join('\n'));
  const gate = (n) => `SELECT editorial.guard_transition('${id(n)}', 'AWAITING_APPROVAL', 'HUMAN_APPROVED');`;
  fails(DB, gate(31), /exige aprovação humana registrada/); // no signature at all
  fails(DB, gate(32), /exige aprovação humana registrada/); // signature is rejected
  fails(DB, gate(33), /exige aprovação humana registrada/); // approved signature belongs to job 34
  ok(DB, gate(35));
  assert.equal(ok(DB, `SELECT status FROM editorial.jobs WHERE id = '${id(35)}';`), 'AWAITING_APPROVAL',
    'o guard não escreve: o status continua o mesmo');
});

test('signatures refuse values outside the contract', () => {
  ok(DB, seedJob(41, 'AWAITING_APPROVAL'));
  const insert = ({ name = 'revisor sintético', uf = 'SP', decision = 'approved', job = 41 } = {}) =>
    `INSERT INTO editorial.signatures (job_id, reviewer_name, crm_uf, decision)
       VALUES ('${id(job)}', '${name}', '${uf}', '${decision}');`;
  fails(DB, insert({ decision: 'maybe' }), /signatures_decision_check/);
  fails(DB, insert({ uf: 'XX' }), /signatures_crm_uf_check/);
  fails(DB, insert({ name: '   ' }), /signatures_reviewer_name_check/);
  fails(DB, insert({ job: 99 }), /signatures_job_id_fkey/);
});

test('jobs.status refuses names outside the 17 states', () => {
  fails(DB, `INSERT INTO editorial.jobs (id, status) VALUES ('${id(51)}', 'published');`,
    /jobs_status_known/);
});

test('a job runs the happy path to the gate and past it, through the guard', () => {
  // set_status does not exist yet: the owner updates the status after each guard call.
  const steps = HAPPY_PATH.map(([from, to]) => [
    `SELECT editorial.guard_transition('${id(10)}', '${from}', '${to}');`,
    `UPDATE editorial.jobs SET status = '${to}' WHERE id = '${id(10)}';`,
  ].join('\n')).join('\n');
  ok(DB, `INSERT INTO editorial.jobs (id) VALUES ('${id(10)}');\n${steps}`); // default status: RECEIVED

  fails(DB, `SELECT editorial.guard_transition('${id(10)}', 'AWAITING_APPROVAL', 'HUMAN_APPROVED');`,
    /exige aprovação humana registrada/);
  ok(DB, `INSERT INTO editorial.signatures (job_id, reviewer_name, crm_uf, decision)
      VALUES ('${id(10)}', 'revisor sintético', 'RJ', 'approved');
    SELECT editorial.guard_transition('${id(10)}', 'AWAITING_APPROVAL', 'HUMAN_APPROVED');
    UPDATE editorial.jobs SET status = 'HUMAN_APPROVED' WHERE id = '${id(10)}';
    SELECT editorial.guard_transition('${id(10)}', 'HUMAN_APPROVED', 'PUBLISHED');
    UPDATE editorial.jobs SET status = 'PUBLISHED' WHERE id = '${id(10)}';
    SELECT editorial.guard_transition('${id(10)}', 'PUBLISHED', 'NEEDS_REVIEW');
    UPDATE editorial.jobs SET status = 'NEEDS_REVIEW' WHERE id = '${id(10)}';`);
  assert.equal(ok(DB, `SELECT status FROM editorial.jobs WHERE id = '${id(10)}';`), 'NEEDS_REVIEW');
});

test('n8n_pipeline runs the guard and reads the new tables, and cannot write them', () => {
  ok(DB, [
    seedJob(36, 'AWAITING_APPROVAL'),
    `INSERT INTO editorial.signatures (job_id, reviewer_name, crm_uf, decision)
       VALUES ('${id(36)}', 'revisor sintético', 'MG', 'approved');`,
  ].join('\n'));
  ok(DB, `SELECT count(*) FROM editorial.jobs;
    SELECT count(*) FROM editorial.signatures;
    SELECT editorial.guard_transition('${id(36)}', 'AWAITING_APPROVAL', 'HUMAN_APPROVED');`,
  { role: 'n8n_pipeline' });
  fails(DB, `INSERT INTO editorial.signatures (job_id, reviewer_name, crm_uf, decision)
    VALUES ('${id(36)}', 'revisor sintético', 'MG', 'approved');`, /permission denied/, { role: 'n8n_pipeline' });
  fails(DB, `UPDATE editorial.signatures SET decision = 'approved';`, /permission denied/, { role: 'n8n_pipeline' });
  fails(DB, `DELETE FROM editorial.signatures;`, /permission denied/, { role: 'n8n_pipeline' });
  fails(DB, `UPDATE editorial.jobs SET status = 'PUBLISHED';`, /permission denied/, { role: 'n8n_pipeline' });
  fails(DB, `INSERT INTO editorial.jobs (id) VALUES (gen_random_uuid());`, /permission denied/, { role: 'n8n_pipeline' });
});

test('a role with no grants cannot run the guard or read the new tables', () => {
  ok('postgres', `CREATE ROLE ${PLAIN_ROLE} NOLOGIN;`);
  fails(DB, `SELECT editorial.guard_transition('${id(10)}', 'NEEDS_REVIEW', 'PUBLISHED');`,
    /permission denied/, { role: PLAIN_ROLE });
  fails(DB, `SELECT count(*) FROM editorial.jobs;`, /permission denied/, { role: PLAIN_ROLE });
  fails(DB, `SELECT count(*) FROM editorial.signatures;`, /permission denied/, { role: PLAIN_ROLE });
});

test('the two-argument guard is replaced, not overloaded', () => {
  const out = ok(DB, `SELECT to_regprocedure('editorial.guard_transition(text,text)') IS NULL,
    to_regprocedure('editorial.guard_transition(uuid,text,text)') IS NOT NULL;`);
  assert.equal(out, 't|t');
});

test('row level security is enabled on jobs and signatures', () => {
  const out = ok(DB, `SELECT string_agg(relname || '=' || relrowsecurity, ',' ORDER BY relname)
    FROM pg_class WHERE oid IN ('editorial.jobs'::regclass, 'editorial.signatures'::regclass);`);
  assert.equal(out, 'jobs=true,signatures=true');
});

test('anon and authenticated have no privileges on the new tables or the guard', () => {
  for (const role of SUPABASE_ROLES) {
    const out = ok(DB, `SELECT has_table_privilege('${role}', 'editorial.jobs', 'SELECT'),
      has_table_privilege('${role}', 'editorial.signatures', 'SELECT'),
      has_function_privilege('${role}', 'editorial.guard_transition(uuid,text,text)', 'EXECUTE');`);
    assert.equal(out, 'f|f|f', `${role} deve ficar sem privilégios`);
  }
});
