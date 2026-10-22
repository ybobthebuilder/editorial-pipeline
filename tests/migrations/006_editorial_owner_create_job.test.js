'use strict';

// Migration 006 tests: editorial_owner owns the SECURITY DEFINER functions with the minimum
// privileges, and create_job is the only way for n8n_pipeline to create a job.
// Run with --test-concurrency=1 (see _harness.js).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const h = require('./_harness');

const { id, ok, fails } = h;
const N8N = { role: 'n8n_pipeline' };
const OWNER = { role: 'editorial_owner' };
let db;
let migrationRole;

const seed = (n, status) => `INSERT INTO editorial.jobs
  (id, status, source_origin, input_context, config_source, config_version)
  VALUES ('${id(n)}', '${status}', 'teste sintético', '{}', 'public', 'v-teste');`;
const create = (origin = 'teste', ctx = '{}', src = 'public', ver = 'v1') =>
  `SELECT editorial.create_job('${origin}', '${ctx}'::jsonb, '${src}', '${ver}');`;
const setStatus = (n, to) => `SELECT editorial.set_status('${id(n)}', '${to}');`;
const running = (n, stage, exec) => `SELECT editorial.mark_running('${id(n)}', '${stage}', '${exec}');`;
const row = (n, cols) => ok(db, `SELECT ${cols} FROM editorial.jobs WHERE id = '${id(n)}';`);

before(() => {
  db = h.createDatabase('006');
  migrationRole = ok(db, 'SELECT current_user;');
});

after(() => {
  h.dropDatabase(db, ['plain_role_006']);
});

test('editorial_owner is a plain role: no login, no superuser, no BYPASSRLS, no role creation', () => {
  assert.equal(ok(db, `SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
    FROM pg_roles WHERE rolname = 'editorial_owner';`), 'f|f|f|f|f');
});

test('editorial_owner is not a member of the other project roles, and they are not members of it', () => {
  const pairs = [['n8n_pipeline', 'editorial_owner'], ['editorial_owner', 'n8n_pipeline'],
    ['human_reviewer', 'editorial_owner'], ['editorial_owner', 'human_reviewer']];
  const out = ok(db, pairs.map(([a, b]) => `SELECT pg_has_role('${a}', '${b}', 'member');`).join('\n'));
  assert.equal(out.split('\n').join(''), 'ffff');
});

test('the four SECURITY DEFINER functions belong to editorial_owner; get_config stays with the migration role', () => {
  const out = ok(db, `SELECT string_agg(p.proname || '=' || pg_get_userbyid(p.proowner) || '/' || p.prosecdef, ',' ORDER BY p.proname)
    FROM pg_proc p WHERE p.pronamespace = 'editorial'::regnamespace;`);
  assert.equal(out, [
    'create_job=editorial_owner/true', 'get_config=' + migrationRole + '/false',
    'guard_transition=editorial_owner/true', 'mark_running=editorial_owner/true', 'set_status=editorial_owner/true',
  ].join(','));
});

test('editorial_owner can do only what the functions need', () => {
  ok(db, seed(1, 'RECEIVED'));
  ok(db, `SELECT count(*) FROM editorial.jobs; SELECT count(*) FROM editorial.signatures;
    SELECT count(*) FROM editorial.state_transitions;
    UPDATE editorial.jobs SET status = 'PDF_PARSED', previous_status = 'RECEIVED', attempt_count = 0,
      last_stage = '01_INGEST', last_execution_id = 'e1', updated_at = now(), status_entered_at = now()
      WHERE id = '${id(1)}';`, OWNER);
  fails(db, `DELETE FROM editorial.jobs;`, /permission denied/, OWNER);
  fails(db, `UPDATE editorial.jobs SET source_origin = 'x';`, /permission denied/, OWNER);
  fails(db, `UPDATE editorial.jobs SET input_context = '{}';`, /permission denied/, OWNER);
  fails(db, `INSERT INTO editorial.jobs (status, source_origin, input_context, config_source, config_version)
    VALUES ('PUBLISHED', 'x', '{}', 'public', 'v');`, /permission denied/, OWNER);
  fails(db, `INSERT INTO editorial.signatures (job_id, reviewer_name, crm_uf, decision)
    VALUES ('${id(1)}', 'x', 'SP', 'approved');`, /permission denied/, OWNER);
  fails(db, `UPDATE editorial.state_transitions SET requires_gate = false;`, /permission denied/, OWNER);
  fails(db, `SELECT count(*) FROM editorial.config_baseline;`, /permission denied/, OWNER);
  fails(db, `CREATE TABLE editorial.intruder (id int);`, /permission denied/, OWNER);
});

test('create_job returns an id and records a RECEIVED job with its provenance', () => {
  const out = ok(db, create('upload sintético', '{"k": 1}', 'public', 'v-base'), N8N);
  assert.match(out, /^[0-9a-f-]{36}$/);
  assert.equal(ok(db, `SELECT status, attempt_count, source_origin, input_context::text, config_source, config_version
    FROM editorial.jobs WHERE id = '${out}';`), 'RECEIVED|0|upload sintético|{"k": 1}|public|v-base');
});

test('create_job refuses jobs without provenance or with values outside the contract', () => {
  fails(db, create('   '), /jobs_source_origin_nonblank/, N8N);
  fails(db, create('x', '[]'), /jobs_input_context_object/, N8N);
  fails(db, create('x', '{}', 'other'), /jobs_config_source_known/, N8N);
  fails(db, create('x', '{}', 'public', ''), /jobs_config_version_nonblank/, N8N);
  fails(db, `SELECT editorial.create_job(NULL, '{}'::jsonb, 'public', 'v');`, /null value in column "source_origin"/, N8N);
  fails(db, `SELECT editorial.create_job('x', NULL, 'public', 'v');`, /null value in column "input_context"/, N8N);
});

test('only n8n_pipeline can execute create_job, and nobody else can write jobs', () => {
  ok('postgres', `CREATE ROLE plain_role_006 NOLOGIN;`);
  for (const role of ['plain_role_006', 'human_reviewer']) fails(db, create(), /permission denied/, { role });
  for (const role of h.SUPABASE_ROLES) {
    assert.equal(ok(db, `SELECT has_function_privilege('${role}', 'editorial.create_job(text,jsonb,text,text)', 'EXECUTE');`), 'f', role);
  }
  fails(db, `INSERT INTO editorial.jobs (source_origin, input_context, config_source, config_version)
    VALUES ('x', '{}', 'public', 'v');`, /permission denied/, N8N);
  fails(db, `UPDATE editorial.jobs SET status = 'PUBLISHED';`, /permission denied/, N8N);
});

test('a shadowing temp table does not hijack create_job', () => {
  const before = ok(db, `SELECT count(*) FROM editorial.jobs;`);
  ok(db, `CREATE TEMP TABLE jobs (id uuid, status text);\n${create('hijack')}\nSELECT count(*) FROM jobs;`, N8N);
  assert.equal(ok(db, `SELECT count(*) FROM editorial.jobs;`), String(Number(before) + 1));
});

test('create_job, mark_running and set_status run the whole pipeline under editorial_owner, with a new signature for a new review', () => {
  const jobId = ok(db, create('pipeline completo'), N8N);
  const stages = [
    ['01_INGEST', 'PDF_PARSED'], ['02_EXTRACT', 'EVIDENCE_EXTRACTED'], ['03_VERIFY', 'EVIDENCE_VERIFIED'],
    ['04_INSIGHTS', 'INSIGHTS_GENERATED'], ['05_SCORE', 'INSIGHTS_RANKED'], ['06_VISUAL', 'VISUAL_PLANNED'],
    ['07_COVERS', 'COVERS_SPECIFIED'], ['08_RENDER', 'COVERS_RENDERED'], ['09_QA', 'QA_PASSED'],
    ['10_APPROVAL', 'AWAITING_APPROVAL'],
  ];
  const q = (sql) => sql.replace(/__ID__/g, jobId);
  ok(db, stages.map(([stage, next], i) => q(`SELECT editorial.mark_running('__ID__', '${stage}', 'exec-${i}');
    SELECT editorial.set_status('__ID__', '${next}');`)).join('\n'), N8N);
  fails(db, q(`SELECT editorial.set_status('__ID__', 'HUMAN_APPROVED');`), /exige aprovação humana registrada/, N8N);
  const sign = q(`INSERT INTO editorial.signatures (job_id, reviewer_name, crm_uf, decision)
    VALUES ('__ID__', 'revisor sintético', 'SP', 'approved');`);
  ok(db, sign, { role: 'human_reviewer' });
  ok(db, q(`SELECT editorial.set_status('__ID__', 'HUMAN_APPROVED'); SELECT editorial.set_status('__ID__', 'PUBLISHED');
    SELECT editorial.set_status('__ID__', 'NEEDS_REVIEW'); SELECT editorial.set_status('__ID__', 'AWAITING_APPROVAL');`), N8N);
  fails(db, q(`SELECT editorial.set_status('__ID__', 'HUMAN_APPROVED');`), /exige aprovação humana registrada/, N8N);
  ok(db, sign, { role: 'human_reviewer' });
  ok(db, q(`SELECT editorial.set_status('__ID__', 'HUMAN_APPROVED');`), N8N);
  assert.equal(ok(db, q(`SELECT status, previous_status FROM editorial.jobs WHERE id = '__ID__';`)), 'HUMAN_APPROVED|AWAITING_APPROVAL');
});

test('two concurrent set_status calls still serialize under editorial_owner', async () => {
  ok(db, seed(30, 'RECEIVED'));
  const run = (sql, delayMs = 0) => new Promise((resolve) => {
    setTimeout(() => {
      const p = spawn('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', db, '-f', '-']);
      let stderr = '';
      p.stderr.on('data', (d) => { stderr += d; });
      p.on('close', (status) => resolve({ status, stderr }));
      p.stdin.end(`SET ROLE n8n_pipeline;\n${sql}`);
    }, delayMs);
  });
  const [first, second] = await Promise.all([
    run(`BEGIN;\n${setStatus(30, 'PDF_PARSED')}\nSELECT pg_sleep(1.5);\nCOMMIT;`),
    run(setStatus(30, 'PDF_PARSED'), 500),
  ]);
  assert.equal(first.status, 0, first.stderr);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /transição inválida: PDF_PARSED -> PDF_PARSED/);
  assert.equal(row(30, 'status'), 'PDF_PARSED');
});

test('both functions keep the fixed search_path', () => {
  const out = ok(db, `SELECT count(*) FROM pg_proc WHERE pronamespace = 'editorial'::regnamespace AND prosecdef
    AND proconfig::text LIKE '%search_path=pg_catalog, editorial, pg_temp%';`);
  assert.equal(out, '4');
});
