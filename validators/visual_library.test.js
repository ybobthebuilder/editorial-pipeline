'use strict';

// Tests of contracts/visual_library.schema.json (shape) and validators/visual_library.js (rules the
// schema cannot say). Fixtures are synthetic; see fixtures/synthetic/visual_library.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { validate } = require('./schema.js');
const geometry = require('./geometry.js');
const contrast = require('./contrast.js');
const { checkVisualLibrary, FOOTER_FONT_SIZE, THRESHOLDS } = require('./visual_library.js');

const ROOT = join(__dirname, '..');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const SCHEMA = readJson(join(ROOT, 'contracts', 'visual_library.schema.json'));
const fixture = (name) => readJson(join(ROOT, 'fixtures', 'synthetic', 'visual_library', `${name}.json`));
const clone = (value) => JSON.parse(JSON.stringify(value));
const errorsOf = (data) => validate(SCHEMA, data).errors.map((e) => `${e.path}: ${e.message}`);
const paths = (data) => validate(SCHEMA, data).errors.map((e) => e.path);

const IDS = ['post-02-metrica', 'story-01-convite'];
const OPTIONS = { templateIds: IDS, geometry, contrast };
const check = (lib, options = OPTIONS) => checkVisualLibrary(lib, options);
const reasons = (result) => result.errors.map((e) => e.reason);
const valid = () => clone(fixture('valid-01'));
const slotOf = (lib, template, id) => lib.templates.find((t) => t.template_id === template).slots.find((s) => s.slot_id === id);
const only = (lib, ...expected) => assert.deepEqual(reasons(check(lib)), expected);

// ---- Schema ----------------------------------------------------------------------------------

test('the schema stays inside the subset schema.js supports and is closed at every level', () => {
  assert.doesNotThrow(() => validate(SCHEMA, {}));
  assert.equal(SCHEMA.additionalProperties, false);
  assert.deepEqual(SCHEMA.required, ['tokens', 'color_pairs', 'grammars', 'templates']);
  const template = SCHEMA.properties.templates.items;
  assert.equal(template.additionalProperties, false);
  assert.equal(template.properties.slots.items.additionalProperties, false);
  assert.equal(template.properties.canvas.additionalProperties, false);
  assert.equal(SCHEMA.properties.tokens.items.additionalProperties, false);
  assert.equal(SCHEMA.properties.grammars.items.additionalProperties, false);
  assert.equal(SCHEMA.properties.color_pairs.items.additionalProperties, false);
  assert.deepEqual([...template.required].sort(), Object.keys(template.properties).sort());
  const slot = template.properties.slots.items;
  assert.deepEqual([...slot.required].sort(), Object.keys(slot.properties).sort());
});

test('there is no safe zone, band or margin in the file: geometry.js is the only source (Q4)', () => {
  const names = [];
  const walk = (node) => {
    if (node === null || typeof node !== 'object') return;
    if (node.properties) for (const [key, child] of Object.entries(node.properties)) { names.push(key); walk(child); }
    if (node.items) walk(node.items);
  };
  walk(SCHEMA);
  assert.ok(names.length > 20);
  assert.deepEqual(names.filter((n) => /safe|zone|margin|band|exempt/i.test(n)), []);
});

test('the valid fixtures pass the schema; the invalid ones fail for the stated cause only', () => {
  assert.deepEqual(errorsOf(fixture('valid-01')), []);
  assert.deepEqual(errorsOf(fixture('valid-02')), []);
  assert.deepEqual(errorsOf(fixture('invalid-01-slot-kind-out-of-enum')), ['$.templates[0].slots[0].kind: value is not one of the allowed enum members']);
  assert.deepEqual(errorsOf(fixture('invalid-02-missing-svg_sha256')), ['$.templates[1].svg_sha256: missing required property']);
});

test('shape rules: enums, patterns, array lengths and types', () => {
  const cases = [
    [(d) => { d.templates[0].format = '3:4'; }, '$.templates[0].format'],
    [(d) => { d.templates[0].slots[0].family = 'serif'; }, '$.templates[0].slots[0].family'],
    [(d) => { d.templates[0].slots[0].anchor = 'left'; }, '$.templates[0].slots[0].anchor'],
    [(d) => { d.templates[0].slots[0].y = 120; }, '$.templates[0].slots[0].y'],
    [(d) => { d.templates[0].slots[0].y = []; }, '$.templates[0].slots[0].y'],
    [(d) => { d.templates[0].slots[0].font_size = [0]; }, '$.templates[0].slots[0].font_size[0]'],
    [(d) => { d.templates[0].slots[0].max_lines = 0; }, '$.templates[0].slots[0].max_lines'],
    [(d) => { d.templates[0].slots[0].max_lines = 1.5; }, '$.templates[0].slots[0].max_lines'],
    [(d) => { d.templates[0].slots[0].weight = 1001; }, '$.templates[0].slots[0].weight'],
    [(d) => { d.templates[0].slots[0].slot_id = 'Label Top'; }, '$.templates[0].slots[0].slot_id'],
    [(d) => { d.templates[0].slots[0].x = '100'; }, '$.templates[0].slots[0].x'],
    [(d) => { d.templates[0].svg = 'brand/post-02-metrica.svg'; }, '$.templates[0].svg'],
    [(d) => { d.templates[0].svg = 'assets/brand/../x.svg'; }, '$.templates[0].svg'],
    [(d) => { d.templates[0].svg = 'assets/brand/post-02-metrica.png'; }, '$.templates[0].svg'],
    [(d) => { d.templates[0].svg = 'x/assets/brand/post-02-metrica.svg'; }, '$.templates[0].svg'],
    [(d) => { d.templates[0].svg = 'assets/brand/post-02-metrica.svg.exe'; }, '$.templates[0].svg'],
    [(d) => { d.templates[0].svg_sha256 = 'A'.repeat(64); }, '$.templates[0].svg_sha256'],
    [(d) => { d.templates[0].svg_sha256 = `${'0'.repeat(64)}0`; }, '$.templates[0].svg_sha256'],
    [(d) => { d.tokens[0].value = '#1010100'; }, '$.tokens[0].value'],
    [(d) => { d.tokens[0].value = 'x#101010'; }, '$.tokens[0].value'],
    [(d) => { d.templates[0].svg_sha256 = '0'.repeat(63); }, '$.templates[0].svg_sha256'],
    [(d) => { d.templates[0].canvas.width = 0; }, '$.templates[0].canvas.width'],
    [(d) => { d.templates[0].canvas.height = 1350.5; }, '$.templates[0].canvas.height'],
    [(d) => { d.tokens[0].value = '#FFF'; }, '$.tokens[0].value'],
    [(d) => { d.tokens[0].value = 'black'; }, '$.tokens[0].value'],
    [(d) => { d.tokens[0].name = 'Bg'; }, '$.tokens[0].name'],
    [(d) => { d.color_pairs[0].text_size = 'huge'; }, '$.color_pairs[0].text_size'],
    [(d) => { d.grammars[0].templates = []; }, '$.grammars[0].templates'],
    [(d) => { d.grammars[0].description = ''; }, '$.grammars[0].description'],
    [(d) => { d.grammars[0].grammar_id = 'Metrica'; }, '$.grammars[0].grammar_id'],
    [(d) => { d.tokens = []; }, '$.tokens'],
    [(d) => { d.templates = []; }, '$.templates'],
    [(d) => { d.templates[0].slots = []; }, '$.templates[0].slots'],
    [(d) => { d.safe_zone = {}; }, '$.safe_zone'],
  ];
  for (const [mutate, path] of cases) {
    const data = valid();
    mutate(data);
    assert.deepEqual(paths(data), [path], path);
  }
});

test('every field of a slot, a template and a grammar is required', () => {
  for (const key of Object.keys(SCHEMA.properties.templates.items.properties.slots.items.properties)) {
    const data = valid();
    delete data.templates[0].slots[0][key];
    assert.deepEqual(paths(data), [`$.templates[0].slots[0].${key}`], key);
  }
  for (const key of SCHEMA.properties.templates.items.required) {
    const data = valid();
    delete data.templates[1][key];
    assert.deepEqual(paths(data), [`$.templates[1].${key}`], key);
  }
  for (const key of ['grammar_id', 'description', 'templates']) {
    const data = valid();
    delete data.grammars[0][key];
    assert.deepEqual(paths(data), [`$.grammars[0].${key}`], key);
  }
});

test('the schema does not express the rules that the validator checks (documented limits)', () => {
  const data = valid();
  data.templates[0].slots[0].token = 'inexistente';
  data.templates[0].slots[0].y = [10]; // far above the zone
  data.grammars[0].templates = ['nao-existe'];
  assert.deepEqual(errorsOf(data), []);
});

// ---- Validator -------------------------------------------------------------------------------

test('the valid fixtures pass the validator; valid-02 with its own template set', () => {
  assert.deepEqual(check(fixture('valid-01')), { passed: true, errors: [] });
  assert.deepEqual(check(fixture('valid-02'), { ...OPTIONS, templateIds: ['post-01-manifesto'] }), { passed: true, errors: [] });
});

test('the invalid-schema fixtures are not the validator\'s concern, but must not pass it silently either', () => {
  assert.equal(check(fixture('invalid-02-missing-svg_sha256')).passed, true); // svg_sha256 is not read here
  assert.throws(() => check({ ...valid(), templates: undefined }), TypeError);
});

test('duplicate ids are refused: tokens, grammars, templates and the slots of a template', () => {
  const t = valid(); t.tokens.push({ ...t.tokens[0] });
  only(t, 'id_duplicado');
  const g = valid(); g.grammars.push({ ...g.grammars[0] });
  only(g, 'id_duplicado');
  const m = valid(); m.templates.push(clone(m.templates[0]));
  only(m, 'id_duplicado');
  const s = valid(); s.templates[0].slots.push(clone(s.templates[0].slots[0]));
  assert.deepEqual(reasons(check(s)), ['id_duplicado']);
  assert.equal(check(s).errors[0].id, 'label_top');
  // the same slot_id in two different templates is fine
  assert.equal(check(valid()).passed, true);
});

test('color pairs: an unknown token, and a pair under its threshold (4.5 normal, 3 large)', () => {
  assert.deepEqual(THRESHOLDS, { normal: 4.5, large: 3 });
  const unknown = valid(); unknown.color_pairs[0].text = 'nada';
  // fg on bg leaves color_pairs, so the four slots that use it lose their pair as well
  only(unknown, 'token_inexistente', 'par_de_cor_nao_permitido', 'par_de_cor_nao_permitido', 'par_de_cor_nao_permitido', 'par_de_cor_nao_permitido');
  const weak = valid(); weak.tokens.find((t) => t.name === 'muted').value = '#303030';
  assert.ok(reasons(check(weak)).includes('contraste_insuficiente'));
  const e = check(weak).errors.find((x) => x.reason === 'contraste_insuficiente');
  assert.ok(e.ratio < 4.5 && e.min === 4.5 && e.text === 'muted' && e.on === 'bg');
  // the large threshold is 3: a pair between 3 and 4.5 passes as large and fails as normal
  const mid = valid();
  mid.tokens.find((t) => t.name === 'accent').value = '#707070';
  const ratio = contrast.contrastRatio('#707070', '#101010');
  assert.ok(ratio > 3 && ratio < 4.5, String(ratio));
  assert.equal(check(mid).errors.some((x) => x.text === 'accent' && x.on === 'bg'), false);
  mid.color_pairs.find((p) => p.text === 'accent' && p.on === 'bg').text_size = 'normal';
  assert.deepEqual(reasons(check(mid)), ['contraste_insuficiente']);
  // 2.9 fails as large
  const low = valid(); low.tokens.find((t) => t.name === 'accent').value = '#5A5A5A';
  assert.ok(contrast.contrastRatio('#5A5A5A', '#101010') < 3);
  assert.ok(reasons(check(low)).includes('contraste_insuficiente'));
});

test('a slot may use only a pair that color_pairs allows', () => {
  const lib = valid();
  slotOf(lib, 'post-02-metrica', 'headline').token = 'accent'; // accent on bg is allowed (large)
  assert.equal(check(lib).passed, true);
  slotOf(lib, 'post-02-metrica', 'headline').token = 'surface'; // surface on bg is not in color_pairs
  only(lib, 'par_de_cor_nao_permitido');
  const e = check(lib).errors[0];
  assert.deepEqual([e.template_id, e.slot_id, e.token, e.on], ['post-02-metrica', 'headline', 'surface', 'bg']);
  const unknown = valid();
  slotOf(unknown, 'post-02-metrica', 'headline').on = 'nada';
  only(unknown, 'token_inexistente');
});

test('grammars: a missing template, a template outside every grammar, and two templates of one format', () => {
  const missing = valid(); missing.grammars[0].templates.push('nao-existe');
  only(missing, 'gramatica_aponta_template_inexistente');
  const orphan = valid(); orphan.grammars.pop();
  only(orphan, 'template_sem_gramatica');
  const two = valid();
  two.templates.push({ ...clone(two.templates[0]), template_id: 'post-02-outra', svg: 'assets/brand/post-02-outra.svg' });
  two.grammars[0].templates.push('post-02-outra');
  assert.deepEqual(reasons(check(two, { ...OPTIONS, templateIds: [...IDS, 'post-02-outra'] })), ['gramatica_com_dois_templates_no_mesmo_formato']);
  const other = valid(); // a grammar with a 4:5 and a 9:16 template is fine
  other.grammars[0].templates.push('story-01-convite');
  other.grammars.pop();
  assert.equal(check(other).passed, true);
});

test('a grammar\'s one-template-per-format rule uses the format of the canvas, not the declared one', () => {
  const lib = valid();
  // story is declared 4:5 by mistake: its canvas is 9:16, so it does not collide with the 4:5 template
  lib.templates[1].format = '4:5';
  lib.grammars = [{ grammar_id: 'mista', description: 'Sintético.', templates: ['post-02-metrica', 'story-01-convite'] }];
  assert.deepEqual(reasons(check(lib)), ['formato_incoerente']);
});

test('the template set is exactly the cover_spec enum: a missing and an extra id are refused', () => {
  const cover = readJson(join(ROOT, 'contracts', 'cover_spec.schema.json'));
  assert.deepEqual(cover.properties.template_id.enum.length, 6);
  const missing = check(valid(), { ...OPTIONS, templateIds: [...IDS, 'reel-02-overlay'] });
  assert.deepEqual(missing.errors.map((e) => [e.reason, e.template_id]), [['template_ausente', 'reel-02-overlay']]);
  const extra = check(valid(), { ...OPTIONS, templateIds: [IDS[0]] });
  assert.deepEqual(extra.errors.map((e) => [e.reason, e.template_id]), [['template_fora_do_enum', IDS[1]]]);
});

test('format must match the canvas: 1:1, 4:5 and 9:16 by ratio, anything else is incoherent', () => {
  const lib = valid();
  lib.templates[0].format = '1:1';
  only(lib, 'formato_incoerente');
  assert.equal(check(lib).errors[0].derived, '4:5');
  for (const [w, h, f] of [[1080, 1080, '1:1'], [1080, 1350, '4:5'], [1080, 1920, '9:16'], [540, 960, '9:16']]) {
    const t = valid(); t.templates[0].canvas = { width: w, height: h }; t.templates[0].format = f;
    assert.equal(reasons(check(t)).includes('formato_incoerente'), false, `${w}x${h}`);
  }
  const odd = valid(); odd.templates[0].canvas = { width: 1080, height: 1440 };
  only(odd, 'formato_incoerente', 'rodape_cfm_incorreto'); // 3:4 is not one of the three formats
  assert.equal(check(odd).errors[0].derived, null);
});

test('svg path is assets/brand/<template_id>.svg', () => {
  const lib = valid(); lib.templates[0].svg = 'assets/brand/outro.svg';
  only(lib, 'svg_incoerente');
});

test('chrome is not exempt: a 9:16 label at the old y=125 is refused, the same slot on 4:5 passes (decision of 2026-10-22)', () => {
  const story = valid();
  slotOf(story, 'story-01-convite', 'label_top').y = [125];
  only(story, 'fora_da_zona_segura_vertical');
  const e = check(story).errors[0];
  assert.deepEqual([e.template_id, e.slot_id, e.line], ['story-01-convite', 'label_top', 0]);
  const post = valid();
  slotOf(post, 'post-02-metrica', 'label_top').y = [125];
  assert.equal(check(post).passed, true);
  // cta_label at the old y=1657 is below the 1580 line
  const cta = valid();
  slotOf(cta, 'story-01-convite', 'cta_label').y = [1657];
  only(cta, 'fora_da_zona_segura_vertical');
  // the edges come from baselineRange: 277.25 passes, 277 fails (23 px label)
  const edge = valid();
  slotOf(edge, 'story-01-convite', 'label_top').y = [geometry.baselineRange({ width: 1080, height: 1920 }, 23).min];
  assert.equal(check(edge).passed, true);
  slotOf(edge, 'story-01-convite', 'label_top').y = [277];
  only(edge, 'fora_da_zona_segura_vertical');
});

test('every line of a multi-line slot is checked, not only the first', () => {
  const lib = valid();
  slotOf(lib, 'story-01-convite', 'headline').y = [1500, 1640]; // 124 px lines: line 0 ends 1531, line 1 at 1671
  const result = check(lib);
  assert.deepEqual(result.errors.map((e) => [e.reason, e.line]), [['fora_da_zona_segura_vertical', 1]]);
});

test('the anchor changes the room: a centred slot near the left edge has less width than a start slot', () => {
  const lib = valid();
  const label = slotOf(lib, 'post-02-metrica', 'label_top');
  label.x = 70; // 23 px mono advance is 13.8 px: it fits from 70 to the right edge, not in 2 * (70 - 64) = 12 px
  assert.equal(check(lib).passed, true);
  label.anchor = 'middle';
  assert.ok(reasons(check(lib)).includes('largura_excedida'));
});

test('a slot anchored outside the 64 px sides is refused', () => {
  const lib = valid();
  slotOf(lib, 'post-02-metrica', 'label_top').x = 50;
  assert.ok(reasons(check(lib)).includes('ancora_fora_da_zona_segura'));
});

test('y and font_size need one number per line (max_lines)', () => {
  const lib = valid();
  slotOf(lib, 'post-02-metrica', 'headline').y = [430, 540];
  only(lib, 'slot_malformado');
  const sizes = valid();
  slotOf(sizes, 'post-02-metrica', 'headline').font_size = [110];
  only(sizes, 'slot_malformado');
  const lines = valid();
  slotOf(lines, 'post-02-metrica', 'headline').max_lines = 2;
  only(lines, 'slot_malformado');
});

test('the CFM footer: present once in every template, 12 px, centred, at the baseline of geometry.cfmFooterBaseline', () => {
  assert.equal(FOOTER_FONT_SIZE, 12);
  assert.equal(slotOf(valid(), 'story-01-convite', 'cfm_footer').y[0], 1540);
  assert.equal(slotOf(valid(), 'post-02-metrica', 'cfm_footer').y[0], 1283);
  const gone = valid();
  gone.templates[1].slots = gone.templates[1].slots.filter((s) => s.slot_id !== 'cfm_footer');
  only(gone, 'rodape_cfm_ausente');
  const twice = valid();
  twice.templates[0].slots.push(clone(slotOf(twice, 'post-02-metrica', 'cfm_footer')));
  only(twice, 'id_duplicado');
  const wrong = (mutate, fields) => {
    const lib = valid();
    mutate(slotOf(lib, 'story-01-convite', 'cfm_footer'));
    const result = check(lib);
    const e = result.errors.find((x) => x.reason === 'rodape_cfm_incorreto');
    assert.ok(e, JSON.stringify(result.errors));
    assert.deepEqual(e.fields, fields);
  };
  wrong((f) => { f.y = [1560]; }, ['y']); // inside the zone, but not where the decision puts it
  wrong((f) => { f.y = [1500]; }, ['y']);
  wrong((f) => { f.x = 100; f.anchor = 'start'; }, ['anchor', 'x']);
  wrong((f) => { f.x = 541; }, ['x']);
  wrong((f) => { f.y = [1540, 1540]; }, ['y']); // one baseline per line, and the footer has one line
  wrong((f) => { f.font_size = [14]; }, ['font_size']);
  wrong((f) => { f.kind = 'claim'; }, ['kind']);
  wrong((f) => { f.max_lines = 2; f.y = [1540, 1540]; f.font_size = [12, 12]; }, ['max_lines', 'font_size']);
});

test('the footer position follows the canvas: bottom margin on non-9:16, above the 1580 line on 9:16', () => {
  const post = valid();
  slotOf(post, 'post-02-metrica', 'cfm_footer').y = [1540]; // the 9:16 value on a 4:5 canvas
  assert.ok(reasons(check(post)).includes('rodape_cfm_incorreto') || reasons(check(post)).includes('fora_da_zona_segura_vertical'));
  const story = valid();
  slotOf(story, 'story-01-convite', 'cfm_footer').y = [1913 - 64 - 3]; // the post rule on a 9:16 canvas
  assert.ok(reasons(check(story)).includes('rodape_cfm_incorreto'));
});

test('a footer family or weight is not fixed by any decision, so any of the two families passes', () => {
  for (const family of ['sans', 'mono']) {
    const lib = valid();
    slotOf(lib, 'story-01-convite', 'cfm_footer').family = family;
    assert.equal(check(lib).passed, true, family);
  }
});

test('a text_size that is neither normal nor large is a TypeError, not a pair that passes by default', () => {
  const lib = valid();
  lib.color_pairs[0].text_size = 'huge';
  assert.throws(() => check(lib), (e) => e instanceof TypeError && /text_size must be normal or large/.test(e.message));
});

test('missing or malformed options are a TypeError that names the problem', () => {
  const named = (fn, pattern) => assert.throws(fn, (e) => e instanceof TypeError && pattern.test(e.message));
  named(() => checkVisualLibrary(valid(), { templateIds: IDS, geometry, contrast: undefined }), /options\.contrast/);
  named(() => checkVisualLibrary(valid(), { templateIds: IDS, geometry: undefined, contrast }), /options\.geometry/);
  named(() => checkVisualLibrary(valid(), { geometry, contrast }), /options\.templateIds/);
  for (const key of ['tokens', 'color_pairs', 'grammars', 'templates']) {
    const lib = valid(); lib[key] = 'x';
    named(() => check(lib), new RegExp(`library\\.${key} must be an array`));
  }
  assert.throws(() => checkVisualLibrary(valid()), TypeError);
  assert.throws(() => checkVisualLibrary(valid(), {}), TypeError);
  assert.throws(() => checkVisualLibrary(valid(), { templateIds: IDS }), TypeError);
  assert.throws(() => checkVisualLibrary(valid(), { ...OPTIONS, geometry: {} }), TypeError);
  assert.throws(() => checkVisualLibrary(valid(), { ...OPTIONS, geometry: { checkSlot: geometry.checkSlot } }), TypeError);
  assert.throws(() => checkVisualLibrary(valid(), { ...OPTIONS, contrast: {} }), TypeError);
  assert.throws(() => checkVisualLibrary(valid(), { ...OPTIONS, templateIds: 'x' }), TypeError);
  assert.throws(() => checkVisualLibrary(null, OPTIONS), TypeError);
  assert.throws(() => checkVisualLibrary([], OPTIONS), TypeError);
  for (const key of ['tokens', 'color_pairs', 'grammars', 'templates']) {
    const lib = valid(); lib[key] = 'x';
    assert.throws(() => check(lib), TypeError, key);
  }
});

test('the validator does not mutate its input', () => {
  const lib = valid();
  const before = JSON.stringify(lib);
  check(lib);
  slotOf(lib, 'story-01-convite', 'label_top').y = [125];
  const mutated = JSON.stringify(lib);
  check(lib);
  assert.equal(JSON.stringify(lib), mutated);
  assert.notEqual(before, mutated);
});

test('visual_library.js has no require and no I/O (n8n Cloud Code node)', () => {
  const source = readFileSync(join(__dirname, 'visual_library.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.equal(/\brequire\s*\(/.test(source), false);
  assert.equal(/\bimport\b/.test(source), false);
  assert.equal(/\b(fs|process|fetch|eval|Function)\b/.test(source), false);
});

test('the fixtures are synthetic: NFC text, placeholder hashes, no brand path other than assets/brand/<id>.svg', () => {
  for (const name of ['valid-01', 'valid-02', 'invalid-01-slot-kind-out-of-enum', 'invalid-02-missing-svg_sha256']) {
    const text = readFileSync(join(ROOT, 'fixtures', 'synthetic', 'visual_library', `${name}.json`), 'utf8');
    assert.equal(text, text.normalize('NFC'), name);
    for (const m of text.matchAll(/"svg_sha256": "([0-9a-f]{64})"/g)) assert.match(m[1], /^0{63}[0-9a-f]$/, name);
  }
});
