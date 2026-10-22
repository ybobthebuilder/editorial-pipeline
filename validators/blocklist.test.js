'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { findBlockedTerms } = require('./blocklist.js');
const { checkNumbersAllowed } = require('./numbers.js');

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

// The tests above exercise the mechanics with example terms. The ones below use the real v0.1 list
// that Fonseca supplied on 2026-10-22 (U22), read from the config file, never copied into code.
const { readFileSync: readFile } = require('node:fs');
const { join: joinPath } = require('node:path');

const V01 = ['cura', 'garantido', '100%', 'milagroso', 'revolucionário', 'melhor do Brasil', 'resultado certo', 'definitivo', 'sem riscos', 'imediato'];
const REAL = JSON.parse(readFile(joinPath(__dirname, '..', 'config', 'baseline', 'cfm_blocklist.json'), 'utf8'));
const hits = (text) => findBlockedTerms([{ id: 'x', text }], REAL).matches.map((m) => m.term);

test('cfm_blocklist.json is exactly the v0.1 list, in order, with clean strings', () => {
  assert.deepEqual(REAL, V01);
  assert.equal(new Set(REAL.map((t) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase())).size, REAL.length, 'no duplicates');
  for (const term of REAL) {
    assert.equal(term, term.normalize('NFC'));
    assert.equal(term, term.trim());
    assert.equal(term.includes('  '), false);
  }
});

test('every term of the v0.1 list is found on its own, in any case and without accents', () => {
  for (const term of REAL) {
    assert.deepEqual(hits(`Texto com ${term} no meio.`), [term], term);
    assert.deepEqual(hits(term.toUpperCase()), [term], `${term} upper`);
    assert.deepEqual(hits(term.normalize('NFD').replace(/\p{M}/gu, '')), [term], `${term} without accents`);
  }
  assert.deepEqual(hits('REVOLUCIONARIO'), ['revolucionário']);
});

test('"100%" is found as a whole figure and not inside another number or word', () => {
  assert.deepEqual(hits('Eficácia de 100%.'), ['100%']);
  assert.deepEqual(hits('(100%)'), ['100%']);
  assert.deepEqual(hits('100% garantido'), ['100%', 'garantido']);
  for (const text of ['1100%', 'a100%', '100%a', '100,0%', '99,9%', '100']) assert.deepEqual(hits(text), [], text);
});

test('"melhor do Brasil" is a phrase: case, spacing and a closing full stop do not hide it, a longer word does', () => {
  assert.deepEqual(hits('O melhor do Brasil'), ['melhor do Brasil']);
  assert.deepEqual(hits('somos melhor do brasil'), ['melhor do Brasil']);
  assert.deepEqual(hits('melhor  do   Brasil.'), ['melhor do Brasil']);
  assert.deepEqual(hits('melhor do Brasília'), []);
  assert.deepEqual(hits('o melhor do mundo'), []);
});

test('several terms in one text are all reported, each with its position in the original', () => {
  const text = 'Garantido: cura imediata e resultado certo.';
  const result = findBlockedTerms([{ id: 'headline', text }], REAL);
  assert.equal(result.passed, false);
  assert.deepEqual(result.matches.map((m) => [m.id, m.term, m.text]), [
    ['headline', 'garantido', 'Garantido'],
    ['headline', 'cura', 'cura'],
    ['headline', 'resultado certo', 'resultado certo'],
  ]);
  for (const m of result.matches) assert.equal(text.slice(m.start, m.end), m.text);
});

test('known gaps, by design (whole forms only): these slip through and must be added to the list to be caught', () => {
  // Pinned so that any change in what slips through is a decision, not an accident.
  const slips = ['curar', 'curas', 'garantida', 'garantidos', 'revolucionária', 'definitiva', 'imediata', 'imediatamente', 'milagrosa', 'sem risco', 'resultados certos', '100 %', '100 %'];
  for (const text of slips) assert.deepEqual(hits(text), [], text);
  assert.equal(findBlockedTerms([{ id: 'x', text: slips.join(' ') }], REAL).passed, true);
});

test('precedence today: a verified 100% passes QA-NUM and still fails QA-CFM, because the gates are independent', () => {
  // A number that numbers.js allows (it came from a VERIFIED evidence) is not exempt from the list.
  // No code lets one gate override the other, and QA-CFM cannot be waived (contracts-proposal.md,
  // section 6). Changing this is a policy decision for Fonseca: remove "100%" from the list, or
  // define an exemption for verified values. Until then this test pins what the code does.
  const items = [{ id: 'headline', text: 'Resposta em 100%' }];
  assert.equal(checkNumbersAllowed(items, [{ value: 100, unit: '%' }]).passed, true);
  assert.equal(findBlockedTerms(items, REAL).passed, false);
  assert.deepEqual(hits(items[0].text), ['100%']);
  // The numeric gate alone does not decide: with 100% not allowed, QA-NUM fails too.
  assert.equal(checkNumbersAllowed(items, [{ value: 92, unit: '%' }]).passed, false);
});
