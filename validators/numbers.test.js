'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { extractNumbers, checkNumbersAllowed } = require('./numbers.js');
const { computeDeltas } = require('./math.js');

const values = (text, options) => extractNumbers(text, options).numbers.map((n) => [n.value, n.unit]);
const reasons = (text) => extractNumbers(text).errors.map((e) => [e.raw, e.reason]);

test('PT-BR decimals and thousands: 9,52 and 1.234,56 and 1.234.567', () => {
  assert.deepEqual(values('9,52'), [[9.52, null]]);
  assert.deepEqual(values('1.234,56'), [[1234.56, null]]);
  assert.deepEqual(values('1.234.567'), [[1234567, null]]);
  assert.deepEqual(values('1234,5'), [[1234.5, null]]);
  assert.deepEqual(values('84'), [[84, null]]);
});

test('English or malformed numbers are errors, never guessed', () => {
  assert.deepEqual(reasons('9.52'), [['9.52', 'formato_invalido']]);
  assert.deepEqual(reasons('1,234.56'), [['1,234.56', 'formato_invalido']]);
  assert.deepEqual(reasons('1.5'), [['1.5', 'formato_invalido']]);
  assert.deepEqual(reasons('12.34'), [['12.34', 'formato_invalido']]);
  assert.deepEqual(reasons('1.234,56,78'), [['1.234,56,78', 'formato_invalido']]);
  assert.deepEqual(extractNumbers('9.52').numbers, []);
});

test('sentence punctuation after a number is not part of it', () => {
  assert.deepEqual(values('de 84, depois 92.'), [[84, null], [92, null]]);
  assert.deepEqual(values('em 2023.'), [[2023, null]]);
});

test('units: % with or without a space, pp, p.p., and pp inside a word is not a unit', () => {
  assert.deepEqual(values('9,52%'), [[9.52, '%']]);
  assert.deepEqual(values('9,52 %'), [[9.52, '%']]);
  assert.deepEqual(values('9,52 %'), [[9.52, '%']]);
  assert.deepEqual(values('8 pp'), [[8, 'pp']]);
  assert.deepEqual(values('8pp'), [[8, 'pp']]);
  assert.deepEqual(values('8 p.p.'), [[8, 'pp']]);
  assert.deepEqual(values('8 ppm'), [[8, null]]);
  assert.deepEqual(values('8 por cento'), [[8, null]]);
});

test('signs count only at the start or after a space or an opening mark', () => {
  assert.deepEqual(values('-3,5'), [[-3.5, null]]);
  assert.deepEqual(values('−3,5'), [[-3.5, null]]);
  assert.deepEqual(values('+4'), [[4, null]]);
  assert.deepEqual(values('caiu -5%'), [[-5, '%']]);
  assert.deepEqual(values('(-5)'), [[-5, null]]);
  assert.deepEqual(values('COVID-19'), [[19, null]]);
  assert.deepEqual(values('2020-2021'), [[2020, null], [2021, null]]);
});

test('a negative zero is a plain zero', () => {
  const [{ value }] = extractNumbers('-0').numbers;
  assert.equal(Object.is(value, 0), true);
});

test('raw, start and end point at the number, its sign and its unit in the original text', () => {
  const text = 'subiu +8 pp e 9,52%';
  const { numbers } = extractNumbers(text);
  assert.deepEqual(numbers.map((n) => [n.raw, text.slice(n.start, n.end)]), [['+8 pp', '+8 pp'], ['9,52%', '9,52%']]);
});

test('counters and years are numbers too: the caller decides what to exempt', () => {
  assert.deepEqual(values('01 / 06'), [[1, null], [6, null]]);
});

test('ignoreTerms exempts exact terms and keeps the positions of the rest', () => {
  assert.deepEqual(values('COVID-19 e B12'), [[19, null], [12, null]]);
  assert.deepEqual(values('COVID-19 e B12', { ignoreTerms: ['COVID-19', 'B12'] }), []);
  const text = 'COVID-19 subiu 5%';
  const [n] = extractNumbers(text, { ignoreTerms: ['COVID-19'] }).numbers;
  assert.equal(text.slice(n.start, n.end), '5%');
});

test('more digits than a double holds exactly is an error', () => {
  assert.deepEqual(reasons('12345678901234567'), [['12345678901234567', 'precisao_excedida']]);
  assert.deepEqual(values('123456789012345'), [[123456789012345, null]]);
});

test('extractNumbers rejects wrong argument types', () => {
  assert.throws(() => extractNumbers(5), TypeError);
  assert.throws(() => extractNumbers('1', { ignoreTerms: 'x' }), TypeError);
  assert.throws(() => extractNumbers('1', { ignoreTerms: [''] }), TypeError);
  assert.throws(() => extractNumbers('1', { ignoreTerms: [3] }), TypeError);
});

// The worked example of CLAUDE.md §3: the LLM extracts 84 and 92, the code computes the deltas.
const deltas = computeDeltas(84, 92);
const ALLOWED = [
  { value: 84, unit: '%' }, { value: 92, unit: '%' },
  { value: deltas.delta_absolute, unit: 'pp' }, { value: deltas.delta_relative, unit: '%' },
];

test('a cover that shows only verified values passes', () => {
  const result = checkNumbersAllowed([
    { id: 'headline', text: 'de 84% para 92%' },
    { id: 'delta', text: '+8 pp (9,52%)' },
  ], ALLOWED);
  assert.equal(result.passed, true);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.found.map((f) => f.raw), ['84%', '92%', '+8 pp', '9,52%']);
});

test('a number that no verified value supports is refused', () => {
  const text = 'de 84% para 93%';
  const result = checkNumbersAllowed([{ id: 'headline', text }], ALLOWED);
  assert.equal(result.passed, false);
  assert.deepEqual(result.problems, [{ id: 'headline', raw: '93%', start: text.indexOf('93%'), reason: 'numero_nao_autorizado' }]);
});

test('the unit matters: 8% is not 8 pp (CLAUDE.md §3, pp vs %)', () => {
  const result = checkNumbersAllowed([{ id: 'delta', text: 'subiu 8%' }], ALLOWED);
  assert.equal(result.passed, false);
  assert.equal(result.problems[0].reason, 'unidade_divergente');
  assert.equal(checkNumbersAllowed([{ id: 'delta', text: 'subiu 8 pp' }], ALLOWED).passed, true);
});

test('values match exactly: a rounded 9,5 does not stand for a stored 9,52', () => {
  const result = checkNumbersAllowed([{ id: 'delta', text: '9,5%' }], ALLOWED);
  assert.equal(result.problems[0].reason, 'numero_nao_autorizado');
});

test('a format error is a problem of its own, with the slot id', () => {
  const result = checkNumbersAllowed([{ id: 'delta', text: '9.52%' }], ALLOWED);
  assert.equal(result.passed, false);
  assert.deepEqual(result.problems.map((p) => [p.id, p.raw, p.reason]), [['delta', '9.52%', 'formato_invalido']]);
});

test('problems are ordered by item, then by position in the text', () => {
  const result = checkNumbersAllowed([
    { id: 'a', text: '99 e 9.52 e 98' },
    { id: 'b', text: '97' },
  ], ALLOWED);
  assert.deepEqual(result.problems.map((p) => [p.id, p.raw]), [['a', '99'], ['a', '9.52'], ['a', '98'], ['b', '97']]);
});

test('texts without numbers pass, even with nothing allowed', () => {
  assert.equal(checkNumbersAllowed([{ id: 'x', text: 'sem números aqui' }], []).passed, true);
  assert.equal(checkNumbersAllowed([], []).passed, true);
});

test('zero and negative zero are the same allowed value', () => {
  assert.equal(checkNumbersAllowed([{ id: 'x', text: '0' }], [{ value: -0, unit: null }]).passed, true);
});

test('ignoreTerms reaches the check', () => {
  const items = [{ id: 'x', text: 'COVID-19 subiu 8 pp' }];
  assert.equal(checkNumbersAllowed(items, ALLOWED).passed, false);
  assert.equal(checkNumbersAllowed(items, ALLOWED, { ignoreTerms: ['COVID-19'] }).passed, true);
});

test('checkNumbersAllowed rejects malformed arguments instead of guessing', () => {
  assert.throws(() => checkNumbersAllowed('x', []), TypeError);
  assert.throws(() => checkNumbersAllowed([{ id: 'x' }], []), TypeError);
  assert.throws(() => checkNumbersAllowed([{ id: 1, text: 'x' }], []), TypeError);
  assert.throws(() => checkNumbersAllowed([], 'x'), TypeError);
  assert.throws(() => checkNumbersAllowed([], [{ value: NaN, unit: null }]), TypeError);
  assert.throws(() => checkNumbersAllowed([], [{ value: '8', unit: null }]), TypeError);
  assert.throws(() => checkNumbersAllowed([], [{ value: 8 }]), TypeError); // the unit must be explicit
  assert.throws(() => checkNumbersAllowed([], [{ value: 8, unit: 'x' }]), TypeError);
});

test('the module has no require() or import, so it runs in the n8n Cloud Code node', () => {
  const source = readFileSync(join(__dirname, 'numbers.js'), 'utf8');
  assert.equal(/\brequire\s*\(/.test(source), false);
  assert.equal(/^\s*import\s/m.test(source), false);
});
