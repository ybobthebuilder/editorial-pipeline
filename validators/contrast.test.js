'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { contrastRatio, relativeLuminance } = require('./contrast.js');

function assertClose(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message ?? 'value'}: ${actual} is not within ${tolerance} of ${expected}`);
}

test('anchors defined by the WCAG text: black on white is 21:1, identical colors are 1:1', () => {
  assertClose(contrastRatio('#000000', '#ffffff'), 21, 1e-9);
  assertClose(contrastRatio('#ffffff', '#ffffff'), 1, 1e-12);
  assertClose(contrastRatio('#6236F4', '#6236F4'), 1, 1e-12);
});

test('relative luminance anchors: black is 0, white is 1', () => {
  assert.equal(relativeLuminance('#000000'), 0);
  assertClose(relativeLuminance('#ffffff'), 1, 1e-12);
});

test('the ratio is symmetric in its arguments', () => {
  assert.equal(contrastRatio('#E7E6D9', '#0B0B0B'), contrastRatio('#0B0B0B', '#E7E6D9'));
});

// Pairs and values from docs/visual-layer/contexto.md section 7.3 (two decimals).
const PAIRS = [
  ['--fg on --bg', '#E7E6D9', '#0B0B0B', 15.67],
  ['--muted on --bg', '#B0AFA6', '#0B0B0B', 8.93],
  ['--meta on --bg', '#82817E', '#0B0B0B', 5.05],
  ['--accent on --bg', '#6236F4', '#0B0B0B', 3.14],
  ['--fg on --accent', '#E7E6D9', '#6236F4', 4.99],
  ['--bg on --fg', '#0B0B0B', '#E7E6D9', 15.67],
  ['--muted on --surface', '#B0AFA6', '#141414', 8.36],
  ['--fg on --surface', '#E7E6D9', '#141414', 14.67],
  ['--border on --bg', '#42413E', '#0B0B0B', 1.93],
];

for (const [name, foreground, background, expected] of PAIRS) {
  test(`brand pair ${name} is ${expected}:1`, () => {
    assertClose(contrastRatio(foreground, background), expected, 0.005, name);
  });
}

test('the ratio stays unrounded, so a threshold is compared on the raw value', () => {
  const ratio = contrastRatio('#E7E6D9', '#6236F4');
  assert.notEqual(ratio, 4.99);
  assert.ok(ratio >= 4.5 && ratio < 5);
});

test('#RGB expands to #RRGGBB and hex digits are case-insensitive', () => {
  assert.equal(contrastRatio('#fff', '#000'), contrastRatio('#ffffff', '#000000'));
  assert.equal(contrastRatio('#F0C', '#000'), contrastRatio('#ff00cc', '#000000'));
  assert.equal(relativeLuminance('#AbC'), relativeLuminance('#aabbcc'));
});

test('ratios stay within 1 and 21 over a grid of colors', () => {
  const steps = ['00', '40', '80', 'c0', 'ff'];
  const colors = [];
  for (const r of steps) for (const g of steps) for (const b of steps) colors.push(`#${r}${g}${b}`);
  for (const a of colors) {
    for (const b of colors) {
      const ratio = contrastRatio(a, b);
      assert.ok(ratio >= 1 - 1e-12 && ratio <= 21 + 1e-9, `${a} vs ${b} gave ${ratio}`);
    }
  }
});

test('malformed colors are rejected, never guessed', () => {
  for (const bad of ['fff', '#ffff', '#ggg', '#12345', '#fffffff', 'red', '#ffffff80', '', ' #fff', '#fff ']) {
    assert.throws(() => contrastRatio(bad, '#000000'), RangeError, `first argument ${JSON.stringify(bad)}`);
    assert.throws(() => contrastRatio('#000000', bad), RangeError, `second argument ${JSON.stringify(bad)}`);
  }
});

test('non-string input is rejected with TypeError', () => {
  for (const bad of [null, undefined, 123, {}, ['#fff'], true]) {
    assert.throws(() => contrastRatio(bad, '#000000'), TypeError);
    assert.throws(() => relativeLuminance(bad), TypeError);
  }
});
