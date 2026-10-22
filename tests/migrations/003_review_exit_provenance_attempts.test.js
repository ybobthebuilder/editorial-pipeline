'use strict';

// Migration 003 tests. The database is built at the state of 002, a legacy job and signature
// are inserted, and only then 003 is applied: that proves the expand-contract steps on data.
// Run with --test-concurrency=1 (see _harness.js).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./_harness');

const { id, ok, fails } = h;
let db;

const FILE = () => h.listMigrations().find((f) => f.startsWith('003'));

// Test-only setup, as the owner. set_status does not exist at this migration.
const seed = (n, status, { previous = null } = {}) => `INSERT INTO editorial.jobs
  (id, status, previous_status, source_origin, input_context, config_source, config_version)
  VALUES ('${id(n)}', '${status}', ${previous ? `'${previous}'` : 'NULL'}, 'teste sintético', '{}', 'public', 'v-teste');`;
const guard = (n, from, to) => `SELECT editorial.guard_transition('${id(n)}', '${from}', '${to}');`;
const sign = (n, decision = 'approved', extra = '') => `INSERT INTO editorial.signatures
  (job_id, reviewer_name, crm_uf, decision${extra ? ', signed_at' : ''})
  VALUES ('${id(n)}', 'revisor sintético', 'SP', '${decision}'${extra ? `, ${extra}` : ''});`;

before(() => {
  db = h.createDatabase('002');
  ok(db, `INSERT INTO editorial.jobs (id, status) VALUES ('${id(1)}', 'AWAITING_APPROVAL');
    INSERT INTO editorial.signatures (job_id, reviewer_name, crm_uf, decision)
      VALUES ('${id(1)}', 'revisor sintético', 'SP', 'approved');`);
  h.applyUp(db, FILE());
});

after(() => {
  h.dropDatabase(db, ['plain_role_003']);
});

test('expand: a job that existed before 003 is backfilled with not_reported, not invented values', () => {
  const out = ok(db, `SELECT source_origin, input_context::text, config_source, config_version, attempt_count,
      previous_status IS NULL, status_entered_at = updated_at
    FROM editorial.jobs WHERE id = '${id(1)}';`);
  assert.equal(out, 'not_reported|{}|public|not_reported|0|t|t');
});

test('contract: every jobs constraint is validated, the temporary NOT NULL checks are gone', () => {
  assert.equal(ok(db, `SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'editorial.jobs'::regclass AND NOT convalidated;`), '0');
  assert.equal(ok(db, `SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'editorial.jobs'::regclass AND conname LIKE '%\\_nn';`), '0');
  assert.equal(ok(db, `SELECT string_agg(attname, ',' ORDER BY attname) FROM pg_attribute
    WHERE attrelid = 'editorial.jobs'::regclass AND attnotnull AND attname IN
      ('source_origin', 'input_context', 'config_source', 'config_version');`),
  'config_source,config_version,input_context,source_origin');
});

test('the new jobs columns have the intended types', () => {
  const out = ok(db, `SELECT string_agg(attname || ':' || format_type(atttypid, atttypmod), ',' ORDER BY attnum)
    FROM pg_attribute WHERE attrelid = 'editorial.jobs'::regclass AND attnum > 0 AND NOT attisdropped
      AND attname IN ('source_origin', 'input_context', 'config_source', 'config_version', 'last_stage',
        'last_execution_id', 'attempt_count', 'previous_status', 'status_entered_at');`);
  assert.equal(out, [
    'source_origin:text', 'input_context:jsonb', 'config_source:text', 'config_version:text',
    'last_stage:text', 'last_execution_id:text', 'attempt_count:integer', 'previous_status:text',
    'status_entered_at:timestamp with time zone',
  ].join(','));
});

test('jobs refuses rows without provenance or with values outside the contract', () => {
  const insert = (cols, vals) => `INSERT INTO editorial.jobs (id, ${cols}) VALUES ('${id(60)}', ${vals});`;
  const base = { source_origin: `'teste'`, input_context: `'{}'`, config_source: `'public'`, config_version: `'v1'` };
  const row = (over) => {
    const m = { ...base, ...over };
    return insert(Object.keys(m).join(', '), Object.values(m).join(', '));
  };
  fails(db, `INSERT INTO editorial.jobs (id) VALUES ('${id(60)}');`, /null value in column "source_origin"/);
  fails(db, row({ source_origin: `'   '` }), /jobs_source_origin_nonblank/);
  fails(db, row({ input_context: `'[]'` }), /jobs_input_context_object/);
  fails(db, row({ config_source: `'other'` }), /jobs_config_source_known/);
  fails(db, row({ config_version: `''` }), /jobs_config_version_nonblank/);
  fails(db, row({ last_stage: `'bad'` }), /jobs_last_stage_format/);
  fails(db, row({ last_execution_id: `' '` }), /jobs_last_execution_id_nonblank/);
  fails(db, row({ attempt_count: '-1' }), /jobs_attempt_count_nonneg/);
  fails(db, row({ previous_status: `'FOO'` }), /jobs_previous_status_known/);
  ok(db, row({ last_stage: `'06_VISUAL'`, last_execution_id: `'1234'`, attempt_count: '2' })); // a valid row passes
});

test('state_transitions holds 45 rows and NEEDS_REVIEW has exactly 11 exits', () => {
  assert.equal(ok(db, `SELECT count(*) FROM editorial.state_transitions;`), '45');
  assert.equal(ok(db, `SELECT string_agg(to_status, ',' ORDER BY to_status)
    FROM editorial.state_transitions WHERE from_status = 'NEEDS_REVIEW';`), [
    'AWAITING_APPROVAL', 'COVERS_RENDERED', 'COVERS_SPECIFIED', 'EVIDENCE_EXTRACTED', 'EVIDENCE_VERIFIED',
    'INSIGHTS_GENERATED', 'INSIGHTS_RANKED', 'PDF_PARSED', 'QA_PASSED', 'RECEIVED', 'VISUAL_PLANNED',
  ].join(','));
});

test('NEEDS_REVIEW cannot go to HUMAN_APPROVED or PUBLISHED: the gate cannot be skipped', () => {
  ok(db, seed(70, 'NEEDS_REVIEW', { previous: 'QA_PASSED' }));
  fails(db, guard(70, 'NEEDS_REVIEW', 'HUMAN_APPROVED'), /transição inválida/);
  fails(db, guard(70, 'NEEDS_REVIEW', 'PUBLISHED'), /transição inválida/);
});

test('NEEDS_REVIEW returns the AI to the state it left, and only that state', () => {
  ok(db, [seed(71, 'NEEDS_REVIEW', { previous: 'QA_PASSED' }), seed(72, 'NEEDS_REVIEW', { previous: 'RECEIVED' })].join('\n'));
  ok(db, guard(71, 'NEEDS_REVIEW', 'QA_PASSED'));
  ok(db, guard(72, 'NEEDS_REVIEW', 'RECEIVED'));
  fails(db, guard(71, 'NEEDS_REVIEW', 'COVERS_RENDERED'), /só volta a QA_PASSED, não a COVERS_RENDERED/);
  fails(db, guard(72, 'NEEDS_REVIEW', 'QA_PASSED'), /só volta a RECEIVED, não a QA_PASSED/);
});

test('a job that left an error state returns to the state its failed stage started from', () => {
  ok(db, [seed(73, 'NEEDS_REVIEW', { previous: 'QA_FAILED' }), seed(74, 'NEEDS_REVIEW', { previous: 'VERIFICATION_FAILED' }),
    seed(75, 'NEEDS_REVIEW', { previous: 'RENDER_FAILED' })].join('\n'));
  ok(db, guard(73, 'NEEDS_REVIEW', 'COVERS_RENDERED'));
  ok(db, guard(74, 'NEEDS_REVIEW', 'EVIDENCE_EXTRACTED'));
  ok(db, guard(75, 'NEEDS_REVIEW', 'COVERS_SPECIFIED'));
  fails(db, guard(73, 'NEEDS_REVIEW', 'COVERS_SPECIFIED'), /só volta a COVERS_RENDERED/);
});

test('NEEDS_REVIEW -> AWAITING_APPROVAL only for a job that reached QA_PASSED or later', () => {
  ok(db, [
    seed(76, 'NEEDS_REVIEW', { previous: 'RECEIVED' }), seed(77, 'NEEDS_REVIEW', { previous: 'COVERS_RENDERED' }),
    seed(78, 'NEEDS_REVIEW', { previous: 'QA_FAILED' }), seed(79, 'NEEDS_REVIEW', { previous: 'QA_PASSED' }),
    seed(80, 'NEEDS_REVIEW', { previous: 'AWAITING_APPROVAL' }), seed(81, 'NEEDS_REVIEW', { previous: 'HUMAN_APPROVED' }),
    seed(82, 'NEEDS_REVIEW', { previous: 'PUBLISHED' }),
  ].join('\n'));
  for (const n of [76, 77, 78]) fails(db, guard(n, 'NEEDS_REVIEW', 'AWAITING_APPROVAL'), /não chegou à aprovação humana/);
  for (const n of [79, 80, 81, 82]) ok(db, guard(n, 'NEEDS_REVIEW', 'AWAITING_APPROVAL'));
});

test('after the gate the AI does not redo work: a published job only returns to AWAITING_APPROVAL', () => {
  fails(db, guard(82, 'NEEDS_REVIEW', 'QA_PASSED'), /só volta a PUBLISHED, não a QA_PASSED/);
  fails(db, guard(81, 'NEEDS_REVIEW', 'COVERS_RENDERED'), /só volta a HUMAN_APPROVED/);
});

test('a job in NEEDS_REVIEW with no recorded previous state is refused', () => {
  ok(db, seed(83, 'NEEDS_REVIEW'));
  fails(db, guard(83, 'NEEDS_REVIEW', 'RECEIVED'), /sem estado anterior registrado/);
  fails(db, guard(83, 'NEEDS_REVIEW', 'AWAITING_APPROVAL'), /sem estado anterior registrado/);
});

test('a signature only counts if it was written after the job entered the current state', () => {
  ok(db, seed(84, 'AWAITING_APPROVAL'));
  ok(db, sign(84, 'approved', `'2000-01-01 00:00:00+00'`)); // older than status_entered_at
  fails(db, guard(84, 'AWAITING_APPROVAL', 'HUMAN_APPROVED'), /exige aprovação humana registrada/);
  ok(db, sign(84)); // fresh
  ok(db, guard(84, 'AWAITING_APPROVAL', 'HUMAN_APPROVED'));
});

test('a new review needs a new signature: the old approval does not carry over', () => {
  ok(db, seed(85, 'AWAITING_APPROVAL'));
  ok(db, sign(85));
  ok(db, guard(85, 'AWAITING_APPROVAL', 'HUMAN_APPROVED'));
  // The job goes to NEEDS_REVIEW and back to AWAITING_APPROVAL. set_status will write these
  // columns; here the owner does it.
  ok(db, `UPDATE editorial.jobs SET status = 'NEEDS_REVIEW', previous_status = 'AWAITING_APPROVAL' WHERE id = '${id(85)}';`);
  ok(db, guard(85, 'NEEDS_REVIEW', 'AWAITING_APPROVAL'));
  ok(db, `UPDATE editorial.jobs SET status = 'AWAITING_APPROVAL', previous_status = 'NEEDS_REVIEW',
    status_entered_at = now() WHERE id = '${id(85)}';`);
  fails(db, guard(85, 'AWAITING_APPROVAL', 'HUMAN_APPROVED'), /exige aprovação humana registrada/);
  ok(db, sign(85));
  ok(db, guard(85, 'AWAITING_APPROVAL', 'HUMAN_APPROVED'));
});

test('a rejected signature never opens the gate, even a fresh one', () => {
  ok(db, seed(86, 'AWAITING_APPROVAL'));
  ok(db, sign(86, 'rejected'));
  fails(db, guard(86, 'AWAITING_APPROVAL', 'HUMAN_APPROVED'), /exige aprovação humana registrada/);
});

test('human_reviewer is a separate role: no login, and n8n_pipeline is not a member', () => {
  assert.equal(ok(db, `SELECT rolcanlogin FROM pg_roles WHERE rolname = 'human_reviewer';`), 'f');
  assert.equal(ok(db, `SELECT pg_has_role('n8n_pipeline', 'human_reviewer', 'member'),
    pg_has_role('human_reviewer', 'n8n_pipeline', 'member');`), 'f|f');
});

test('human_reviewer signs a job that is awaiting approval, and the database sets id and signed_at', () => {
  ok(db, seed(90, 'AWAITING_APPROVAL'));
  ok(db, `INSERT INTO editorial.signatures (job_id, reviewer_name, crm_uf, decision, notes)
    VALUES ('${id(90)}', 'revisor sintético', 'RJ', 'approved', 'ok');`, { role: 'human_reviewer' });
  assert.equal(ok(db, `SELECT count(*) FROM editorial.signatures WHERE job_id = '${id(90)}'
    AND id IS NOT NULL AND signed_at IS NOT NULL;`), '1');
  ok(db, guard(90, 'AWAITING_APPROVAL', 'HUMAN_APPROVED'), { role: 'n8n_pipeline' });
});

test('human_reviewer cannot sign a job that is not awaiting approval, or forge id and signed_at', () => {
  ok(db, seed(91, 'QA_PASSED'));
  fails(db, `INSERT INTO editorial.signatures (job_id, reviewer_name, crm_uf, decision)
    VALUES ('${id(91)}', 'revisor sintético', 'SP', 'approved');`, /row-level security/, { role: 'human_reviewer' });
  fails(db, `INSERT INTO editorial.signatures (job_id, reviewer_name, crm_uf, decision, signed_at)
    VALUES ('${id(90)}', 'revisor sintético', 'SP', 'approved', '2099-01-01');`, /permission denied/, { role: 'human_reviewer' });
  fails(db, `INSERT INTO editorial.signatures (id, job_id, reviewer_name, crm_uf, decision)
    VALUES (gen_random_uuid(), '${id(90)}', 'revisor sintético', 'SP', 'approved');`, /permission denied/, { role: 'human_reviewer' });
});

test('human_reviewer can read jobs and signatures but cannot change them or touch anything else', () => {
  ok(db, `SELECT count(*) FROM editorial.jobs; SELECT count(*) FROM editorial.signatures;`, { role: 'human_reviewer' });
  fails(db, `UPDATE editorial.signatures SET notes = 'x';`, /permission denied/, { role: 'human_reviewer' });
  fails(db, `DELETE FROM editorial.signatures;`, /permission denied/, { role: 'human_reviewer' });
  fails(db, `UPDATE editorial.jobs SET status = 'PUBLISHED';`, /permission denied/, { role: 'human_reviewer' });
  fails(db, `SELECT count(*) FROM editorial.state_transitions;`, /permission denied/, { role: 'human_reviewer' });
  fails(db, guard(90, 'AWAITING_APPROVAL', 'HUMAN_APPROVED'), /permission denied/, { role: 'human_reviewer' });
});

test('n8n_pipeline still cannot write signatures or jobs', () => {
  fails(db, sign(90), /permission denied/, { role: 'n8n_pipeline' });
  fails(db, `UPDATE editorial.jobs SET status = 'PUBLISHED';`, /permission denied/, { role: 'n8n_pipeline' });
  fails(db, `UPDATE editorial.jobs SET attempt_count = 0;`, /permission denied/, { role: 'n8n_pipeline' });
});

test('guard_transition is SECURITY DEFINER with a fixed search_path', () => {
  const out = ok(db, `SELECT prosecdef, proconfig::text FROM pg_proc
    WHERE oid = 'editorial.guard_transition(uuid,text,text)'::regprocedure;`);
  assert.match(out, /^t\|/);
  assert.match(out, /search_path=pg_catalog, editorial, pg_temp/);
});

test('a role with no grants cannot run the guard', () => {
  ok('postgres', `CREATE ROLE plain_role_003 NOLOGIN;`);
  fails(db, guard(90, 'AWAITING_APPROVAL', 'HUMAN_APPROVED'), /permission denied/, { role: 'plain_role_003' });
});

test('anon and authenticated gain nothing from 003', () => {
  for (const role of h.SUPABASE_ROLES) {
    assert.equal(ok(db, `SELECT has_table_privilege('${role}', 'editorial.signatures', 'INSERT'),
      has_table_privilege('${role}', 'editorial.jobs', 'SELECT'),
      has_function_privilege('${role}', 'editorial.guard_transition(uuid,text,text)', 'EXECUTE');`), 'f|f|f', role);
  }
});
