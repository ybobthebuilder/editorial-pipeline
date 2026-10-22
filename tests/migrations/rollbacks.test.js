'use strict';

// Every migration has a rollback, and up -> down -> up restores the exact catalog state.
// The suite discovers supabase/migrations/*.sql, so a new migration without a rollback fails here.
// Run with --test-concurrency=1 (see _harness.js).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./_harness');

let db;
const migrations = h.listMigrations();

before(() => {
  db = h.createDatabase(null);
});

after(() => {
  h.dropDatabase(db);
});

for (const file of migrations) {
  test(`${file}: has a rollback, and up, down, up restores the catalog exactly`, () => {
    assert.ok(h.existsSync(h.rollbackPath(file)), `falta o rollback de ${file}`);
    const before = h.snapshot(db);
    h.applyUp(db, file);
    const applied = h.snapshot(db);
    assert.notEqual(applied, before, 'a migration não mudou nada');
    h.applyDown(db, file);
    assert.equal(h.snapshot(db), before, 'o rollback não devolveu o catálogo ao estado anterior');
    h.applyUp(db, file);
    assert.equal(h.snapshot(db), applied, 'reaplicar depois do rollback não reproduziu o estado');
  });
}

test('rolling back every migration in reverse order leaves an empty database', () => {
  for (const file of [...migrations].reverse()) h.applyDown(db, file);
  assert.equal(h.snapshot(db), '', 'sobrou objeto do projeto no banco');
});
