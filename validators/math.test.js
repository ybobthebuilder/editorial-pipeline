'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeDeltas } = require('./math.js');

test('worked example from CLAUDE.md section 3: 84 -> 92', () => {
  assert.deepEqual(computeDeltas(84, 92), { delta_absolute: 8, delta_relative: 9.52 });
});

test('decrease keeps the sign and rounds symmetrically', () => {
  assert.deepEqual(computeDeltas(92, 84), { delta_absolute: -8, delta_relative: -8.7 });
});

test('no change yields +0, never -0', () => {
  assert.deepEqual(computeDeltas(5, 5), { delta_absolute: 0, delta_relative: 0 });
  assert.deepEqual(computeDeltas(5.5, 5.5), { delta_absolute: 0, delta_relative: 0 });
});

test('a negative value that rounds to zero becomes +0, never -0', () => {
  assert.deepEqual(computeDeltas(100000, 99999.999), { delta_absolute: -0.001, delta_relative: 0 });
});

test('zero baseline: delta_relative is null, not invented', () => {
  assert.deepEqual(computeDeltas(0, 5), { delta_absolute: 5, delta_relative: null });
  assert.deepEqual(computeDeltas(0, 0), { delta_absolute: 0, delta_relative: null });
  assert.deepEqual(computeDeltas(-0, 3), { delta_absolute: 3, delta_relative: null });
});

test('floating-point noise does not leak into delta_absolute', () => {
  assert.deepEqual(computeDeltas(0.1, 0.3), { delta_absolute: 0.2, delta_relative: 200 });
});

test('reported precision is preserved', () => {
  assert.deepEqual(computeDeltas(84.25, 92.5), { delta_absolute: 8.25, delta_relative: 9.79 });
  assert.equal(computeDeltas(0.125, 0.5).delta_absolute, 0.375);
});

test('exponent notation is handled', () => {
  assert.equal(computeDeltas(1e-7, 3e-7).delta_absolute, 2e-7);
});

test('negative baseline: relative change is taken against the magnitude of before', () => {
  assert.deepEqual(computeDeltas(-10, -5), { delta_absolute: 5, delta_relative: 50 });
  assert.deepEqual(computeDeltas(-10, -15), { delta_absolute: -5, delta_relative: -50 });
});

test('non-number input is rejected, never coerced', () => {
  for (const bad of ['84', NaN, Infinity, -Infinity, null, undefined, {}, true]) {
    assert.throws(() => computeDeltas(bad, 92), TypeError);
    assert.throws(() => computeDeltas(84, bad), TypeError);
  }
});

test('non-representable delta is rejected', () => {
  assert.throws(() => computeDeltas(-Number.MAX_VALUE, Number.MAX_VALUE), RangeError);
});
