'use strict';

// Migration 007 tests: n8n_pipeline has no table privilege. It reads and writes only through
// SECURITY DEFINER functions, and the read functions take a key and return what it points to.
// Run with --test-concurrency=1 (see _harness.js).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const h = require('./_harness');

const { id, ok, fails } = h;
const N8N = { role: 'n8n_pipeline' };
const REVIEWER = { role: 'human_reviewer' };
const TABLES = ['state_transitions', 'config_baseline', 'jobs', 'signatures'];
const READ_FUNCTIONS = ['get_job(uuid)', 'get_job_status(uuid)', 'find_jobs_by_execution(text)'];
let db;

const seed = (n, status = 'RECEIVED') => `INSERT INTO editorial.jobs
  (id, status, source_origin, input_context, config_source, config_version)
  VALUES ('${id(n)}', '${status}', 'teste sintético', '{"paper": "sintético"}', 'public', 'v-teste');`;

before(() => {
  db = h.createDatabase('007');
});

after(() => {
  h.dropDatabase(db);
});

test('007 does not reference editorial_intel in executable SQL', () => {
  // Comments may name the private schema to explain the decision; statements may not.
  const code = readFileSync(join(h.MIGRATIONS, '007_n8n_least_privilege.sql'), 'utf8')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
  assert.equal(/editorial_intel/.test(code), false);
});

test('n8n_pipeline has no privilege on any table or column; it keeps USAGE on the schema and nothing else', () => {
  for (const table of TABLES) {
    assert.equal(ok(db, `SELECT string_agg(p, ',') FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
      WHERE has_table_privilege('n8n_pipeline', 'editorial.${table}', p);`), '', table);
    assert.equal(ok(db, `SELECT count(*) FROM pg_attribute a WHERE a.attrelid = 'editorial.${table}'::regclass AND a.attnum > 0
      AND NOT a.attisdropped AND (has_column_privilege('n8n_pipeline', a.attrelid, a.attnum, 'SELECT')
        OR has_column_privilege('n8n_pipeline', a.attrelid, a.attnum, 'INSERT')
        OR has_column_privilege('n8n_pipeline', a.attrelid, a.attnum, 'UPDATE'));`), '0', table);
  }
  assert.equal(ok(db, `SELECT has_schema_privilege('n8n_pipeline', 'editorial', 'USAGE'), has_schema_privilege('n8n_pipeline', 'editorial', 'CREATE');`), 't|f');
});

test('n8n_pipeline cannot read a table, so it cannot list jobs, signatures, transitions or configuration', () => {
  ok(db, seed(1));
  for (const table of TABLES) fails(db, `SELECT * FROM editorial.${table};`, new RegExp(`permission denied for table ${table}`), N8N);
  fails(db, `SELECT count(*) FROM editorial.jobs;`, /permission denied for table jobs/, N8N);
  fails(db, `SELECT id FROM editorial.jobs WHERE id = '${id(1)}';`, /permission denied for table jobs/, N8N);
  fails(db, `SELECT reviewer_name FROM editorial.signatures;`, /permission denied for table signatures/, N8N);
  fails(db, `EXPLAIN SELECT * FROM editorial.jobs;`, /permission denied for table jobs/, N8N);
});

test('no policy names n8n_pipeline any more; the read policy of editorial_owner on config_baseline exists', () => {
  assert.equal(ok(db, `SELECT count(*) FROM pg_policies WHERE schemaname = 'editorial' AND 'n8n_pipeline' = ANY(roles);`), '0');
  assert.equal(ok(db, `SELECT cmd || '|' || roles::text FROM pg_policies WHERE schemaname = 'editorial'
    AND policyname = 'config_baseline_read_owner';`), 'SELECT|{editorial_owner}');
});

test('the four read-side functions are SECURITY DEFINER, STABLE, pinned, owned by editorial_owner and executable by n8n_pipeline only', () => {
  const names = ['get_config(text)', ...READ_FUNCTIONS];
  for (const fn of names) {
    assert.equal(ok(db, `SELECT p.prosecdef::text || '|' || p.provolatile::text || '|' || pg_get_userbyid(p.proowner) || '|'
        || coalesce((SELECT substr(c, 13) FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'), '')
      FROM pg_proc p WHERE p.oid = 'editorial.${fn}'::regprocedure;`),
    'true|s|editorial_owner|pg_catalog, editorial, pg_temp', fn);
    assert.equal(ok(db, `SELECT has_function_privilege('n8n_pipeline', 'editorial.${fn}', 'EXECUTE'),
      has_function_privilege('human_reviewer', 'editorial.${fn}', 'EXECUTE'),
      has_function_privilege('public', 'editorial.${fn}', 'EXECUTE'),
      has_function_privilege('anon', 'editorial.${fn}', 'EXECUTE'),
      has_function_privilege('authenticated', 'editorial.${fn}', 'EXECUTE');`), 't|f|f|f|f', fn);
  }
});

test('get_config works for n8n_pipeline without any table privilege, and refuses a missing key', () => {
  ok(db, `INSERT INTO editorial.config_baseline (key, content, version, hash) VALUES ('scoring_weights', '{"a": 1}', 'v1', 'h1');`);
  const out = JSON.parse(ok(db, `SELECT editorial.get_config('scoring_weights');`, N8N));
  assert.deepEqual(out, { content: { a: 1 }, source: 'public', version: 'v1', hash: 'h1' });
  fails(db, `SELECT editorial.get_config('nao_existe');`, /configuração ausente: nao_existe/, N8N);
  fails(db, `SELECT editorial.get_config(NULL);`, /configuração ausente/, N8N);
});

test('get_job returns the whole context of one job, with exactly these columns', () => {
  ok(db, seed(2, 'PDF_PARSED'));
  ok(db, `SELECT editorial.mark_running('${id(2)}', '02_EXTRACT', 'exec-42');`, N8N);
  assert.equal(ok(db, `SELECT pg_get_function_result('editorial.get_job(uuid)'::regprocedure);`),
    'TABLE(id uuid, status text, created_at timestamp with time zone, updated_at timestamp with time zone, source_origin text, '
    + 'input_context jsonb, config_source text, config_version text, last_stage text, last_execution_id text, '
    + 'attempt_count integer, previous_status text, status_entered_at timestamp with time zone)');
  const row = ok(db, `SELECT id, status, source_origin, input_context::text, config_source, config_version, last_stage,
    last_execution_id, attempt_count, previous_status FROM editorial.get_job('${id(2)}');`, N8N);
  assert.equal(row, `${id(2)}|PDF_PARSED|teste sintético|{"paper": "sintético"}|public|v-teste|02_EXTRACT|exec-42|1|`);
  assert.equal(ok(db, `SELECT count(*) FROM editorial.get_job('${id(2)}');`, N8N), '1');
});

test('get_job and get_job_status ask for one job: an unknown or null id is an error, never an empty answer or a list', () => {
  ok(db, seed(3));
  ok(db, seed(4));
  for (const fn of ['editorial.get_job', 'editorial.get_job_status']) {
    fails(db, `SELECT * FROM ${fn}('${id(999)}');`, /job inexistente/, N8N);
    fails(db, `SELECT * FROM ${fn}(NULL);`, /job inexistente/, N8N);
  }
  assert.equal(ok(db, `SELECT editorial.get_job_status('${id(3)}');`, N8N), 'RECEIVED');
  assert.equal(ok(db, `SELECT count(*) FROM editorial.get_job('${id(3)}');`, N8N), '1');
});

test('get_job_status follows the status that set_status writes', () => {
  ok(db, seed(5));
  assert.equal(ok(db, `SELECT editorial.get_job_status('${id(5)}');`, N8N), 'RECEIVED');
  ok(db, `SELECT editorial.set_status('${id(5)}', 'PDF_PARSED');`, N8N);
  assert.equal(ok(db, `SELECT editorial.get_job_status('${id(5)}');`, N8N), 'PDF_PARSED');
  assert.equal(ok(db, `SELECT status || '|' || previous_status FROM editorial.get_job('${id(5)}');`, N8N), 'PDF_PARSED|RECEIVED');
});

test('find_jobs_by_execution returns none, one or several ids, newest first, and refuses an empty execution id', () => {
  ok(db, seed(6));
  ok(db, seed(7));
  ok(db, seed(8));
  ok(db, `SELECT editorial.mark_running('${id(6)}', '01_INGEST', 'exec-solo');`, N8N);
  assert.equal(ok(db, `SELECT editorial.find_jobs_by_execution('exec-solo');`, N8N), id(6));
  assert.equal(ok(db, `SELECT count(*) FROM editorial.find_jobs_by_execution('exec-nunca');`, N8N), '0');
  ok(db, `SELECT editorial.mark_running('${id(7)}', '01_INGEST', 'exec-lote');`, N8N);
  ok(db, `SELECT pg_sleep(0.05);`);
  ok(db, `SELECT editorial.mark_running('${id(8)}', '01_INGEST', 'exec-lote');`, N8N);
  assert.equal(ok(db, `SELECT string_agg(j::text, ',') FROM editorial.find_jobs_by_execution('exec-lote') j;`, N8N), `${id(8)},${id(7)}`);
  // exact match only: a prefix or a pattern finds nothing
  for (const probe of ['exec-', 'exec-%', 'exec-lot', '%']) {
    assert.equal(ok(db, `SELECT count(*) FROM editorial.find_jobs_by_execution('${probe}');`, N8N), '0', probe);
  }
  fails(db, `SELECT editorial.find_jobs_by_execution('   ');`, /execution_id é obrigatório/, N8N);
  fails(db, `SELECT editorial.find_jobs_by_execution('');`, /execution_id é obrigatório/, N8N);
  fails(db, `SELECT editorial.find_jobs_by_execution(NULL);`, /execution_id é obrigatório/, N8N);
});

test('the read functions write nothing: they run in a READ ONLY transaction', () => {
  ok(db, seed(9));
  ok(db, `BEGIN READ ONLY;
    SELECT editorial.get_job_status('${id(9)}');
    SELECT * FROM editorial.get_job('${id(9)}');
    SELECT * FROM editorial.find_jobs_by_execution('exec-lote');
    SELECT editorial.get_config('scoring_weights');
    COMMIT;`, N8N);
});

test('the read functions cannot be hijacked by temporary objects', () => {
  ok(db, seed(10));
  ok(db, `SELECT editorial.mark_running('${id(10)}', '01_INGEST', 'exec-hijack');`, N8N);
  // btrim and length are called unqualified inside find_jobs_by_execution.
  const out = ok(db, `CREATE FUNCTION pg_temp.btrim(text) RETURNS text LANGUAGE sql AS $f$ SELECT NULL::text $f$;
    CREATE FUNCTION pg_temp.length(text) RETURNS integer LANGUAGE sql AS $f$ SELECT 0 $f$;
    CREATE TEMP TABLE jobs (id uuid, status text, last_execution_id text);
    SELECT editorial.find_jobs_by_execution('exec-hijack');
    SELECT editorial.get_job_status('${id(10)}');`, N8N);
  assert.equal(out, `${id(10)}\nRECEIVED`);
});

test('human_reviewer is unchanged: it still reads jobs and signatures and cannot run the new functions', () => {
  ok(db, seed(11));
  assert.equal(ok(db, `SELECT count(*) FROM editorial.jobs WHERE id = '${id(11)}';`, REVIEWER), '1');
  assert.equal(ok(db, `SELECT count(*) FROM editorial.signatures;`, REVIEWER), '0');
  for (const call of [`editorial.get_job('${id(11)}')`, `editorial.get_job_status('${id(11)}')`, `editorial.find_jobs_by_execution('x')`, `editorial.get_config('scoring_weights')`]) {
    fails(db, `SELECT * FROM ${call};`, /permission denied for function/, REVIEWER);
  }
});

test('the write path of n8n_pipeline still works end to end without any table privilege', () => {
  const jobId = ok(db, `SELECT editorial.create_job('upload sintético', '{"k": 1}'::jsonb, 'public', 'v-base');`, N8N);
  assert.equal(ok(db, `SELECT editorial.get_job_status('${jobId}');`, N8N), 'RECEIVED');
  assert.equal(ok(db, `SELECT editorial.mark_running('${jobId}', '01_INGEST', 'exec-fim');`, N8N), '1');
  ok(db, `SELECT editorial.set_status('${jobId}', 'PDF_PARSED');`, N8N);
  assert.equal(ok(db, `SELECT status || '|' || last_stage || '|' || last_execution_id || '|' || attempt_count
    FROM editorial.get_job('${jobId}');`, N8N), 'PDF_PARSED|01_INGEST|exec-fim|0');
  assert.equal(ok(db, `SELECT editorial.find_jobs_by_execution('exec-fim');`, N8N), jobId);
});
