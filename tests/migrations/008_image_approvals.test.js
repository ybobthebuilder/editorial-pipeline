'use strict';

// Migration 008 tests: the human approval of an own photo is a row that only human_reviewer writes,
// and n8n_pipeline reads it through get_image_approvals. Run with --test-concurrency=1 (see _harness.js).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const h = require('./_harness');

const { id, ok, fails } = h;
const N8N = { role: 'n8n_pipeline' };
const REVIEWER = { role: 'human_reviewer' };
const JUSTIFICATION = 'Foto da fachada do consultorio, sem pessoas.';
let db;

const seed = (n, status = 'RECEIVED') => `INSERT INTO editorial.jobs
  (id, status, source_origin, input_context, config_source, config_version)
  VALUES ('${id(n)}', '${status}', 'teste sintético', '{}', 'public', 'v-teste');`;

const approve = (job, ref, { subject = 'none', justification = JUSTIFICATION, reviewer = 'Revisor sintético' } = {}) =>
  `INSERT INTO editorial.image_approvals (job_id, ref, subject, justification, reviewer_name)
   VALUES ('${id(job)}', '${ref}', '${subject}', '${justification}', '${reviewer}');`;

before(() => {
  db = h.createDatabase('008');
  ok(db, seed(1));
  ok(db, seed(2));
});

after(() => {
  h.dropDatabase(db);
});

test('008 does not reference editorial_intel in executable SQL', () => {
  const code = readFileSync(join(h.MIGRATIONS, '008_image_approvals.sql'), 'utf8')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
  assert.equal(/editorial_intel/.test(code), false);
});

test('the table has these columns, RLS on, one approval per (job, image) and a foreign key to jobs', () => {
  assert.equal(ok(db, `SELECT string_agg(attname || ':' || format_type(atttypid, atttypmod) || ':' || attnotnull, ',' ORDER BY attnum)
    FROM pg_attribute WHERE attrelid = 'editorial.image_approvals'::regclass AND attnum > 0 AND NOT attisdropped;`),
  'id:uuid:true,job_id:uuid:true,ref:text:true,subject:text:true,justification:text:true,reviewer_name:text:true,signed_at:timestamp with time zone:true');
  assert.equal(ok(db, `SELECT relrowsecurity FROM pg_class WHERE oid = 'editorial.image_approvals'::regclass;`), 't');
  assert.equal(ok(db, `SELECT string_agg(contype::text || ':' || pg_get_constraintdef(oid), ' ; ' ORDER BY contype::text, conname)
    FROM pg_constraint WHERE conrelid = 'editorial.image_approvals'::regclass AND contype IN ('u', 'f');`),
  'f:FOREIGN KEY (job_id) REFERENCES editorial.jobs(id) ; u:UNIQUE (job_id, ref)');
});

test('human_reviewer records an approval; id and signed_at come from the database', () => {
  assert.equal(ok(db, approve(1, 'img://job-0001/2'), REVIEWER), '');
  assert.equal(ok(db, `SELECT job_id || '|' || ref || '|' || subject || '|' || reviewer_name || '|' || (id IS NOT NULL) || '|' || (signed_at <= now())
    FROM editorial.image_approvals;`, REVIEWER), `${id(1)}|img://job-0001/2|none|Revisor sintético|true|true`);
  // The same approval for the same image of the same job is refused; another image or another job is fine.
  fails(db, approve(1, 'img://job-0001/2'), /image_approvals_job_ref_key/, REVIEWER);
  ok(db, approve(1, 'img://job-0001/3', { subject: 'person_not_patient' }), REVIEWER);
  ok(db, approve(2, 'img://job-0001/2'), REVIEWER);
});

test('an approval is refused when the job does not exist', () => {
  fails(db, approve(999, 'img://job-0999/0'), /row-level security policy|foreign key/, REVIEWER);
});

test('the database never stores an approval of a clinical or unknown subject', () => {
  for (const subject of ['patient', 'before_after', 'exam', 'unknown', '', 'None', 'none ']) {
    fails(db, approve(1, 'img://job-0001/9', { subject }), /image_approvals_subject_check/, REVIEWER);
  }
  assert.equal(ok(db, `SELECT count(*) FROM editorial.image_approvals WHERE ref = 'img://job-0001/9';`, REVIEWER), '0');
});

test('ref, justification and reviewer_name are validated by the table', () => {
  for (const ref of ['', 'img://', 'job-0001/2', 'http://job-0001/2', 'img://job 0001/2', 'img://job-0001/ç', 'IMG://job-0001/2', 'xximg://job-0001/2', 'http://img://job-0001/2', 'img://job-0001/2\nx']) {
    fails(db, approve(1, ref), /image_approvals_ref_check/, REVIEWER);
  }
  // 19 characters, then 20 padded with spaces to look longer, then blank.
  fails(db, approve(1, 'img://job-0001/4', { justification: 'sem pessoas na foto' }), /image_approvals_justification_check/, REVIEWER);
  fails(db, approve(1, 'img://job-0001/4', { justification: `   ${'x'.repeat(19)}   ` }), /image_approvals_justification_check/, REVIEWER);
  fails(db, approve(1, 'img://job-0001/4', { justification: '                         ' }), /image_approvals_justification_check/, REVIEWER);
  ok(db, approve(1, 'img://job-0001/4', { justification: 'x'.repeat(20) }), REVIEWER);
  fails(db, approve(1, 'img://job-0001/5', { reviewer: '   ' }), /image_approvals_reviewer_name_check/, REVIEWER);
  fails(db, approve(1, 'img://job-0001/5', { reviewer: '' }), /image_approvals_reviewer_name_check/, REVIEWER);
});

test('human_reviewer cannot choose id or signed_at, change an approval, delete it or truncate the table', () => {
  fails(db, `INSERT INTO editorial.image_approvals (id, job_id, ref, subject, justification, reviewer_name)
    VALUES (gen_random_uuid(), '${id(1)}', 'img://job-0001/6', 'none', '${JUSTIFICATION}', 'x');`, /permission denied for table image_approvals/, REVIEWER);
  fails(db, `INSERT INTO editorial.image_approvals (job_id, ref, subject, justification, reviewer_name, signed_at)
    VALUES ('${id(1)}', 'img://job-0001/6', 'none', '${JUSTIFICATION}', 'x', now());`, /permission denied for table image_approvals/, REVIEWER);
  fails(db, `UPDATE editorial.image_approvals SET subject = 'person_not_patient';`, /permission denied for table image_approvals/, REVIEWER);
  fails(db, `UPDATE editorial.image_approvals SET justification = repeat('y', 30);`, /permission denied for table image_approvals/, REVIEWER);
  fails(db, `DELETE FROM editorial.image_approvals;`, /permission denied for table image_approvals/, REVIEWER);
  fails(db, `TRUNCATE editorial.image_approvals;`, /permission denied for table image_approvals/, REVIEWER);
});

test('n8n_pipeline cannot read or write the table, so it cannot forge an approval', () => {
  assert.equal(ok(db, `SELECT string_agg(p, ',') FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
    WHERE has_table_privilege('n8n_pipeline', 'editorial.image_approvals', p);`), '');
  assert.equal(ok(db, `SELECT count(*) FROM pg_attribute a WHERE a.attrelid = 'editorial.image_approvals'::regclass AND a.attnum > 0
    AND NOT a.attisdropped AND (has_column_privilege('n8n_pipeline', a.attrelid, a.attnum, 'SELECT')
      OR has_column_privilege('n8n_pipeline', a.attrelid, a.attnum, 'INSERT')
      OR has_column_privilege('n8n_pipeline', a.attrelid, a.attnum, 'UPDATE'));`), '0');
  fails(db, `SELECT * FROM editorial.image_approvals;`, /permission denied for table image_approvals/, N8N);
  fails(db, approve(1, 'img://job-0001/7'), /permission denied for table image_approvals/, N8N);
  fails(db, `UPDATE editorial.image_approvals SET subject = 'none';`, /permission denied for table image_approvals/, N8N);
  fails(db, `DELETE FROM editorial.image_approvals;`, /permission denied for table image_approvals/, N8N);
});

test('anon, authenticated and PUBLIC have no privilege on the table, and only the three policies exist', () => {
  for (const role of ['anon', 'authenticated', 'public']) {
    assert.equal(ok(db, `SELECT string_agg(p, ',') FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
      WHERE has_table_privilege('${role}', 'editorial.image_approvals', p);`), '', role);
  }
  assert.equal(ok(db, `SELECT string_agg(policyname || ':' || cmd || ':' || roles::text, ' ; ' ORDER BY policyname)
    FROM pg_policies WHERE schemaname = 'editorial' AND tablename = 'image_approvals';`),
  'image_approvals_insert_human:INSERT:{human_reviewer} ; image_approvals_read_human:SELECT:{human_reviewer} ; image_approvals_read_owner:SELECT:{editorial_owner}');
});

test('get_image_approvals is SECURITY DEFINER, STABLE, pinned, owned by editorial_owner and executable by n8n_pipeline only', () => {
  assert.equal(ok(db, `SELECT p.prosecdef::text || '|' || p.provolatile::text || '|' || pg_get_userbyid(p.proowner) || '|'
      || coalesce((SELECT substr(c, 13) FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'), '')
    FROM pg_proc p WHERE p.oid = 'editorial.get_image_approvals(uuid)'::regprocedure;`),
  'true|s|editorial_owner|pg_catalog, editorial, pg_temp');
  assert.equal(ok(db, `SELECT has_function_privilege('n8n_pipeline', 'editorial.get_image_approvals(uuid)', 'EXECUTE'),
    has_function_privilege('human_reviewer', 'editorial.get_image_approvals(uuid)', 'EXECUTE'),
    has_function_privilege('public', 'editorial.get_image_approvals(uuid)', 'EXECUTE'),
    has_function_privilege('anon', 'editorial.get_image_approvals(uuid)', 'EXECUTE'),
    has_function_privilege('authenticated', 'editorial.get_image_approvals(uuid)', 'EXECUTE');`), 't|f|f|f|f');
});

test('get_image_approvals gives n8n_pipeline the approvals of one job, without the justification or the reviewer', () => {
  assert.equal(ok(db, `SELECT pg_get_function_result('editorial.get_image_approvals(uuid)'::regprocedure);`),
    'TABLE(id uuid, job_id uuid, ref text, subject text, signed_at timestamp with time zone)');
  const rows = ok(db, `SELECT job_id || '|' || ref || '|' || subject FROM editorial.get_image_approvals('${id(1)}');`, N8N).split('\n');
  assert.deepEqual(rows, [
    `${id(1)}|img://job-0001/2|none`,
    `${id(1)}|img://job-0001/3|person_not_patient`,
    `${id(1)}|img://job-0001/4|none`,
  ]);
  // Job 2 has its own, and the two never mix.
  assert.equal(ok(db, `SELECT job_id || '|' || ref FROM editorial.get_image_approvals('${id(2)}');`, N8N), `${id(2)}|img://job-0001/2`);
  // The id is the one the payload will carry.
  assert.equal(ok(db, `SELECT count(*) FROM editorial.get_image_approvals('${id(1)}') f
    JOIN editorial.image_approvals a ON a.id = f.id;`), '3');
});

test('get_image_approvals: a job without approvals gives no row; an unknown or null job is an error', () => {
  ok(db, seed(3));
  assert.equal(ok(db, `SELECT count(*) FROM editorial.get_image_approvals('${id(3)}');`, N8N), '0');
  fails(db, `SELECT * FROM editorial.get_image_approvals('${id(999)}');`, /job inexistente/, N8N);
  fails(db, `SELECT * FROM editorial.get_image_approvals(NULL);`, /job inexistente/, N8N);
});

test('get_image_approvals works in a read-only transaction', () => {
  assert.equal(ok(db, `BEGIN READ ONLY; SELECT count(*) FROM editorial.get_image_approvals('${id(1)}'); COMMIT;`, N8N), '3');
});

test('an image approval does not satisfy the human gate: the signature table is the only key to HUMAN_APPROVED', () => {
  ok(db, seed(4, 'AWAITING_APPROVAL'));
  ok(db, approve(4, 'img://job-0004/0'), REVIEWER);
  fails(db, `SELECT editorial.set_status('${id(4)}', 'HUMAN_APPROVED');`, /transição exige aprovação humana registrada/, N8N);
  assert.equal(ok(db, `SELECT status FROM editorial.get_job('${id(4)}');`, N8N), 'AWAITING_APPROVAL');
  // And the reverse: a gate signature is not an image approval.
  ok(db, `INSERT INTO editorial.signatures (job_id, reviewer_name, crm_uf, decision) VALUES ('${id(4)}', 'Revisor sintético', 'SP', 'approved');`, REVIEWER);
  assert.equal(ok(db, `SELECT count(*) FROM editorial.get_image_approvals('${id(4)}');`, N8N), '1');
  ok(db, `SELECT editorial.set_status('${id(4)}', 'HUMAN_APPROVED');`, N8N);
});

test('the rollback removes the function and the table, and 008 applies again afterwards', () => {
  h.applyDown(db, '008_image_approvals.sql');
  assert.equal(ok(db, `SELECT to_regclass('editorial.image_approvals') IS NULL, to_regprocedure('editorial.get_image_approvals(uuid)') IS NULL;`), 't|t');
  h.applyUp(db, '008_image_approvals.sql');
  assert.equal(ok(db, `SELECT count(*) FROM editorial.image_approvals;`, REVIEWER), '0');
  assert.equal(ok(db, `SELECT count(*) FROM editorial.get_image_approvals('${id(1)}');`, N8N), '0');
});
