'use strict';

// Tests of render/render.js (VL-5, checkpoints CP-VL5.1 to CP-VL5.3). The fixtures are synthetic:
// fixtures/synthetic/render/<template_id>.json, one valid cover_spec per template. The six SVGs are the
// real ones in assets/brand. node:test has no XML parser, so a strict well-formedness checker is
// written here and tested against bad samples first, so that it cannot pass everything.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const geometry = require('../validators/geometry.js');
const { validate } = require('../validators/schema.js');
const { renderCover, escapeXml, elementIds } = require('./render.js');

const ROOT = join(__dirname, '..');
const readJson = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const LIB = readJson('config/baseline/visual_library.json');
const COVER_SCHEMA = readJson('contracts/cover_spec.schema.json');
const IDS = LIB.templates.map((t) => t.template_id);
const spec = (id) => readJson(`fixtures/synthetic/render/${id}.json`);
const markupOf = (id) => readFileSync(join(ROOT, LIB.templates.find((t) => t.template_id === id).svg), 'utf8');
const clone = (v) => JSON.parse(JSON.stringify(v));
const sha = (text) => createHash('sha256').update(text).digest('hex');
const opts = (id, over = {}) => ({ markup: markupOf(id), geometry, ...over });
const render = (s, over) => renderCover(s, LIB, opts(s.template_id, over));
const reasons = (r) => r.errors.map((e) => e.reason);
const slotLines = (s, slotId) => s.slots.find((x) => x.slot_id === slotId);
const textElements = (svg) => [...svg.matchAll(/<text\s([^>]*)>([^<]*)<\/text>/g)].map((m) => ({ id: /id="([^"]*)"/.exec(m[1])[1], content: m[2] }));

// ---- A strict XML well-formedness checker (the subset SVG needs), and its own tests -----------

const ENTITY = /&(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);/y;
function badText(text) {
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '<') return 'raw <';
    if (text[i] === '&') {
      ENTITY.lastIndex = i;
      if (!ENTITY.test(text)) return 'bare &';
    }
  }
  return text.includes(']]>') ? ']]>' : null;
}
function wellFormed(xml) {
  const stack = [];
  let root = 0;
  let i = 0;
  const token = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/([A-Za-z_][\w:.-]*)\s*>|<([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_][\w:.-]*="[^"<]*")*)\s*(\/?)>/y;
  while (i < xml.length) {
    if (xml[i] !== '<') {
      const next = xml.indexOf('<', i);
      const text = xml.slice(i, next === -1 ? xml.length : next);
      if (stack.length === 0 && text.trim() !== '') return 'text outside the root';
      const bad = badText(text);
      if (bad) return `text: ${bad}`;
      i += text.length;
      continue;
    }
    token.lastIndex = i;
    const m = token.exec(xml);
    if (!m) return `bad markup at ${i}`;
    i = token.lastIndex;
    if (m[1] !== undefined) {
      if (stack.pop() !== m[1]) return `mismatched </${m[1]}>`;
    } else if (m[2] !== undefined) {
      const names = [...m[3].matchAll(/\s([A-Za-z_][\w:.-]*)="([^"]*)"/g)];
      if (new Set(names.map((n) => n[1])).size !== names.length) return 'duplicate attribute';
      for (const n of names) { const bad = badText(n[2]); if (bad) return `attribute: ${bad}`; }
      if (stack.length === 0) root += 1;
      if (root > 1) return 'two roots';
      if (m[4] !== '/') stack.push(m[2]);
    }
  }
  if (stack.length > 0) return `unclosed <${stack[stack.length - 1]}>`;
  return root === 1 ? null : 'no root';
}

test('the XML checker accepts well-formed SVG and refuses each kind of damage (it is not vacuous)', () => {
  assert.equal(wellFormed('<svg a="1"><g/><text x="1">a &amp; b &#233; &lt;</text></svg>'), null);
  const bad = {
    unclosed: '<svg><g></svg>',
    mismatched: '<svg><g></h></svg>',
    'bare ampersand': '<svg><text>a & b</text></svg>',
    'raw <': '<svg><text>a < b</text></svg>',
    'unknown entity': '<svg><text>&nbsp;</text></svg>',
    'duplicate attribute': '<svg a="1" a="2"/>',
    unquoted: '<svg a=1/>',
    'single quotes': "<svg a='1'/>",
    'two roots': '<svg/><svg/>',
    'text outside': '<svg/>x',
    'raw < in attribute': '<svg a="<"/>',
    'bare & in attribute': '<svg a="a & b"/>',
    empty: '',
    'no root': '<!-- c -->',
    'cdata end': '<svg><text>]]></text></svg>',
  };
  for (const [name, xml] of Object.entries(bad)) assert.notEqual(wellFormed(xml), null, name);
});

// ---- CP-VL5.1: same input, same bytes ----------------------------------------------------------

test('CP-VL5.1: the same input gives the same bytes, run after run, and the hash is stable', () => {
  for (const id of IDS) {
    const a = render(spec(id));
    const b = render(spec(id));
    assert.equal(a.passed, true, id);
    assert.equal(a.svg, b.svg, id);
    assert.equal(sha(a.svg), sha(b.svg), id);
    assert.equal(typeof a.svg, 'string');
  }
});

test('the output does not depend on the order of the slots or of the keys of the cover_spec', () => {
  for (const id of IDS) {
    const base = spec(id);
    const shuffled = clone(base);
    shuffled.slots.reverse();
    shuffled.slots = shuffled.slots.map((s) => ({ lines: s.lines, kind: s.kind, slot_id: s.slot_id }));
    const reordered = Object.fromEntries(Object.entries(shuffled).reverse());
    assert.equal(render(reordered).svg, render(base).svg, id);
  }
});

test('the render does not mutate its inputs', () => {
  const s = spec('story-01-convite');
  const before = JSON.stringify([s, LIB]);
  render(s);
  assert.equal(JSON.stringify([s, LIB]), before);
});

// ---- CP-VL5.2: well-formed XML, escaped text ----------------------------------------------------

test('CP-VL5.2: all six templates render well-formed XML', () => {
  for (const id of IDS) {
    const r = render(spec(id));
    assert.equal(r.passed, true, `${id}: ${JSON.stringify(r.errors)}`);
    assert.equal(wellFormed(r.svg), null, id);
    assert.equal(wellFormed(markupOf(id)), null, `${id} markup`);
  }
});

test('CP-VL5.2: & < > " \' are escaped in every slot, and <script> never reaches the output as an element', () => {
  const dirty = ['<script>', '&', '"\'>'];
  for (const [id, slotId] of [['post-02-metrica', 'headline'], ['reel-02-overlay', 'headline'], ['story-01-convite', 'cta_label']]) {
    const s = spec(id);
    const slot = slotLines(s, slotId);
    slot.lines = slot.lines.map((_, i) => dirty[i % dirty.length]).slice(0, slot.lines.length);
    const r = render(s);
    assert.equal(r.passed, true, `${id}: ${JSON.stringify(r.errors)}`);
    assert.equal(wellFormed(r.svg), null, id);
    assert.doesNotMatch(r.svg, /<script/i, id);
    assert.ok(r.svg.includes('&lt;script&gt;') || slotId !== 'headline' || id !== 'post-02-metrica', id);
  }
  const s = spec('post-02-metrica');
  slotLines(s, 'headline').lines = ['<script>', '&amp;', `"'<>`];
  const r = render(s);
  assert.equal(r.passed, true, JSON.stringify(r.errors));
  const texts = Object.fromEntries(textElements(r.svg).map((t) => [t.id, t.content]));
  assert.equal(texts.headline__0, '&lt;script&gt;');
  assert.equal(texts.headline__1, '&amp;amp;'); // an existing entity is text, not markup
  assert.equal(texts.headline__2, '&quot;&apos;&lt;&gt;');
});

test('escapeXml: the five characters, in the right order, and nothing else', () => {
  assert.equal(escapeXml('&<>"\''), '&amp;&lt;&gt;&quot;&apos;');
  assert.equal(escapeXml('&lt;'), '&amp;lt;');
  assert.equal(escapeXml('plain áé ç'), 'plain áé ç');
  assert.equal(escapeXml(''), '');
});

test('a line is substituted once: {{...}}, $& and $1 in the text stay literal', () => {
  const s = spec('post-02-metrica');
  slotLines(s, 'headline').lines = ['{{headline.1}}', '$& $1', '{{label_top}}'];
  const r = render(s);
  assert.equal(r.passed, true, JSON.stringify(r.errors));
  const texts = Object.fromEntries(textElements(r.svg).map((t) => [t.id, t.content]));
  assert.equal(texts.headline__0, '{{headline.1}}');
  assert.equal(texts.headline__1, '$&amp; $1');
  assert.equal(texts.headline__2, '{{label_top}}');
  assert.equal(wellFormed(r.svg), null);
});

test('alt_text becomes the aria-label of the root, escaped; the rest of the root is unchanged', () => {
  const s = spec('reel-01-capa');
  s.alt_text = 'Capa com "aspas" & <tags>.';
  const r = render(s);
  assert.equal(r.passed, true);
  assert.match(r.svg, /^<svg [^>]*aria-label="Capa com &quot;aspas&quot; &amp; &lt;tags&gt;\."/);
  assert.equal(wellFormed(r.svg), null);
  const rootOf = (svg) => /<svg\s[^>]*>/.exec(svg)[0].replace(/aria-label="[^"]*"/, 'aria-label=""');
  assert.equal(rootOf(r.svg), rootOf(markupOf('reel-01-capa')));
  assert.match(r.svg, /role="img"/);
});

test('text is NFC in the output, whatever form came in', () => {
  const s = spec('post-02-metrica');
  slotLines(s, 'subhead').lines = ['Indicação'.normalize('NFD')];
  s.alt_text = 'Capa com acentua̧ão decomposta.';
  const r = render(s);
  assert.equal(r.passed, true, JSON.stringify(r.errors));
  assert.equal(r.svg, r.svg.normalize('NFC'));
  assert.ok(textElements(r.svg).find((t) => t.id === 'subhead').content === 'Indicação'.normalize('NFC'));
});

test('everything outside the text contents and the aria-label is byte-for-byte the markup', () => {
  const strip = (svg) => svg.replace(/(<text\s[^>]*>)[^<]*(<\/text>)/g, '$1$2').replace(/aria-label="[^"]*"/, 'aria-label=""');
  for (const id of IDS) {
    const r = render(spec(id));
    assert.equal(strip(r.svg), strip(markupOf(id)), id);
  }
});

test('every text element carries the line the cover_spec gave it (escaped), and no placeholder is left', () => {
  for (const id of IDS) {
    const s = spec(id);
    const r = render(s);
    const texts = Object.fromEntries(textElements(r.svg).map((t) => [t.id, t.content]));
    const template = LIB.templates.find((t) => t.template_id === id);
    for (const slot of template.slots) {
      const lines = s.slots.find((x) => x.slot_id === slot.slot_id).lines;
      elementIds(slot).forEach((eid, i) => assert.equal(texts[eid], escapeXml(lines[i]), `${id}/${eid}`));
    }
    assert.doesNotMatch(r.svg.replace(/>[^<]*</g, '><'), /\{\{/, id);
    assert.equal(Object.values(texts).some((t) => t === ''), false, id);
  }
});

test('fewer lines than max_lines: the unused line elements are dropped, not left empty', () => {
  const s = spec('post-02-metrica');
  slotLines(s, 'headline').lines = ['Só uma linha.'];
  const r = render(s);
  assert.equal(r.passed, true, JSON.stringify(r.errors));
  const ids = textElements(r.svg).map((t) => t.id);
  assert.ok(ids.includes('headline__0'));
  assert.equal(ids.includes('headline__1') || ids.includes('headline__2'), false);
  assert.equal(wellFormed(r.svg), null);
});

// ---- CP-VL5.3: rejected before rendering --------------------------------------------------------

const rejected = (s, ...expected) => {
  const r = render(s);
  assert.equal(r.passed, false);
  assert.equal(r.svg, null);
  assert.deepEqual(reasons(r), expected);
  return r;
};

test('CP-VL5.3: an unknown template is rejected', () => {
  const s = spec('post-02-metrica');
  s.template_id = 'post-99-novo';
  const r = renderCover(s, LIB, { markup: markupOf('post-02-metrica'), geometry });
  assert.deepEqual([r.passed, r.svg, reasons(r)], [false, null, ['template_desconhecido']]);
  assert.equal(r.errors[0].template_id, 'post-99-novo');
});

test('CP-VL5.3: a missing slot, an unknown slot and a repeated slot are rejected', () => {
  const missing = spec('post-02-metrica');
  missing.slots = missing.slots.filter((s) => s.slot_id !== 'subhead');
  assert.equal(rejected(missing, 'slot_ausente').errors[0].slot_id, 'subhead');
  const extra = spec('post-02-metrica');
  extra.slots.push({ slot_id: 'slot_novo', kind: 'claim', lines: ['x'] });
  assert.equal(rejected(extra, 'slot_inexistente').errors[0].slot_id, 'slot_novo');
  const twice = spec('post-02-metrica');
  twice.slots.push(clone(twice.slots[0]));
  rejected(twice, 'slot_repetido');
  const footer = spec('story-01-convite');
  footer.slots = footer.slots.filter((s) => s.slot_id !== 'cfm_footer');
  assert.equal(rejected(footer, 'slot_ausente').errors[0].slot_id, 'cfm_footer');
});

test('CP-VL5.3: a kind that differs from the library is rejected (the library decides, not the model)', () => {
  const s = spec('story-01-convite');
  slotLines(s, 'cta_label').kind = 'chrome';
  const r = rejected(s, 'kind_divergente');
  assert.deepEqual([r.errors[0].kind, r.errors[0].expected], ['chrome', 'claim']);
  const missingKind = spec('story-01-convite');
  delete slotLines(missingKind, 'headline').kind;
  rejected(missingKind, 'kind_divergente');
});

test('CP-VL5.3: text over the budget is rejected: too many lines, too wide, outside the zone, no metric', () => {
  const lines = spec('post-02-metrica');
  slotLines(lines, 'headline').lines = ['a', 'b', 'c', 'd'];
  assert.deepEqual(reasons(render(lines)), ['linhas_excedidas']);
  const wide = spec('post-02-metrica');
  slotLines(wide, 'headline').lines = ['MMMMMMMMMMMM', 'b', 'c'];
  const r = render(wide);
  assert.equal(r.passed, false);
  assert.deepEqual(r.errors.map((e) => [e.reason, e.slot_id, e.line]), [['largura_excedida', 'headline', 0]]);
  const emoji = spec('post-02-metrica');
  slotLines(emoji, 'subhead').lines = ['Indicador \u{1F600}'];
  assert.deepEqual(reasons(render(emoji)), ['caractere_sem_metrica']);
  const footer = spec('story-01-convite');
  slotLines(footer, 'cfm_footer').lines = ['M'.repeat(100)];
  assert.deepEqual(reasons(render(footer)), ['largura_excedida']);
});

test('CP-VL5.3: blank lines, control characters and broken surrogates are rejected', () => {
  const cases = [['   ', 'linha_vazia'], ['', 'linha_vazia'], ['a\nb', 'caractere_invalido_xml'], ['a\tb', 'caractere_invalido_xml'],
    ['a\u0000b', 'caractere_invalido_xml'], ['a\u001Fb', 'caractere_invalido_xml'], ['a\u0085b', 'caractere_invalido_xml'],
    ['a\uFFFEb', 'caractere_invalido_xml'], ['a\uFFFFb', 'caractere_invalido_xml'], ['a\uD800b', 'caractere_invalido_xml'], ['a\uDC00', 'caractere_invalido_xml']];
  for (const [text, reason] of cases) {
    const s = spec('post-02-metrica');
    slotLines(s, 'subhead').lines = [text];
    rejected(s, reason);
  }
  const noLines = spec('post-02-metrica');
  slotLines(noLines, 'subhead').lines = [];
  rejected(noLines, 'linhas_ausentes');
  const alt = spec('post-02-metrica');
  alt.alt_text = '  ';
  rejected(alt, 'alt_text_vazio');
  alt.alt_text = 'a\u0000b';
  rejected(alt, 'caractere_invalido_xml');
});

test('CP-VL5.3: a markup that is not the markup of the library entry is rejected', () => {
  const id = 'post-02-metrica';
  const s = spec(id);
  const markup = markupOf(id);
  const bad = (text, ...expected) => {
    const r = renderCover(s, LIB, { markup: text, geometry });
    assert.deepEqual([r.passed, r.svg, reasons(r)], [false, null, expected]);
  };
  bad(markup.replace('<text id="subhead" ', '<text '), 'markup_texto_sem_slot', 'markup_sem_elemento');
  bad(markup.replace('id="subhead" x="90"', 'id="subhead" x="91"'), 'markup_diverge_da_biblioteca');
  bad(markup.replace('id="headline__0" x="86" y="425"', 'id="headline__0" x="86" y="426"'), 'markup_diverge_da_biblioteca');
  bad(markup.replace(/font-size="110"/, 'font-size="111"'), 'markup_diverge_da_biblioteca');
  bad(markup.replace('id="counter" x="1004" y="1261" font-family="monospace" font-size="19" font-weight="600" fill="#B0AFA6" letter-spacing="2" text-anchor="end"', 'id="counter" x="1004" y="1261" font-family="monospace" font-size="19" font-weight="600" fill="#B0AFA6" letter-spacing="2" text-anchor="start"'), 'markup_diverge_da_biblioteca');
  bad(markup.replace('{{subhead}}', 'Texto de exemplo'), 'marcador_inesperado');
  bad(markup.replace('{{headline.1}}', '{{headline.2}}'), 'marcador_inesperado');
  bad(markup.replace('</svg>', '<text id="extra" x="1" y="1">{{extra}}</text></svg>'), 'markup_texto_sem_slot');
  bad(markup.replace('</svg>', '<text x="1" y="1">solto</text></svg>'), 'markup_texto_sem_slot');
  bad(markup.replace('id="headline__1"', 'id="headline__0"'), 'markup_id_repetido', 'markup_diverge_da_biblioteca', 'marcador_inesperado', 'markup_sem_elemento');
  bad(markup.replace(/ aria-label="[^"]*"/, ''), 'markup_sem_aria_label');
  bad('', 'markup_sem_aria_label', ...Array(10).fill('markup_sem_elemento'));
});

test('geometry decides: a geometry that refuses the lines stops the render, and one that accepts them does not', () => {
  const s = spec('story-01-convite');
  const refuse = { checkSlot: () => ({ passed: false, errors: [{ line: null, reason: 'recusa_de_teste' }], widths: [] }) };
  const r = render(s, { geometry: refuse });
  assert.equal(r.passed, false);
  assert.equal(r.svg, null);
  assert.ok(reasons(r).every((x) => x === 'recusa_de_teste'));
  assert.equal(r.errors.length, LIB.templates.find((t) => t.template_id === s.template_id).slots.length);
  const accept = { checkSlot: () => ({ passed: true, errors: [], widths: [] }) };
  assert.equal(render(s, { geometry: accept }).passed, true);
});

test('the geometry receives the slot as the library describes it, with the lines and the canvas', () => {
  const calls = [];
  const spy = { checkSlot: (...args) => { calls.push(args); return geometry.checkSlot(...args); } };
  const s = spec('reel-01-capa');
  assert.equal(render(s, { geometry: spy }).passed, true);
  const headline = calls.find(([slot]) => slot.maxLines === 3);
  assert.deepEqual(headline[0].fontSize, [164, 126, 108]);
  assert.deepEqual(headline[0].y, [1000, 1165, 1308]);
  assert.deepEqual(headline[1], slotLines(s, 'headline').lines);
  assert.deepEqual(headline[2], { width: 1080, height: 1920 });
  // every other property of the library slot reaches the geometry unchanged
  const template = LIB.templates.find((t) => t.template_id === 'reel-01-capa');
  for (const lib of template.slots) {
    const call = calls.find(([slot, lines]) => JSON.stringify(lines) === JSON.stringify(slotLines(s, lib.slot_id).lines) && slot.maxLines === lib.max_lines);
    assert.ok(call, lib.slot_id);
    assert.deepEqual(call[0], {
      x: lib.x, y: lib.y, anchor: lib.anchor, family: lib.family, fontSize: lib.font_size, weight: lib.weight,
      letterSpacing: lib.letter_spacing, maxLines: lib.max_lines,
    }, lib.slot_id);
  }
});

test('a markup element without text-anchor is a start anchor: right for a start slot, wrong for a middle or end slot', () => {
  const id = 'post-02-metrica';
  const s = spec(id);
  const markup = markupOf(id);
  const startSlot = markup.replace('id="subhead" x="90" y="1042" font-family="Arial, sans-serif" font-size="36" font-weight="400" fill="#B0AFA6" letter-spacing="-1" text-anchor="start"', 'id="subhead" x="90" y="1042" font-family="Arial, sans-serif" font-size="36" font-weight="400" fill="#B0AFA6" letter-spacing="-1"');
  assert.notEqual(startSlot, markup);
  assert.equal(renderCover(s, LIB, { markup: startSlot, geometry }).passed, true);
  const endSlot = markup.replace(' text-anchor="end">{{counter}}', '>{{counter}}');
  assert.notEqual(endSlot, markup);
  assert.deepEqual(reasons(renderCover(s, LIB, { markup: endSlot, geometry })), ['markup_diverge_da_biblioteca']);
});

test('a markup problem stops the render before the cover_spec is looked at: only the markup reasons come back', () => {
  const id = 'post-02-metrica';
  const s = spec(id);
  s.slots = s.slots.filter((x) => x.slot_id !== 'counter'); // also a problem of the cover_spec
  const r = renderCover(s, LIB, { markup: markupOf(id).replace('{{subhead}}', 'Exemplo'), geometry });
  assert.deepEqual(reasons(r), ['marcador_inesperado']);
});

test('every error is reported before any rendering: several problems come back together', () => {
  const s = spec('post-02-metrica');
  s.slots = s.slots.filter((x) => x.slot_id !== 'subhead' && x.slot_id !== 'counter');
  const r = render(s);
  assert.deepEqual(r.errors.map((e) => e.slot_id), ['subhead', 'counter']);
});

// ---- Arguments, contract and scope ---------------------------------------------------------------

test('wrong arguments are a TypeError that names the problem, not a rejection', () => {
  const s = spec('post-02-metrica');
  const o = opts('post-02-metrica');
  const bad = (fn, pattern) => assert.throws(fn, (e) => e instanceof TypeError && pattern.test(e.message));
  bad(() => renderCover(null, LIB, o), /coverSpec must be an object/);
  bad(() => renderCover(s, null, o), /library must be an object/);
  bad(() => renderCover(s, LIB), /options must be an object/);
  bad(() => renderCover(s, LIB, { geometry }), /options\.markup must be a string/);
  bad(() => renderCover(s, LIB, { markup: 7, geometry }), /options\.markup must be a string/);
  bad(() => renderCover(s, LIB, { markup: o.markup }), /options\.geometry must provide checkSlot/);
  bad(() => renderCover(s, LIB, { markup: o.markup, geometry: {} }), /options\.geometry must provide checkSlot/);
  bad(() => renderCover(s, { templates: 'x' }, o), /library\.templates must be an array/);
  bad(() => renderCover({ ...s, slots: 'x' }, LIB, o), /coverSpec\.slots must be an array/);
  bad(() => renderCover({ ...s, template_id: 7 }, LIB, o), /coverSpec\.template_id must be a string/);
  bad(() => renderCover({ ...s, alt_text: undefined }, LIB, o), /coverSpec\.alt_text must be a string/);
  bad(() => renderCover({ ...s, slots: [null] }, LIB, o), /coverSpec\.slots\[0\] must be an object/);
  bad(() => renderCover({ ...s, slots: [{ slot_id: 5, lines: [] }] }, LIB, o), /coverSpec\.slots\[0\]\.slot_id must be a string/);
  bad(() => renderCover({ ...s, slots: [{ slot_id: 'headline', lines: 'x' }] }, LIB, o), /coverSpec\.slots\[0\]\.lines must be an array/);
  const withNumber = clone(s);
  slotLines(withNumber, 'subhead').lines = [5];
  bad(() => render(withNumber), /line 0 of slot subhead must be a string/);
});

test('the synthetic cover_specs pass the cover_spec schema, and the slot sets are the library\'s', () => {
  for (const id of IDS) {
    const s = spec(id);
    assert.deepEqual(validate(COVER_SCHEMA, s).errors, [], id);
    assert.deepEqual(s.slots.map((x) => x.slot_id).sort(), LIB.templates.find((t) => t.template_id === id).slots.map((x) => x.slot_id).sort(), id);
    assert.match(JSON.stringify(s), /"job_id":"00000000-0000-4000-8000-0000000000\d\d"/, id);
  }
});

test('render.js has no require, no I/O, no clock and no randomness (n8n Cloud Code node)', () => {
  const source = readFileSync(join(__dirname, 'render.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.equal(/\brequire\s*\(/.test(source), false);
  assert.equal(/\bimport\b/.test(source), false);
  assert.equal(/\b(fs|process|fetch|eval|Function|Date|Math\.random|setTimeout|crypto)\b/.test(source), false);
});
