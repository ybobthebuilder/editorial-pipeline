'use strict';

// Migration 005 tests: the jobs indexes exist, are valid and are used.
// Run with --test-concurrency=1 (see _harness.js).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const h = require('./_harness');

const { ok } = h;
let db;

before(() => {
  db = h.createDatabase('005');
});

after(() => {
  h.dropDatabase(db);
});

test('005 declares itself non-transactional and every index in it is CONCURRENTLY', () => {
  for (const path of [join(h.MIGRATIONS, '005_jobs_indexes.sql'), h.rollbackPath('005_jobs_indexes.sql')]) {
    const sql = readFileSync(path, 'utf8');
    assert.match(sql.split('\n')[0], /^-- non-transactional$/);
    const statements = sql.split('\n').filter((l) => /^\s*(CREATE|DROP)\s/i.test(l));
    assert.ok(statements.length >= 2);
    for (const line of statements) assert.match(line, /CONCURRENTLY/, line);
  }
});

test('the jobs indexes exist, are valid and ready', () => {
  const out = ok(db, `SELECT string_agg(c.relname || '=' || i.indisvalid || '/' || i.indisready, ',' ORDER BY c.relname)
    FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE i.indrelid = 'editorial.jobs'::regclass AND NOT i.indisprimary;`);
  assert.equal(out, 'jobs_last_execution_id_idx=true/true,jobs_status_idx=true/true');
});

test('every foreign key column in the editorial schema has an index', () => {
  const out = ok(db, `SELECT count(*) FROM pg_constraint c
    WHERE c.contype = 'f' AND c.connamespace = 'editorial'::regnamespace
      AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1]);`);
  assert.equal(out, '0');
});

test('queries by status and by last_execution_id use the indexes', () => {
  // A small table prefers a sequential scan; the planner is told not to, so the test checks
  // that the index can serve the query, not what it costs.
  const plan = (where) => ok(db, `SET enable_seqscan = off; EXPLAIN SELECT id FROM editorial.jobs WHERE ${where};`);
  assert.match(plan(`status = 'QA_PASSED'`), /jobs_status_idx/);
  assert.match(plan(`last_execution_id = 'e1'`), /jobs_last_execution_id_idx/);
});

test('reapplying 005 is safe', () => {
  h.applyUp(db, '005_jobs_indexes.sql');
  const out = ok(db, `SELECT count(*) FROM pg_indexes WHERE schemaname = 'editorial' AND tablename = 'jobs';`);
  assert.equal(out, '3'); // primary key and the two indexes
});
