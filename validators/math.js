'use strict';

// Deterministic delta math. CLAUDE.md §3: the LLM extracts the raw numbers,
// code computes the deltas. Pure JS, no dependencies (n8n Cloud compatible).
//
// Units are the caller's concern: for percentage inputs, delta_absolute is in
// percentage points and delta_relative is the relative change in percent.

function assertFiniteNumber(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    const received = typeof value === 'number' ? String(value) : typeof value;
    throw new TypeError(`${name} must be a finite number, received ${received}`);
  }
}

// Decimal places of the shortest round-trip representation of n.
function decimalPlaces(n) {
  const [mantissa, exponent] = String(n).split('e');
  const fraction = (mantissa.split('.')[1] || '').length;
  return Math.max(0, fraction - (exponent ? Number(exponent) : 0));
}

function roundHalfAwayFromZero(n, places) {
  const factor = 10 ** places;
  const rounded = Math.round(Math.abs(n) * factor) / factor;
  if (rounded === 0) return 0;
  return n < 0 ? -rounded : rounded;
}

// delta_absolute = after - before, rounded to the finer precision of the two
// inputs so floating-point noise (0.3 - 0.1) never reaches the database.
// delta_relative = (after - before) / |before| * 100, rounded to 2 decimals;
// null when before is 0 (undefined, never invented).
function computeDeltas(before, after) {
  assertFiniteNumber('before', before);
  assertFiniteNumber('after', after);

  const places = Math.max(decimalPlaces(before), decimalPlaces(after));
  const difference = after - before;
  const relative = before === 0 ? null : (difference / Math.abs(before)) * 100;

  if (!Number.isFinite(difference) || (relative !== null && !Number.isFinite(relative))) {
    throw new RangeError('delta is not representable as a finite number');
  }

  return {
    delta_absolute: roundHalfAwayFromZero(difference, places),
    delta_relative: relative === null ? null : roundHalfAwayFromZero(relative, 2),
  };
}

module.exports = { computeDeltas };
