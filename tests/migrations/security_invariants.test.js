'use strict';

// Catalog-wide security invariants of the editorial schema, on a clean Postgres with EVERY migration
// applied. The per-migration suites check what each migration says; this one checks what the schema
// IS, so an object added by a later migration cannot slip past (a function without a pinned
// search_path, a table without RLS, a grant to PUBLIC, a foreign key without an index).
//
// The allowlists below are deliberate. A new function, policy, grant or table makes a test fail until
// the allowlist is edited in the same pull request: that edit is the review point.
// Run with --test-concurrency=1 (see _harness.js).
//
// Model (decision of 2026-10-22): one database per client, so there is no tenant column and no
// per-doctor isolation inside a database. n8n_pipeline holds no table privilege at all: it reaches the
// data only through SECURITY DEFINER functions that take a key and return what the key points to.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./_harness');

const { id, ok, fails } = h;
const N8N = { role: 'n8n_pipeline' };
const REVIEWER = { role: 'human_reviewer' };
const RUNTIME = ['n8n_pipeline', 'human_reviewer', 'editorial_owner'];
const OUTSIDERS = ['public', 'anon', 'authenticated'];
const PINNED = 'pg_catalog, editorial, pg_temp';
let db;

const lines = (sql) => {
  const out = ok(db, sql);
  return out === '' ? [] : out.split('\n');
};

before(() => {
  db = h.createDatabase(null);
  // Worst case of a Supabase-like platform: default privileges hand every new table and function to
  // PUBLIC, anon and authenticated. The REVOKEs in the migrations must undo that; on a bare Postgres
  // they would be dead code and no test could tell.
  ok(db, `ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO PUBLIC, anon, authenticated;
    ALTER DEFAULT PRIVILEGES GRANT ALL ON FUNCTIONS TO PUBLIC, anon, authenticated;`);
  // Every migration present, so a future 007 is covered without editing this file.
  for (const file of h.listMigrations()) h.applyUp(db, file);
  // 3,000 jobs and 3,000 signatures: enough for the planner to have statistics.
  ok(db, `INSERT INTO editorial.jobs (status, source_origin, input_context, config_source, config_version, last_stage, last_execution_id)
    SELECT (ARRAY['RECEIVED','PDF_PARSED','EVIDENCE_EXTRACTED','AWAITING_APPROVAL','PUBLISHED'])[1 + g % 5],
           'sintético', '{}'::jsonb, 'public', 'v-teste', '02_EXTRACT', 'exec-' || g
      FROM generate_series(1, 3000) g;
    INSERT INTO editorial.signatures (job_id, reviewer_name, crm_uf, decision)
    SELECT id, 'Revisor sintético', 'SP', 'approved' FROM editorial.jobs;
    ANALYZE editorial.jobs; ANALYZE editorial.signatures;`);
});

after(() => {
  h.dropDatabase(db, ['rls_probe']);
});

// ---- Row level security ---------------------------------------------------------------------

test('every relation of the schema has RLS on; a view must run with the privileges of its caller', () => {
  const rows = lines(`SELECT c.relname || '|' || c.relkind::text || '|' || c.relrowsecurity::text || '|' || coalesce(c.reloptions::text, '')
    FROM pg_class c WHERE c.relnamespace = 'editorial'::regnamespace AND c.relkind IN ('r','p','v','m','f') ORDER BY 1;`);
  assert.deepEqual(rows.filter((r) => /^[^|]+\|[rp]\|/.test(r)).map((r) => r.split('|').slice(0, 3).join('|')), [
    'config_baseline|r|true', 'jobs|r|true', 'signatures|r|true', 'state_transitions|r|true',
  ]);
  for (const row of rows) {
    const [name, kind, , options] = row.split('|');
    if (kind === 'v') assert.match(options, /security_invoker=true/, `view ${name} ignora o RLS das tabelas de origem`);
    else assert.match(kind, /^[rp]$/, `relação ${name} do tipo ${kind} não é permitida sem revisão`);
  }
});

test('RLS denies by default: a role with table grants and no policy sees no row', () => {
  ok(db, `CREATE ROLE rls_probe NOLOGIN;
    GRANT USAGE ON SCHEMA editorial TO rls_probe;
    GRANT SELECT ON editorial.jobs, editorial.signatures, editorial.state_transitions, editorial.config_baseline TO rls_probe;`);
  assert.equal(ok(db, 'SELECT count(*) FROM editorial.jobs;'), '3000');
  assert.equal(ok(db, `SELECT (SELECT count(*) FROM editorial.jobs) + (SELECT count(*) FROM editorial.signatures)
    + (SELECT count(*) FROM editorial.state_transitions);`, { role: 'rls_probe' }), '0');
});

test('the policies are exactly this inventory; PUBLIC, anon and authenticated have none', () => {
  const norm = (col) => `regexp_replace(coalesce(${col}, ''), '\\s+', ' ', 'g')`;
  const got = lines(`SELECT tablename || '|' || policyname || '|' || cmd || '|' || permissive || '|' || roles::text
      || '|' || ${norm('qual')} || '|' || ${norm('with_check')}
    FROM pg_policies WHERE schemaname = 'editorial' ORDER BY 1;`);
  const want = [
    'config_baseline|config_baseline_read_owner|SELECT|PERMISSIVE|{editorial_owner}|true|',
    'jobs|jobs_insert_owner|INSERT|PERMISSIVE|{editorial_owner}||((status = \'RECEIVED\'::text) AND (attempt_count = 0))',
    'jobs|jobs_read_human|SELECT|PERMISSIVE|{human_reviewer}|true|',
    'jobs|jobs_read_owner|SELECT|PERMISSIVE|{editorial_owner}|true|',
    'jobs|jobs_update_owner|UPDATE|PERMISSIVE|{editorial_owner}|true|true',
    'signatures|signatures_insert_human|INSERT|PERMISSIVE|{human_reviewer}||(EXISTS ( SELECT 1 FROM editorial.jobs j WHERE ((j.id = signatures.job_id) AND (j.status = \'AWAITING_APPROVAL\'::text))))',
    'signatures|signatures_read_human|SELECT|PERMISSIVE|{human_reviewer}|true|',
    'signatures|signatures_read_owner|SELECT|PERMISSIVE|{editorial_owner}|true|',
    'state_transitions|state_transitions_read_owner|SELECT|PERMISSIVE|{editorial_owner}|true|',
  ];
  assert.deepEqual(got, want);
});

// ---- Privileges -----------------------------------------------------------------------------

test('the privilege matrix on tables and columns is exactly this, and nothing reaches PUBLIC, anon or authenticated', () => {
  const roles = [...OUTSIDERS, ...RUNTIME].map((r) => `('${r}')`).join(',');
  const got = lines(`WITH roles(r) AS (VALUES ${roles}),
      tabs AS (SELECT c.oid, c.relname FROM pg_class c WHERE c.relnamespace = 'editorial'::regnamespace AND c.relkind IN ('r','p','v','m','f')),
      privs(p) AS (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'))
    SELECT line FROM (
      SELECT r || '|' || t.relname || '|' || p || '|*' AS line
        FROM roles, tabs t, privs WHERE has_table_privilege(r, t.oid, p)
      UNION ALL
      SELECT r || '|' || t.relname || '|' || p || '|' || a.attname
        FROM roles, tabs t, privs, pg_attribute a
       WHERE a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
         AND p IN ('SELECT','INSERT','UPDATE','REFERENCES')
         AND NOT has_table_privilege(r, t.oid, p) AND has_column_privilege(r, t.oid, a.attnum, p)
    ) s ORDER BY line;`);
  const col = (role, table, priv, cols) => cols.map((c) => `${role}|${table}|${priv}|${c}`);
  const want = [
    // n8n_pipeline has no line here: no privilege on any table or column. It reads and writes
    // only through functions.
    // human_reviewer reads two tables and inserts a signature in five columns: no id, no signed_at.
    'human_reviewer|jobs|SELECT|*', 'human_reviewer|signatures|SELECT|*',
    ...col('human_reviewer', 'signatures', 'INSERT', ['job_id', 'reviewer_name', 'crm_uf', 'decision', 'notes']),
    // editorial_owner owns the definer functions: the least that they need, no DELETE, no signature write.
    'editorial_owner|config_baseline|SELECT|*', 'editorial_owner|jobs|SELECT|*',
    'editorial_owner|signatures|SELECT|*', 'editorial_owner|state_transitions|SELECT|*',
    ...col('editorial_owner', 'jobs', 'INSERT', ['source_origin', 'input_context', 'config_source', 'config_version']),
    ...col('editorial_owner', 'jobs', 'UPDATE', ['status', 'previous_status', 'status_entered_at', 'updated_at',
      'attempt_count', 'last_stage', 'last_execution_id']),
  ].sort();
  assert.deepEqual(got, want);
});

test('schema privileges: USAGE for the three project roles only, CREATE for nobody', () => {
  const got = lines(`SELECT r || '|' || has_schema_privilege(r, 'editorial', 'USAGE') || '|' || has_schema_privilege(r, 'editorial', 'CREATE')
    FROM unnest(ARRAY['public','anon','authenticated','n8n_pipeline','human_reviewer','editorial_owner']) r;`);
  assert.deepEqual(got, ['public|false|false', 'anon|false|false', 'authenticated|false|false',
    'n8n_pipeline|true|false', 'human_reviewer|true|false', 'editorial_owner|true|false']);
});

test('the project roles are plain: no login, no superuser, no BYPASSRLS, no role or database creation, no replication', () => {
  const got = lines(`SELECT rolname || '|' || rolcanlogin::int::text || rolsuper::int::text || rolbypassrls::int::text
      || rolcreaterole::int::text || rolcreatedb::int::text || rolreplication::int::text
    FROM pg_roles WHERE rolname IN ('n8n_pipeline','human_reviewer','editorial_owner') ORDER BY 1;`);
  assert.deepEqual(got, ['editorial_owner|000000', 'human_reviewer|000000', 'n8n_pipeline|000000']);
});

test('no project role is a member of any role, and none of them owns a relation or the schema', () => {
  assert.equal(ok(db, `SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
    WHERE r.rolname IN ('n8n_pipeline','human_reviewer','editorial_owner','anon','authenticated');`), '0');
  assert.equal(ok(db, `SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid
    WHERE r.rolname IN ('n8n_pipeline','human_reviewer','editorial_owner')
      AND m.member <> (SELECT oid FROM pg_roles WHERE rolname = current_user);`), '0');
  assert.equal(ok(db, `SELECT count(*) FROM pg_class c WHERE c.relnamespace = 'editorial'::regnamespace
      AND pg_get_userbyid(c.relowner) IN ('n8n_pipeline','human_reviewer','editorial_owner','anon','authenticated');`), '0');
  assert.equal(ok(db, `SELECT pg_get_userbyid(nspowner) NOT IN ('n8n_pipeline','human_reviewer','editorial_owner','anon','authenticated')
    FROM pg_namespace WHERE nspname = 'editorial';`), 't');
});

// ---- Functions ------------------------------------------------------------------------------

test('every function is a SECURITY DEFINER of editorial_owner with a pinned search_path; EXECUTE goes to n8n_pipeline and the owner only', () => {
  const got = lines(`SELECT p.proname || '|' || p.prosecdef::text || '|' || pg_get_userbyid(p.proowner) || '|'
      || coalesce((SELECT substr(c, 13) FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'), '') || '|'
      || coalesce((SELECT string_agg(g, ',' ORDER BY g) FROM (
           SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS g
             FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.privilege_type = 'EXECUTE') x), '')
    FROM pg_proc p WHERE p.pronamespace = 'editorial'::regnamespace ORDER BY p.proname;`);
  const row = (name) => `${name}|true|editorial_owner|${PINNED}|editorial_owner,n8n_pipeline`;
  assert.deepEqual(got, [
    'create_job', 'find_jobs_by_execution', 'get_config', 'get_job', 'get_job_status',
    'guard_transition', 'mark_running', 'set_status',
  ].map(row));
});

test('search_path of the definers starts with pg_catalog, ends with pg_temp and has no public', () => {
  const paths = lines(`SELECT substr(c, 13) FROM pg_proc p, unnest(p.proconfig) c
    WHERE p.pronamespace = 'editorial'::regnamespace AND p.prosecdef AND c LIKE 'search_path=%';`);
  assert.equal(paths.length, 8);
  for (const path of paths) {
    const parts = path.split(',').map((s) => s.trim());
    assert.equal(parts[0], 'pg_catalog', path);
    assert.equal(parts[parts.length - 1], 'pg_temp', path);
    assert.equal(parts.includes('public'), false, path);
  }
});

test('temporary objects cannot hijack a SECURITY DEFINER function', () => {
  ok(db, `INSERT INTO editorial.jobs (id, status, source_origin, input_context, config_source, config_version)
    VALUES ('${id(1)}', 'RECEIVED', 'sintético', '{}', 'public', 'v-teste');`);
  // btrim and length are called unqualified inside mark_running. With pg_temp last in the path the
  // built-ins win; with pg_temp first these look-alikes would make the call fail.
  const out = ok(db, `CREATE FUNCTION pg_temp.btrim(text) RETURNS text LANGUAGE sql AS $f$ SELECT NULL::text $f$;
    CREATE FUNCTION pg_temp.length(text) RETURNS integer LANGUAGE sql AS $f$ SELECT 0 $f$;
    SELECT editorial.mark_running('${id(1)}', '02_EXTRACT', 'exec-hijack');`, N8N);
  assert.equal(out, '1');
});

// ---- What the runtime roles cannot do -------------------------------------------------------

test('n8n_pipeline reads no table at all: not a row, not a count, not a plan', () => {
  for (const table of ['state_transitions', 'config_baseline', 'jobs', 'signatures']) {
    fails(db, `SELECT * FROM editorial.${table};`, new RegExp(`permission denied for table ${table}`), N8N);
  }
  fails(db, 'SELECT count(*) FROM editorial.jobs;', /permission denied for table jobs/, N8N);
  fails(db, 'EXPLAIN SELECT 1 FROM editorial.signatures;', /permission denied for table signatures/, N8N);
});

test('the runtime roles cannot escalate; n8n_pipeline cannot alter the schema, rewrite a function or write a table', () => {
  // SET ROLE is authorized by the session user, which is a superuser here; SET SESSION AUTHORIZATION
  // makes the session a real n8n_pipeline session before the attempt.
  const asSession = (role, sql) => `SET SESSION AUTHORIZATION ${role};\n${sql}`;
  fails(db, asSession('n8n_pipeline', 'SET ROLE editorial_owner;'), /permission denied to set role/);
  fails(db, asSession('n8n_pipeline', 'SET ROLE human_reviewer;'), /permission denied to set role/);
  fails(db, asSession('human_reviewer', 'SET ROLE n8n_pipeline;'), /permission denied to set role/);
  fails(db, asSession('human_reviewer', 'SET ROLE editorial_owner;'), /permission denied to set role/);
  fails(db, 'CREATE TABLE editorial.pwn (x int);', /permission denied for schema editorial/, N8N);
  fails(db, `CREATE OR REPLACE FUNCTION editorial.guard_transition(uuid, text, text) RETURNS void
    LANGUAGE sql AS 'SELECT';`, /permission denied for schema editorial/, N8N);
  fails(db, 'ALTER FUNCTION editorial.guard_transition(uuid, text, text) SECURITY INVOKER;', /must be owner of function/, N8N);
  fails(db, "UPDATE editorial.jobs SET status = 'PUBLISHED';", /permission denied for table jobs/, N8N);
  fails(db, 'DELETE FROM editorial.jobs;', /permission denied for table jobs/, N8N);
  fails(db, 'TRUNCATE editorial.jobs;', /permission denied for table jobs/, N8N);
  fails(db, `INSERT INTO editorial.signatures (job_id, reviewer_name, crm_uf, decision)
    VALUES ('${id(1)}', 'forjada', 'SP', 'approved');`, /permission denied for table signatures/, N8N);
  fails(db, "UPDATE editorial.state_transitions SET requires_gate = false;", /permission denied for table state_transitions/, N8N);
  fails(db, "UPDATE editorial.config_baseline SET content = '{}';", /permission denied for table config_baseline/, N8N);
});

test('human_reviewer signs and reads; it cannot change a signature, run a function or touch the configuration', () => {
  fails(db, `UPDATE editorial.signatures SET decision = 'approved';`, /permission denied for table signatures/, REVIEWER);
  fails(db, 'DELETE FROM editorial.signatures;', /permission denied for table signatures/, REVIEWER);
  fails(db, `INSERT INTO editorial.signatures (job_id, reviewer_name, crm_uf, decision, signed_at)
    VALUES ('${id(1)}', 'x', 'SP', 'approved', now());`, /permission denied for table signatures/, REVIEWER);
  fails(db, `INSERT INTO editorial.signatures (id, job_id, reviewer_name, crm_uf, decision)
    VALUES (gen_random_uuid(), '${id(1)}', 'x', 'SP', 'approved');`, /permission denied for table signatures/, REVIEWER);
  fails(db, `SELECT editorial.set_status('${id(1)}', 'PDF_PARSED');`, /permission denied for function set_status/, REVIEWER);
  fails(db, `SELECT editorial.guard_transition('${id(1)}', 'RECEIVED', 'PDF_PARSED');`, /permission denied for function guard_transition/, REVIEWER);
  fails(db, `SELECT editorial.create_job('x', '{}'::jsonb, 'public', 'v');`, /permission denied for function create_job/, REVIEWER);
  fails(db, 'SELECT * FROM editorial.config_baseline;', /permission denied for table config_baseline/, REVIEWER);
  fails(db, 'SELECT * FROM editorial.state_transitions;', /permission denied for table state_transitions/, REVIEWER);
  // RLS: a signature for a job that is not waiting for approval is refused.
  fails(db, `INSERT INTO editorial.signatures (job_id, reviewer_name, crm_uf, decision)
    VALUES ('${id(1)}', 'x', 'SP', 'approved');`, /row-level security policy/, REVIEWER);
});

test('anon and authenticated reach nothing in the schema', () => {
  for (const role of ['anon', 'authenticated']) {
    fails(db, 'SELECT 1 FROM editorial.jobs;', /permission denied for schema editorial/, { role });
    fails(db, "SELECT editorial.get_config('scoring_weights');", /permission denied for schema editorial/, { role });
    fails(db, `SELECT editorial.set_status('${id(1)}', 'PDF_PARSED');`, /permission denied for schema editorial/, { role });
  }
});

// ---- Indexes --------------------------------------------------------------------------------

test('every foreign key has a valid index that starts with its columns', () => {
  assert.equal(ok(db, `SELECT count(*) FROM pg_constraint con
    WHERE con.contype = 'f' AND con.connamespace = 'editorial'::regnamespace
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
         WHERE i.indrelid = con.conrelid AND i.indisvalid AND i.indisready AND i.indpred IS NULL
           AND (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(con.conkey)] = con.conkey);`), '0');
  assert.equal(ok(db, `SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND connamespace = 'editorial'::regnamespace;`), '1');
});

test('jobs has valid indexes on status and, partial, on last_execution_id; no index is left INVALID', () => {
  assert.equal(ok(db, `SELECT count(*) FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
    JOIN pg_am am ON am.oid = ic.relam
    WHERE i.indrelid = 'editorial.jobs'::regclass AND i.indisvalid AND i.indisready AND i.indpred IS NULL
      AND am.amname = 'btree'
      AND i.indkey[0] = (SELECT attnum FROM pg_attribute WHERE attrelid = 'editorial.jobs'::regclass AND attname = 'status');`), '1');
  assert.equal(ok(db, `SELECT pg_get_expr(i.indpred, i.indrelid) FROM pg_index i
    WHERE i.indrelid = 'editorial.jobs'::regclass AND i.indisvalid AND i.indisready
      AND i.indkey[0] = (SELECT attnum FROM pg_attribute WHERE attrelid = 'editorial.jobs'::regclass AND attname = 'last_execution_id');`),
  '(last_execution_id IS NOT NULL)');
  assert.equal(ok(db, `SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
    WHERE c.relnamespace = 'editorial'::regnamespace AND NOT (i.indisvalid AND i.indisready);`), '0');
});

test('the hot queries can use their index, even with sequential scans discouraged and RLS in force', () => {
  const plan = (role, query) => ok(db, `SET enable_seqscan = off;\nEXPLAIN (COSTS OFF) ${query}`, { role });
  // The read functions run as editorial_owner, so the plans are checked as that role.
  // orchestrator and Guard: the jobs waiting in a stage
  assert.match(plan('editorial_owner', "SELECT id FROM editorial.jobs WHERE status = 'PDF_PARSED' LIMIT 50;"), /jobs_status_idx/);
  // approval queue of the reviewer, who reads the table directly
  assert.match(plan('human_reviewer', "SELECT id FROM editorial.jobs WHERE status = 'AWAITING_APPROVAL' ORDER BY created_at LIMIT 50;"), /jobs_status_idx/);
  // find_jobs_by_execution, for 99_ERROR_HANDLER
  assert.match(plan('editorial_owner', "SELECT id FROM editorial.jobs WHERE last_execution_id = 'exec-1234';"), /jobs_last_execution_id_idx/);
  // the gate in guard_transition
  assert.match(plan('editorial_owner', `SELECT 1 FROM editorial.signatures s WHERE s.job_id = '${id(1)}' AND s.decision = 'approved';`), /signatures_job_id_idx/);
});
