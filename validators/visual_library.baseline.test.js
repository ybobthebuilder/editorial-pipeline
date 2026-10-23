'use strict';

// Tests of the real baseline: config/baseline/visual_library.json and the six SVGs in assets/brand.
// The schema and the business rules are tested with synthetic data in visual_library.test.js; here the
// real file must pass them, and the markup must say what the file says (hash, ids, positions, colors).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { validate } = require('./schema.js');
const geometry = require('./geometry.js');
const contrast = require('./contrast.js');
const { checkVisualLibrary } = require('./visual_library.js');

const ROOT = join(__dirname, '..');
const readJson = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const LIB = readJson('config/baseline/visual_library.json');
const SCHEMA = readJson('contracts/visual_library.schema.json');
const TEMPLATE_IDS = readJson('contracts/cover_spec.schema.json').properties.template_id.enum;
const svgOf = (t) => readFileSync(join(ROOT, t.svg), 'utf8');
const TOKEN = Object.fromEntries(LIB.tokens.map((t) => [t.value.toUpperCase(), t.name]));
const FONT = { sans: 'Arial, sans-serif', mono: 'monospace' };

const attrsOf = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const textsOf = (svg) => [...svg.matchAll(/<text\s([^>]*)>([^<]*)<\/text>/g)].map((m) => ({ ...attrsOf(m[1]), content: m[2] }));
const elementsOf = (svg, name) => [...svg.matchAll(new RegExp(`<${name}\\s([^>]*?)/?>`, 'g'))].map((m) => attrsOf(m[1]));

test('the real library passes the schema and every rule of the validator, with the cover_spec template enum', () => {
  assert.deepEqual(validate(SCHEMA, LIB).errors, []);
  const result = checkVisualLibrary(LIB, { templateIds: TEMPLATE_IDS, geometry, contrast });
  assert.deepEqual(result.errors, []);
  assert.equal(result.passed, true);
  assert.deepEqual(LIB.templates.map((t) => t.template_id), TEMPLATE_IDS);
});

test('the five grammars are the ones of the slot map (U3) and the format picks the template (section 5 of the proposal)', () => {
  assert.deepEqual(LIB.grammars.map((g) => [g.grammar_id, g.templates]), [
    ['metrica', ['post-02-metrica']],
    ['manifesto', ['post-01-manifesto']],
    ['capa', ['carousel-01-capa', 'reel-01-capa']],
    ['convite', ['story-01-convite']],
    ['overlay', ['reel-02-overlay']],
  ]);
  const format = (id) => LIB.templates.find((t) => t.template_id === id).format;
  assert.deepEqual(['carousel-01-capa', 'reel-01-capa'].map(format), ['1:1', '9:16']);
});

test('slot counts match the slot map plus the CFM footer: 7, 8, 6, 7, 4 and 4 (30 slots + 6 footers)', () => {
  const counts = Object.fromEntries(LIB.templates.map((t) => [t.template_id, t.slots.length]));
  assert.deepEqual(counts, {
    'post-01-manifesto': 7, 'post-02-metrica': 8, 'carousel-01-capa': 6,
    'story-01-convite': 7, 'reel-01-capa': 4, 'reel-02-overlay': 4,
  });
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 36);
});

test('svg_sha256 is the hash of the file, and no SVG in assets/brand is left out of the library', () => {
  for (const t of LIB.templates) {
    assert.equal(createHash('sha256').update(readFileSync(join(ROOT, t.svg))).digest('hex'), t.svg_sha256, t.template_id);
  }
  const files = readdirSync(join(ROOT, 'assets', 'brand')).filter((f) => f.endsWith('.svg')).sort();
  assert.deepEqual(files, LIB.templates.map((t) => `${t.template_id}.svg`).sort());
});

test('every <text> of an SVG is a slot line, with the id, position, font, color and anchor the library gives it', () => {
  for (const t of LIB.templates) {
    const texts = textsOf(svgOf(t));
    const expected = [];
    for (const s of t.slots) {
      for (let i = 0; i < s.max_lines; i += 1) expected.push({ s, i, id: s.max_lines === 1 ? s.slot_id : `${s.slot_id}__${i}` });
    }
    assert.deepEqual(texts.map((x) => x.id).sort(), expected.map((x) => x.id).sort(), `${t.template_id}: ids`);
    for (const { s, i, id } of expected) {
      const el = texts.find((x) => x.id === id);
      const where = `${t.template_id}/${id}`;
      assert.equal(Number(el.x), s.x, `${where} x`);
      assert.equal(Number(el.y), s.y[i], `${where} y`);
      assert.equal(Number(el['font-size']), s.font_size[i], `${where} font-size`);
      assert.equal(Number(el['font-weight']), s.weight, `${where} weight`);
      assert.equal(Number(el['letter-spacing']), s.letter_spacing, `${where} letter-spacing`);
      assert.equal(el['text-anchor'], s.anchor, `${where} anchor`);
      assert.equal(el['font-family'], FONT[s.family], `${where} family`);
      assert.equal(TOKEN[el.fill.toUpperCase()], s.token, `${where} color`);
    }
  }
});

test('the text of every slot line is a neutral placeholder: {{slot_id}} or {{slot_id.n}}, nothing else', () => {
  for (const t of LIB.templates) {
    for (const el of textsOf(svgOf(t))) {
      const m = /^(.+?)(?:__(\d+))?$/.exec(el.id);
      assert.equal(el.content, m[2] === undefined ? `{{${m[1]}}}` : `{{${m[1]}.${m[2]}}}`, `${t.template_id}/${el.id}`);
    }
  }
});

test('nothing sits in the cut bands: every box and rule is inside the safe zone, and the background is the only full-canvas rect', () => {
  for (const t of LIB.templates) {
    const svg = svgOf(t);
    const zone = geometry.safeZone(t.canvas);
    let fullCanvas = 0;
    for (const r of elementsOf(svg, 'rect')) {
      const x = Number(r.x || 0); const y = Number(r.y || 0); const w = Number(r.width); const h = Number(r.height);
      if (w === t.canvas.width && h === t.canvas.height) { fullCanvas += 1; continue; }
      const where = `${t.template_id} rect ${JSON.stringify(r)}`;
      assert.ok(x >= zone.left && x + w <= zone.right, `${where}: x`);
      assert.ok(y >= zone.top && y + h <= zone.bottom, `${where}: y (zone ${zone.top} to ${zone.bottom})`);
    }
    assert.equal(fullCanvas, 2, `${t.template_id}: background and vignette`);
    for (const l of elementsOf(svg, 'line')) {
      const where = `${t.template_id} line ${JSON.stringify(l)}`;
      for (const x of [l.x1, l.x2]) assert.ok(Number(x) >= zone.left && Number(x) <= zone.right, `${where}: x`);
      for (const y of [l.y1, l.y2]) assert.ok(Number(y) >= zone.top && Number(y) <= zone.bottom, `${where}: y`);
    }
  }
});

test('the canvas of each SVG is the canvas of the library', () => {
  for (const t of LIB.templates) {
    const root = attrsOf(/<svg\s([^>]*)>/.exec(svgOf(t))[1]);
    assert.equal(Number(root.width), t.canvas.width, t.template_id);
    assert.equal(Number(root.height), t.canvas.height, t.template_id);
    assert.equal(root.viewBox, `0 0 ${t.canvas.width} ${t.canvas.height}`, t.template_id);
  }
});

test('the markup is inert: no script, no image, no external reference, no style or event attribute', () => {
  for (const t of LIB.templates) {
    const svg = svgOf(t);
    assert.doesNotMatch(svg, /<script|<image|<foreignObject|<use\b|<style|xlink:href|\bhref=|\son\w+=|javascript:|url\((?!#)/i, t.template_id);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /, t.template_id);
    assert.equal((svg.match(/<svg\b/g) || []).length, 1, t.template_id);
  }
});

test('the old sample positions are gone from the 9:16 templates: label_top 125, story cta 1657, reel-02 second line 1640', () => {
  const y = (tid, slot) => LIB.templates.find((t) => t.template_id === tid).slots.find((s) => s.slot_id === slot).y;
  for (const tid of ['story-01-convite', 'reel-01-capa', 'reel-02-overlay']) assert.deepEqual(y(tid, 'label_top'), [290], tid);
  assert.deepEqual(y('story-01-convite', 'cta_label'), [1462]);
  assert.deepEqual(y('reel-02-overlay', 'headline'), [1357, 1487]);
  assert.deepEqual(y('post-02-metrica', 'label_top'), [125]); // 4:5 keeps the original
  for (const tid of ['story-01-convite', 'reel-01-capa', 'reel-02-overlay']) assert.deepEqual(y(tid, 'cfm_footer'), [1540], tid);
});

test('the tokens are the project\'s six colors and the pairs in use are all allowed', () => {
  assert.deepEqual(LIB.tokens.map((t) => [t.name, t.value]), [
    ['bg', '#0B0B0B'], ['surface', '#141414'], ['fg', '#E7E6D9'], ['muted', '#B0AFA6'], ['accent', '#6236F4'], ['border', '#42413E'],
  ]);
  const used = new Set(LIB.templates.flatMap((t) => t.slots.map((s) => `${s.token}|${s.on}`)));
  const allowed = new Set(LIB.color_pairs.map((p) => `${p.text}|${p.on}`));
  assert.deepEqual([...used].sort(), [...allowed].sort());
});

test('cta_label is a claim, not chrome: the CTA is copy written by the model, so it goes through the prompt and numbers.js (D-17)', () => {
  const holders = LIB.templates.filter((t) => t.slots.some((s) => s.slot_id === 'cta_label')).map((t) => t.template_id);
  assert.deepEqual(holders, ['post-01-manifesto', 'story-01-convite']);
  for (const t of LIB.templates) {
    for (const s of t.slots) assert.equal(s.kind, s.slot_id === 'cta_label' ? 'claim' : s.kind, `${t.template_id}/${s.slot_id}`);
    const cta = t.slots.find((s) => s.slot_id === 'cta_label');
    if (cta) assert.equal(cta.kind, 'claim', t.template_id);
  }
  // the other chrome slots stay chrome
  const chrome = LIB.templates.flatMap((t) => t.slots.filter((s) => s.kind === 'chrome').map((s) => s.slot_id));
  assert.equal(chrome.includes('cta_label'), false);
  assert.ok(chrome.includes('cfm_footer') && chrome.includes('label_top'));
});
