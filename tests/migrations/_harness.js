'use strict';

// Shared helpers for migration tests that need a clean Postgres. The file name starts with an
// underscore so the *.test.js glob never runs it as a suite.
//
// Every suite using this harness creates cluster-wide roles. Run them with
// --test-concurrency=1, otherwise two suites collide on CREATE ROLE anon.

const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { existsSync, readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');

if (!process.env.PGHOST) {
  throw new Error('PGHOST não definido: os testes de migração exigem um Postgres limpo. Não há pulo silencioso.');
}

const ROOT = join(__dirname, '..', '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const ROLLBACKS = join(ROOT, 'supabase', 'rollbacks');
const SUPABASE_ROLES = ['anon', 'authenticated'];
const PROJECT_ROLES = ['n8n_pipeline', 'human_reviewer'];
const CLEAN_ROLES = [...PROJECT_ROLES, ...SUPABASE_ROLES];

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

function listMigrations() {
  return readdirSync(MIGRATIONS).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
}

const rollbackPath = (file) => join(ROLLBACKS, file.replace(/\.sql$/, '.down.sql'));

// A script that declares `-- non-transactional` in its first lines (CREATE INDEX CONCURRENTLY
// cannot run inside a transaction block) is applied without psql -1.
function isNonTransactional(path) {
  return /^-- non-transactional$/m.test(readFileSync(path, 'utf8').split('\n').slice(0, 10).join('\n'));
}

function runFile(db, path) {
  const args = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ...(isNonTransactional(path) ? [] : ['-1']), '-d', db, '-f', path];
  const result = spawnSync('psql', args, { encoding: 'utf8' });
  assert.equal(result.status, 0, `${path} falhou: ${result.stderr}`);
}

const applyUp = (db, file) => runFile(db, join(MIGRATIONS, file));
const applyDown = (db, file) => runFile(db, rollbackPath(file));

// Creates the Supabase roles and a fresh database, then applies every migration whose
// three-digit prefix is <= upTo. upTo = null applies none.
function createDatabase(upTo) {
  for (const name of CLEAN_ROLES) {
    assert.equal(roleExists(name), false, `cluster não está limpo: papel ${name} já existe`);
  }
  ok('postgres', SUPABASE_ROLES.map((r) => `CREATE ROLE ${r} NOLOGIN;`).join('\n'));
  const db = `editorial_migration_test_${randomBytes(4).toString('hex')}`;
  ok('postgres', `CREATE DATABASE ${db};`);
  if (upTo) {
    for (const file of listMigrations()) {
      if (file.slice(0, 3) <= upTo) applyUp(db, file);
    }
  }
  return db;
}

function dropDatabase(db, extraRoles = []) {
  spawnSync('psql', ['-X', '-q', '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${db} WITH (FORCE);`], { encoding: 'utf8' });
  for (const role of [...extraRoles, ...CLEAN_ROLES]) {
    spawnSync('psql', ['-X', '-q', '-d', 'postgres', '-c', `DROP ROLE IF EXISTS ${role};`], { encoding: 'utf8' });
  }
}

// Text image of everything a migration can change in the editorial schema: columns,
// constraints, indexes, functions (body, security, search_path, ACL), policies, table and
// column ACLs, schema ACL, project roles and the state_transitions rows. Two equal images
// mean the catalog is the same.
function snapshot(db) {
  const ns = `(SELECT oid FROM pg_namespace WHERE nspname = 'editorial')`;
  const roles = PROJECT_ROLES.map((r) => `'${r}'`).join(', ');
  const catalog = `SELECT line FROM (
    SELECT 'col|' || c.relname || '|' || a.attname || '|' || format_type(a.atttypid, a.atttypmod) || '|' || a.attnotnull
           || '|' || coalesce(pg_get_expr(d.adbin, d.adrelid), '') AS line
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE c.relnamespace = ${ns} AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
    UNION ALL
    SELECT 'attacl|' || c.relname || '|' || a.attname || '|' || a.attacl::text
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
     WHERE c.relnamespace = ${ns} AND a.attacl IS NOT NULL
    UNION ALL
    SELECT 'con|' || conrelid::regclass::text || '|' || conname || '|' || convalidated || '|' || pg_get_constraintdef(oid)
      FROM pg_constraint WHERE connamespace = ${ns}
    UNION ALL
    SELECT 'idx|' || i.indexrelid::regclass::text || '|' || i.indisvalid || '|' || pg_get_indexdef(i.indexrelid)
      FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid WHERE c.relnamespace = ${ns}
    UNION ALL
    SELECT 'fn|' || p.oid::regprocedure::text || '|' || p.prosecdef || '|' || coalesce(p.proconfig::text, '')
           || '|' || coalesce(p.proacl::text, '') || '|' || pg_get_functiondef(p.oid)
      FROM pg_proc p WHERE p.pronamespace = ${ns}
    UNION ALL
    SELECT 'pol|' || tablename || '|' || policyname || '|' || cmd || '|' || roles::text
           || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')
      FROM pg_policies WHERE schemaname = 'editorial'
    UNION ALL
    SELECT 'rel|' || c.relname || '|' || c.relrowsecurity || '|' || coalesce(c.relacl::text, '')
      FROM pg_class c WHERE c.relnamespace = ${ns} AND c.relkind = 'r'
    UNION ALL
    SELECT 'ns|' || coalesce(nspacl::text, '') FROM pg_namespace WHERE nspname = 'editorial'
    UNION ALL
    SELECT 'role|' || rolname || '|' || rolcanlogin FROM pg_roles WHERE rolname IN (${roles})
  ) s ORDER BY line;`;
  let image = ok(db, catalog);
  if (ok(db, `SELECT to_regclass('editorial.state_transitions') IS NOT NULL;`) === 't') {
    image += '\n' + ok(db, `SELECT 'row|' || from_status || '|' || to_status || '|' || is_error_path || '|' || requires_gate
      FROM editorial.state_transitions ORDER BY 1;`);
  }
  return image;
}

module.exports = {
  MIGRATIONS, ROLLBACKS, SUPABASE_ROLES, PROJECT_ROLES, CLEAN_ROLES,
  id, psql, ok, fails, roleExists, listMigrations, rollbackPath, existsSync,
  applyUp, applyDown, createDatabase, dropDatabase, snapshot,
};
