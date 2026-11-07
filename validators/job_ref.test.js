'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { checkJobRef } = require('./job_ref.js');

const ROOT = join(__dirname, '..');
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const ROW = read('fixtures/synthetic/contracts/job_ref/valid-01.json');
const JOB = ROW.job_id;
const OTHER = '00000000-0000-4000-8000-000000000099';
const pages = (n) => Array.from({ length: n }, (_, i) => `texto da página ${i + 1}`);
const reasons = (...args) => checkJobRef(...args).errors.map((e) => e.reason);
const assets = (job_id) => ({ ...read('fixtures/synthetic/contracts/image_assets/valid-01.json'), job_id });

test('one row for the job, with a page_count equal to the stored pages, passes', () => {
  assert.deepEqual(checkJobRef(JOB, [ROW], pages(12)), { passed: true, errors: [] });
  assert.deepEqual(checkJobRef(JOB, [{ ...ROW, page_count: 1 }], pages(1)), { passed: true, errors: [] });
  assert.deepEqual(checkJobRef(JOB, [ROW], pages(12), [assets(JOB)]), { passed: true, errors: [] });
});

test('no row, or more than one row, for the job', () => {
  assert.deepEqual(checkJobRef(JOB, [], pages(12)).errors, [{ reason: 'job_ref_ausente' }]);
  assert.deepEqual(checkJobRef(JOB, [ROW, ROW], pages(12)).errors, [{ reason: 'job_ref_repetido' }]);
  assert.deepEqual(reasons(JOB, [ROW, ROW, ROW], pages(12)), ['job_ref_repetido'], 'reported once');
});

test('a row of another job is job_divergente, and its page_count is not judged against this job\'s pages', () => {
  assert.deepEqual(checkJobRef(JOB, [{ ...ROW, job_id: OTHER }], pages(12)).errors, [{ reason: 'job_divergente' }]);
  assert.deepEqual(reasons(JOB, [{ ...ROW, job_id: OTHER, page_count: 3 }], pages(12)), ['job_divergente']);
  assert.deepEqual(reasons(JOB, [ROW, { ...ROW, job_id: OTHER }], pages(12)), ['job_ref_repetido', 'job_divergente']);
});

test('page_count must be the number of stored page texts, more or fewer', () => {
  assert.deepEqual(checkJobRef(JOB, [ROW], pages(11)).errors, [{ reason: 'paginas_divergentes' }]);
  assert.deepEqual(checkJobRef(JOB, [ROW], pages(13)).errors, [{ reason: 'paginas_divergentes' }]);
  assert.deepEqual(checkJobRef(JOB, [ROW], []).errors, [{ reason: 'paginas_divergentes' }], 'no stored pages at all');
  assert.deepEqual(reasons(JOB, [ROW, { ...ROW }], pages(11)), ['job_ref_repetido', 'paginas_divergentes'], 'reported once');
});

test('an image_assets row of another job is refused; none at all is fine', () => {
  assert.deepEqual(checkJobRef(JOB, [ROW], pages(12), [assets(OTHER)]).errors, [{ reason: 'image_assets_de_outro_job' }]);
  assert.deepEqual(reasons(JOB, [ROW], pages(12), [assets(JOB), assets(OTHER)]), ['image_assets_de_outro_job']);
  assert.deepEqual(checkJobRef(JOB, [ROW], pages(12), []), { passed: true, errors: [] });
  assert.deepEqual(checkJobRef(JOB, [ROW], pages(12)), { passed: true, errors: [] });
});

test('all problems are reported in a fixed order; inputs are not changed; the output has no text', () => {
  const rows = [{ ...ROW, job_id: OTHER }, ROW, ROW];
  const stored = pages(3);
  const imgs = [assets(OTHER)];
  const before = JSON.stringify([rows, stored, imgs]);
  const first = checkJobRef(JOB, rows, stored, imgs);
  assert.deepEqual(first.errors.map((e) => e.reason), ['job_ref_repetido', 'job_divergente', 'paginas_divergentes', 'image_assets_de_outro_job']);
  assert.deepEqual(first, checkJobRef(JOB, rows, stored, imgs));
  assert.equal(JSON.stringify([rows, stored, imgs]), before);
  assert.doesNotMatch(JSON.stringify(first), /texto da página/);
});

test('passed is false whenever there is an error, true only with none', () => {
  assert.equal(checkJobRef(JOB, [ROW], pages(12)).passed, true);
  assert.equal(checkJobRef(JOB, [], pages(12)).passed, false);
  assert.equal(checkJobRef(JOB, [ROW], pages(3)).passed, false);
});

test('checkJobRef: bad arguments are a TypeError with their own message', () => {
  const cases = [
    [() => checkJobRef(5, [], []), /jobId must be a string/], [() => checkJobRef(JOB, null, []), /rows must be an array/],
    [() => checkJobRef(JOB, [], 'x'), /pages must be an array/], [() => checkJobRef(JOB, [], [], 'x'), /imageAssets must be an array/],
    [() => checkJobRef(JOB, [5], []), /rows\[0\] must be an object/], [() => checkJobRef(JOB, [{ job_id: 1 }], []), /rows\[0\]\.job_id must be a string/],
    [() => checkJobRef(JOB, [], [1]), /pages\[0\] must be a string/], [() => checkJobRef(JOB, [], ['a', null]), /pages\[1\] must be a string/],
    [() => checkJobRef(JOB, [], [], [5]), /imageAssets\[0\] must be an object/], [() => checkJobRef(JOB, [], [], [{ job_id: 1 }]), /imageAssets\[0\]\.job_id must be a string/],
  ];
  for (const [fn, message] of cases) assert.throws(fn, { name: 'TypeError', message }, String(message));
});
