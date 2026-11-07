'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { checkCitation, normalizeText } = require('./citation.js');

const PAGES = [
  'Resumo. O estudo sintético incluiu participantes fictícios.',
  'Resultados. O indicador sintético passou de 84% para 92% entre as duas medições.\nA diferença foi de 8 pontos.',
  'Conclusão. Sem outras observações.',
];
const ev = (page, source_text) => ({ page, source_text });
const reasons = (evidence, pages = PAGES) => checkCitation(evidence, pages).errors.map((e) => e.reason);
const passes = (evidence, pages = PAGES) => checkCitation(evidence, pages).passed;

test('an excerpt copied from its page passes; the first and the last page are page 1 and page N', () => {
  assert.deepEqual(checkCitation(ev(2, 'O indicador sintético passou de 84% para 92%'), PAGES), { passed: true, errors: [] });
  assert.equal(passes(ev(1, 'O estudo sintético incluiu participantes fictícios.')), true);
  assert.equal(passes(ev(3, 'Sem outras observações.')), true);
  assert.equal(passes(ev(2, PAGES[1])), true, 'the whole page');
});

test('the page number is exact: the excerpt of another page is not found, and there is no off-by-one', () => {
  assert.deepEqual(reasons(ev(1, 'O indicador sintético passou de 84%')), ['trecho_nao_encontrado']);
  assert.deepEqual(reasons(ev(3, 'O indicador sintético passou de 84%')), ['trecho_nao_encontrado']);
  assert.deepEqual(reasons(ev(2, 'Sem outras observações.')), ['trecho_nao_encontrado']);
  assert.deepEqual(reasons(ev(2, 'participantes fictícios')), ['trecho_nao_encontrado']);
});

test('page outside 1..pages.length, or not an integer, is pagina_inexistente', () => {
  for (const page of [0, -1, 4, 1.5, NaN, Infinity, '1', null, undefined]) {
    assert.deepEqual(reasons(ev(page, 'Resumo.')), ['pagina_inexistente'], String(page));
  }
  assert.deepEqual(reasons(ev(1, 'x'), []), ['pagina_inexistente'], 'no pages at all');
});

test('white space is normalized on both sides: runs, tabs, line breaks, no-break and thin spaces', () => {
  assert.equal(passes(ev(2, 'O  indicador\tsintético\npassou de 84%')), true);
  assert.equal(passes(ev(2, 'A diferença foi de 8 pontos.')), true, 'the page has a line break there');
  assert.equal(passes(ev(2, 'foi\u00A0de\u202F8\u2009pontos')), true);
  assert.equal(passes(ev(2, '  \n O indicador sintético \t ')), true, 'ends are trimmed');
  assert.equal(passes(ev(1, 'Resumo.   O estudo'), ['Resumo.\u00A0\u00A0O\nestudo sintético']), true);
});

test('hyphens are normalized on both sides: dashes and the minus sign are the same hyphen', () => {
  const pages = ['Efeito de 2020\u20132021 e \u22125 pontos em pré\u2011teste.'];
  assert.equal(passes(ev(1, '2020-2021'), pages), true);
  assert.equal(passes(ev(1, '-5 pontos'), pages), true);
  assert.equal(passes(ev(1, 'pré-teste'), pages), true);
  assert.equal(passes(ev(1, 'Efeito de 2020\u20142021'), pages), true, 'em dash in the excerpt, en dash in the page');
  for (const dash of ['\u2010', '\u2011', '\u2012', '\u2013', '\u2014', '\u2015', '\u2212']) {
    assert.equal(passes(ev(1, `a${dash}b`), ['a-b']), true, `U+${dash.charCodeAt(0).toString(16)}`);
  }
});

test('soft hyphen and zero-width space are invisible; NFC and NFD are the same text', () => {
  assert.equal(passes(ev(1, 'indicador'), ['indi\u00ADcador']), true);
  assert.equal(passes(ev(1, 'indi\u00ADcador'), ['indicador']), true);
  assert.equal(passes(ev(1, 'indicador'), ['indi\u200Bcador']), true);
  assert.equal(passes(ev(1, 'fict\u00ED' + 'cios'), ['fict' + 'i\u0301' + 'cios']), true, 'decomposed accent in the page');
  assert.equal(passes(ev(1, 'fict' + 'i\u0301' + 'cios'), ['fict\u00ED' + 'cios']), true, 'decomposed accent in the excerpt');
});

test('fails closed: case, accents, quotes, digits and words are not folded or invented', () => {
  assert.deepEqual(reasons(ev(2, 'o indicador sintético')), ['trecho_nao_encontrado'], 'case');
  assert.deepEqual(reasons(ev(2, 'O indicador sintetico')), ['trecho_nao_encontrado'], 'accent');
  assert.deepEqual(reasons(ev(2, 'passou de 84% para 94%')), ['trecho_nao_encontrado'], 'a changed number');
  assert.deepEqual(reasons(ev(2, 'passou de 84 % para 92%')), ['trecho_nao_encontrado'], 'a space that the page does not have');
  assert.deepEqual(reasons(ev(2, 'passou de 84% para 92% em um ano')), ['trecho_nao_encontrado'], 'extra words');
  assert.deepEqual(reasons(ev(1, '\u201Cestudo\u201D'), ['"estudo"']), ['trecho_nao_encontrado'], 'curly quotes');
  assert.deepEqual(reasons(ev(1, 'ﬁctícios'), ['fictícios']), ['trecho_nao_encontrado'], 'ligature');
});

test('known limits, proven: a word broken at a line end is not joined, an excerpt does not cross pages, 84 is found inside 184', () => {
  assert.deepEqual(reasons(ev(1, 'terminado'), ['foi termi-\nnado ontem']), ['trecho_nao_encontrado']);
  assert.equal(passes(ev(1, 'termi-nado'), ['foi termi-\nnado ontem']), false, 'the hyphen is followed by a space after normalizing');
  assert.equal(passes(ev(1, 'termi- nado'), ['foi termi-\nnado ontem']), true);
  assert.deepEqual(reasons(ev(1, 'Fim da página. Início da próxima'), ['Fim da página.', 'Início da próxima']), ['trecho_nao_encontrado']);
  assert.equal(passes(ev(1, '84'), ['valor 184']), true);
});

test('a blank excerpt is trecho_vazio, even on a page that has blanks; an empty page finds nothing', () => {
  for (const text of ['', '   ', '\n\t', '\u00A0\u200B\u00AD']) {
    assert.deepEqual(reasons(ev(1, text), ['a   b']), ['trecho_vazio'], JSON.stringify(text));
  }
  assert.deepEqual(reasons(ev(1, 'x'), ['']), ['trecho_nao_encontrado']);
});

test('the result carries only reasons, never the page text or the excerpt; the inputs are not changed; same input, same output', () => {
  const evidence = ev(2, 'texto que não existe');
  const pages = [...PAGES];
  const before = JSON.stringify([evidence, pages]);
  const first = checkCitation(evidence, pages);
  assert.deepEqual(first, checkCitation(evidence, pages));
  assert.equal(JSON.stringify([evidence, pages]), before);
  assert.deepEqual(Object.keys(first.errors[0]), ['reason']);
  assert.doesNotMatch(JSON.stringify(first), /indicador|texto que/);
});

test('bad arguments are a TypeError with its own message, not a verdict', () => {
  for (const evidence of [null, undefined, 'x', 5, []]) {
    assert.throws(() => checkCitation(evidence, PAGES), { name: 'TypeError', message: /evidence must be an object/ }, JSON.stringify(evidence));
  }
  for (const evidence of [ev(1, undefined), ev(1, 5), { page: 1 }, ev(0, 5), ev(9, null)]) {
    assert.throws(() => checkCitation(evidence, PAGES), { name: 'TypeError', message: /source_text must be a string/ }, JSON.stringify(evidence));
  }
  for (const pages of [null, undefined, 'x', {}]) {
    assert.throws(() => checkCitation(ev(1, 'a'), pages), { name: 'TypeError', message: /pages must be an array/ }, JSON.stringify(pages));
  }
  for (const pages of [[1], [null], ['a', undefined], [['a']]]) {
    assert.throws(() => checkCitation(ev(1, 'a'), pages), { name: 'TypeError', message: /pages\[\d\] must be a string/ }, JSON.stringify(pages));
  }
  assert.throws(() => checkCitation(ev(9, 'a'), ['a', 5]), { name: 'TypeError', message: /pages\[1\] must be a string/ }, 'a bad page is refused even when the cited one does not exist');
  assert.throws(() => normalizeText(5), { name: 'TypeError', message: /text must be a string/ });
});

test('normalizeText: the exact transformation', () => {
  assert.equal(normalizeText('  a \u00A0\n b\u2013c\u00ADd\u200Be  '), 'a b-cde');
  assert.equal(normalizeText(''), '');
  assert.equal(normalizeText('A'), 'A');
  assert.equal(normalizeText('e\u0301'), 'é');
  assert.equal(normalizeText(normalizeText('x \u2014\n y')), normalizeText('x \u2014\n y'), 'idempotent');
});

test('the synthetic evidence fixtures cite their own invented page', () => {
  const read = (name) => JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'synthetic', 'contracts', 'evidence', `${name}.json`), 'utf8'));
  const pages = ['O estudo sintético incluiu participantes fictícios.', 'x', 'O indicador sintético passou de 84% para 92% entre as duas medições.'];
  assert.equal(passes(read('valid-01'), pages), true);
  assert.equal(passes({ ...read('valid-01'), page: 2 }, pages), false);
  assert.equal(passes({ ...read('valid-02'), page: 1 }, pages), true);
});
