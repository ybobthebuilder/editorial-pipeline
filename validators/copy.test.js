'use strict';

// Tests of validators/copy.js (D-17): the mechanical rules for the CTA written on the art and for the
// caption of the post. The semantic boundary ("Comente QUERO e receba") is not here, and the tests say so.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { checkCta, checkCaption, CTA_MAX, CAPTION_MAX } = require('./copy.js');
const { findBlockedTerms } = require('./blocklist.js');

const ROOT = join(__dirname, '..');
const LIB = JSON.parse(readFileSync(join(ROOT, 'config/baseline/visual_library.json'), 'utf8'));
const templateOf = (id) => LIB.templates.find((t) => t.template_id === id);
const STORY = templateOf('story-01-convite');
const METRICA = templateOf('post-02-metrica');
const spec = (cta, template = STORY) => ({
  template_id: template.template_id,
  ...(cta === undefined ? {} : { cta }),
  slots: [{ slot_id: 'headline', kind: 'claim', lines: ['x'] }, ...(template.slots.some((s) => s.slot_id === 'cta_label') ? [{ slot_id: 'cta_label', kind: 'claim', lines: cta === undefined ? ['x'] : [cta] }] : [])],
});
const reasons = (r) => r.errors.map((e) => e.reason);
const cta = (text, template) => reasons(checkCta(spec(text, template), template || STORY));
const caption = (text) => reasons(checkCaption(text));

test('limits are the decided ones: 40 for the CTA, 300 for the caption', () => {
  assert.equal(CTA_MAX, 40);
  assert.equal(CAPTION_MAX, 300);
});

test('plain CTAs pass, including the two examples of the decision', () => {
  for (const text of ['Salve este post', 'Comente abaixo', 'Compartilhe com um colega', 'Leia os 3 pontos', 'Veja o próximo slide', 'x', 'Salvar', 'Em 2026, salve']) {
    assert.deepEqual(cta(text), [], text);
  }
});

test('the semantic boundary is not the code\'s: a CTA that promises a delivery passes here (09_QA and the prompt own it)', () => {
  for (const text of ['Comente QUERO e receba', 'Comente EU QUERO', 'Responda aqui']) assert.deepEqual(cta(text), [], text);
});

test('a CTA with a URL or a domain is refused', () => {
  for (const text of ['https://exemplo.com', 'http://x', 'ftp://x', 'HTTPS://X.COM', 'www.exemplo', 'WWW.X', 'exemplo.com', 'exemplo.com.br', 'bit.ly/abc', 'wa.me/5511', 'veja exemplo.org', 'a-b.co', 'ação.com', 'x.io', 'link: t.me/x']) {
    assert.ok(cta(text).includes('cta_com_url'), text);
  }
  for (const text of ['Salve este post', 'Fim. Comente', 'Versão 2.0', 'a.b', 'Sim.', 'Ok... salve', 'e.g. salvar', '3.14']) {
    assert.equal(cta(text).includes('cta_com_url'), false, text);
  }
});

test('known false positives are on purpose: p.ex and Sr.Silva read as domains', () => {
  assert.ok(cta('p.ex').includes('cta_com_url'));
  assert.ok(cta('Sr.Silva').includes('cta_com_url'));
});

test('a CTA with a mention is refused, in both widths of the at sign', () => {
  for (const text of ['@perfil', 'fale com @a', 'a@b', '＠perfil', '@']) assert.ok(cta(text).includes('cta_com_arroba'), text);
});

test('a CTA with a hashtag is refused, in both widths of the number sign', () => {
  for (const text of ['#tag', 'salve #1', 'a#b', '＃tag', '#']) assert.ok(cta(text).includes('cta_com_hashtag'), text);
});

test('a CTA with a phone number is refused: eight digits or more in one run of digits and separators', () => {
  for (const text of ['11 99999-0000', '(11) 99999 0000', '+55 11 99999-0000', '12345678', '1234-5678', '11.99999.0000', '99999 0000', '١٢٣٤٥٦٧٨']) {
    assert.ok(cta(text).includes('cta_com_telefone'), text);
  }
  for (const text of ['1234567', '123 456', '2026', 'Top 10', '12 de 34', '99999', 'Leia 3 dicas em 5 min', '(11)']) {
    assert.equal(cta(text).includes('cta_com_telefone'), false, text);
  }
  // 2026 2027 reads as a phone number: a known false positive, on purpose
  assert.ok(cta('2026 2027').includes('cta_com_telefone'));
  // digits split by words are not one run
  assert.equal(cta('1234 salve 1234 123').includes('cta_com_telefone'), false);
});

test('a blank CTA passes the schema length and not this validator', () => {
  for (const text of ['   ', ' ', '\t \n']) assert.ok(cta(text).includes('cta_so_espacos'), JSON.stringify(text));
  assert.equal(cta(' x ').includes('cta_so_espacos'), false);
});

test('the CTA length is checked in code points, a second line of defence behind the schema', () => {
  assert.deepEqual(cta('x'.repeat(40)), []);
  assert.deepEqual(cta('\u{1F600}'.repeat(40)), []);
  assert.deepEqual(cta('x'.repeat(41)), ['cta_acima_de_40']);
  assert.deepEqual(cta('\u{1F600}'.repeat(41)), ['cta_acima_de_40']);
});

test('the CTA exists if and only if the template has a cta_label slot', () => {
  assert.deepEqual(reasons(checkCta(spec('Salve este post', METRICA), METRICA)), ['cta_sem_slot']);
  assert.deepEqual(reasons(checkCta(spec(undefined, STORY), STORY)), ['slot_sem_cta']);
  assert.deepEqual(reasons(checkCta(spec(undefined, METRICA), METRICA)), []);
  assert.deepEqual(reasons(checkCta(spec('Salve este post', STORY), STORY)), []);
  const manifesto = templateOf('post-01-manifesto');
  assert.deepEqual(reasons(checkCta(spec('Salve este post', manifesto), manifesto)), []);
  for (const t of LIB.templates) {
    const has = t.slots.some((s) => s.slot_id === 'cta_label');
    assert.deepEqual(reasons(checkCta(spec(has ? 'Salve este post' : undefined, t), t)), [], t.template_id);
  }
});

test('the CTA mirrors the slot: the slot lines are exactly [cta]', () => {
  const base = spec('Salve este post');
  const slot = () => base.slots.find((s) => s.slot_id === 'cta_label');
  const check = (mutate) => { const s = JSON.parse(JSON.stringify(base)); mutate(s.slots.find((x) => x.slot_id === 'cta_label'), s); return reasons(checkCta(s, STORY)); };
  assert.deepEqual(check(() => {}), []);
  assert.deepEqual(check((x) => { x.lines = ['Comente abaixo']; }), ['cta_diferente_do_slot']);
  assert.deepEqual(check((x) => { x.lines = ['Salve este post', 'Comente']; }), ['cta_diferente_do_slot']);
  assert.deepEqual(check((x) => { x.lines = []; }), ['cta_diferente_do_slot']);
  assert.deepEqual(check((x) => { x.lines = ['salve este post']; }), ['cta_diferente_do_slot']);
  assert.deepEqual(check((x) => { x.lines = ['Salve este post ']; }), ['cta_diferente_do_slot']);
  assert.deepEqual(check((x) => { x.lines = 'Salve este post'; }), ['cta_diferente_do_slot']);
  const numeric = JSON.parse(JSON.stringify(base)); numeric.cta = '5'; numeric.slots.find((x) => x.slot_id === 'cta_label').lines = [5];
  assert.deepEqual(reasons(checkCta(numeric, STORY)), ['cta_diferente_do_slot']); // 5 and '5' are different
  assert.deepEqual(check((x, s) => { s.slots = s.slots.filter((y) => y !== x); }), ['cta_diferente_do_slot']);
  assert.ok(slot());
});

test('several reasons come together, in a fixed order', () => {
  assert.deepEqual(cta('@a #b exemplo.com 11 99999-0000'), ['cta_com_url', 'cta_com_arroba', 'cta_com_hashtag', 'cta_com_telefone']);
  const s = spec('x'.repeat(41) + '@');
  s.slots.find((x) => x.slot_id === 'cta_label').lines = ['outra'];
  assert.deepEqual(reasons(checkCta(s, STORY)), ['cta_diferente_do_slot', 'cta_acima_de_40', 'cta_com_arroba']);
});

test('the blocklist and the numbers are not reimplemented: the stage feeds the same text to blocklist.js', () => {
  // copy.js passes a blocklisted CTA; the QA-CFM gate (blocklist.js) is what refuses it
  assert.deepEqual(cta('100% eficaz'), []);
  const found = findBlockedTerms([{ id: 'cta', text: '100% eficaz' }], ['100% eficaz']);
  assert.equal(found.passed, false);
});

test('caption: plain text passes, with accents, punctuation and numbers', () => {
  for (const text of ['De 84% para 92% no indicador. O que mudou, em uma frase curta.', 'Dado primeiro, decisão depois.', 'x', 'Ação, ç, ã, é: ok!']) {
    assert.deepEqual(caption(text), [], text);
  }
});

test('caption: no hashtag and no mention in v0.1 (Q4), in both widths', () => {
  assert.deepEqual(caption('Texto #a'), ['legenda_com_hashtag']);
  assert.deepEqual(caption('Texto @a'), ['legenda_com_mencao']);
  assert.deepEqual(caption('Texto ＃a'), ['legenda_com_hashtag']);
  assert.deepEqual(caption('Texto ＠a'), ['legenda_com_mencao']);
  assert.deepEqual(caption('@a #b'), ['legenda_com_mencao', 'legenda_com_hashtag']);
});

test('caption: links and phone numbers are not decided, so they are not refused (UNKNOWN, Q4 of the proposal)', () => {
  assert.deepEqual(caption('Veja exemplo.com'), []);
  assert.deepEqual(caption('Ligue 11 99999-0000'), []);
});

test('caption: blank text and length in code points', () => {
  assert.deepEqual(caption('   '), ['legenda_so_espacos']);
  assert.deepEqual(caption(''), ['legenda_so_espacos']);
  assert.deepEqual(caption('x'.repeat(300)), []);
  assert.deepEqual(caption('\u{1F600}'.repeat(300)), []);
  assert.deepEqual(caption('x'.repeat(301)), ['legenda_acima_de_300']);
  assert.deepEqual(caption('\u{1F600}'.repeat(301)), ['legenda_acima_de_300']);
});

test('results have the shape { passed, errors } and passed follows errors', () => {
  assert.deepEqual(checkCaption('ok'), { passed: true, errors: [] });
  assert.deepEqual(checkCaption('#'), { passed: false, errors: [{ reason: 'legenda_com_hashtag' }] });
  assert.deepEqual(checkCta(spec('Salve este post'), STORY), { passed: true, errors: [] });
  assert.equal(checkCta(spec('#'), STORY).passed, false);
});

test('wrong arguments are a TypeError that names the problem', () => {
  const bad = (fn, pattern) => assert.throws(fn, (e) => e instanceof TypeError && pattern.test(e.message));
  bad(() => checkCaption(5), /caption must be a string/);
  bad(() => checkCaption(undefined), /caption must be a string/);
  bad(() => checkCaption(null), /caption must be a string/);
  bad(() => checkCta(null, STORY), /coverSpec must be an object/);
  bad(() => checkCta([], STORY), /coverSpec must be an object/);
  bad(() => checkCta(spec('x'), null), /template must be an object/);
  bad(() => checkCta(spec('x'), []), /template must be an object/);
  bad(() => checkCta(spec('x'), {}), /template\.slots must be an array/);
  bad(() => checkCta({ cta: 'x', slots: 'x' }, STORY), /coverSpec\.slots must be an array/);
  bad(() => checkCta({ ...spec('x'), cta: 5 }, STORY), /coverSpec\.cta must be a string/);
  bad(() => checkCta({ ...spec('x'), cta: null }, STORY), /coverSpec\.cta must be a string/);
});

test('the input is not mutated', () => {
  const s = spec('Salve este post');
  const before = JSON.stringify([s, STORY]);
  checkCta(s, STORY);
  checkCaption('texto');
  assert.equal(JSON.stringify([s, STORY]), before);
});

test('the real fixtures: valid-02 of cover_spec passes against its template, and the real library has the two cta_label slots as claim', () => {
  const fx = JSON.parse(readFileSync(join(ROOT, 'fixtures/synthetic/contracts/cover_spec/valid-02.json'), 'utf8'));
  assert.deepEqual(checkCta(fx, templateOf(fx.template_id)), { passed: true, errors: [] });
  const post = JSON.parse(readFileSync(join(ROOT, 'fixtures/synthetic/contracts/post_copy/valid-01.json'), 'utf8'));
  assert.deepEqual(checkCaption(post.caption), { passed: true, errors: [] });
  const holders = LIB.templates.filter((t) => t.slots.some((s) => s.slot_id === 'cta_label')).map((t) => t.template_id);
  assert.deepEqual(holders, ['post-01-manifesto', 'story-01-convite']);
});

test('copy.js has no require and no I/O (n8n Cloud Code node)', () => {
  const source = readFileSync(join(__dirname, 'copy.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.equal(/\brequire\s*\(/.test(source), false);
  assert.equal(/\bimport\b/.test(source), false);
  assert.equal(/\b(fs|process|fetch|eval|Function|Date|Math\.random)\b/.test(source), false);
});
