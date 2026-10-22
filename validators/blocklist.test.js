'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { findBlockedTerms } = require('./blocklist.js');

// The terms below are placeholders for the mechanism. The real list is the config's (U22).
const TERMS = ['cura', 'o melhor', 'promoção'];
const one = (text, terms = TERMS) => findBlockedTerms([{ id: 'x', text }], terms);
const found = (text, terms) => one(text, terms).matches.map((m) => m.term);

test('a forbidden word is found, and a clean text passes', () => {
  assert.equal(one('A cura chegou.').passed, false);
  assert.deepEqual(found('A cura chegou.'), ['cura']);
  assert.equal(one('Um texto sem nada proibido.').passed, true);
  assert.deepEqual(one('Um texto sem nada proibido.').matches, []);
});

test('case and accents are ignored on both sides', () => {
  assert.deepEqual(found('CURA'), ['cura']);
  assert.deepEqual(found('cúra'), ['cura']);
  assert.deepEqual(found('PROMOCAO'), ['promoção']);
  assert.deepEqual(found('promoção'), ['promoção']);
  assert.deepEqual(found('PROMOÇÃO'), ['promoção']);
  assert.deepEqual(found('cura', ['CÚRA']), ['CÚRA']);
});

test('precomposed and decomposed accents are the same text', () => {
  assert.deepEqual(found('promoção'), ['promoção']);
  assert.deepEqual(found('promoção'), ['promoção']);
});

test('only whole words: "cura" is not "procura", "curativo" or "cura2"', () => {
  assert.deepEqual(found('Ele procura um curativo.'), []);
  assert.deepEqual(found('cura2 e 2cura'), []);
  assert.deepEqual(found('curar'), []);
});

test('punctuation and hyphens are boundaries', () => {
  assert.deepEqual(found('cura!'), ['cura']);
  assert.deepEqual(found('(cura)'), ['cura']);
  assert.deepEqual(found('"cura"'), ['cura']);
  assert.deepEqual(found('cura-se'), ['cura']);
  assert.deepEqual(found('a\ncura\n'), ['cura']);
});

test('a phrase matches across any run of spaces, including non-breaking ones', () => {
  assert.deepEqual(found('Somos o melhor do mercado'), ['o melhor']);
  assert.deepEqual(found('Somos o  melhor'), ['o melhor']);
  assert.deepEqual(found('Somos o melhor'), ['o melhor']);
  assert.deepEqual(found('Somos O\tMELHOR'), ['o melhor']);
  assert.deepEqual(found('Somos o melhores'), []);
});

test('positions and text point at the original, with its accents and case', () => {
  const text = 'Veja a PROMOÇÃO de hoje';
  const [m] = one(text).matches;
  assert.equal(m.text, 'PROMOÇÃO');
  assert.equal(text.slice(m.start, m.end), 'PROMOÇÃO');
  const decomposed = 'x promoção y';
  const [d] = one(decomposed).matches;
  assert.equal(decomposed.slice(d.start, d.end), 'promoção');
});

test('a phrase with a run of spaces reports the original span', () => {
  const text = 'Somos o   melhor.';
  const [m] = one(text).matches;
  assert.equal(text.slice(m.start, m.end), 'o   melhor');
});

test('every occurrence is reported, ordered by item and position, with the slot id', () => {
  const result = findBlockedTerms([
    { id: 'a', text: 'cura e promoção e cura' },
    { id: 'b', text: 'o melhor' },
  ], TERMS);
  assert.deepEqual(result.matches.map((m) => [m.id, m.term, m.start]), [
    ['a', 'cura', 0], ['a', 'promoção', 7], ['a', 'cura', 18], ['b', 'o melhor', 0],
  ]);
});

test('overlapping terms are both reported', () => {
  const result = one('Somos o melhor', ['melhor', 'o melhor']);
  assert.deepEqual(result.matches.map((m) => m.term).sort(), ['melhor', 'o melhor']);
});

test('an empty list throws instead of claiming conformity', () => {
  assert.throws(() => one('qualquer coisa', []), RangeError);
});

test('malformed arguments throw instead of being guessed', () => {
  assert.throws(() => findBlockedTerms('x', TERMS), TypeError);
  assert.throws(() => findBlockedTerms([{ id: 'x' }], TERMS), TypeError);
  assert.throws(() => findBlockedTerms([{ id: 1, text: 'x' }], TERMS), TypeError);
  assert.throws(() => findBlockedTerms([], 'cura'), TypeError);
  assert.throws(() => findBlockedTerms([], [3]), TypeError);
  assert.throws(() => findBlockedTerms([], ['cura', '']), TypeError);
  assert.throws(() => findBlockedTerms([], ['   ']), TypeError);
});

test('no items passes (nothing to check) once the list is valid', () => {
  assert.deepEqual(findBlockedTerms([], TERMS), { passed: true, matches: [] });
});

test('the module has no require() or import, so it runs in the n8n Cloud Code node', () => {
  const source = readFileSync(join(__dirname, 'blocklist.js'), 'utf8');
  assert.equal(/\brequire\s*\(/.test(source), false);
  assert.equal(/^\s*import\s/m.test(source), false);
});
