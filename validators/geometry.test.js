'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { DEFAULT_MARGIN, PLATFORM_BANDS_9_16, UNITS_PER_EM, platformBands, safeZone, baselineRange, cfmFooterBaseline, measureText, availableWidth, checkSlot, charBudget } = require('./geometry.js');
const { readMetrics, CODE_POINTS } = require('../scripts/extract-font-metrics.js');

const POST = { width: 1080, height: 1350 };
const STORY = { width: 1080, height: 1920 };
// Slot geometry from docs/visual-layer/slot-map-v0.md (VERIFIED there from the template SVGs).
const METRICA_HEADLINE = { x: 86, y: 425, fontSize: 110, family: 'sans', weight: 600, letterSpacing: -2, lineHeight: 112, maxLines: 3 };
const METRICA_SUBHEAD = { x: 90, y: 1042, fontSize: 36, family: 'sans', weight: 400, letterSpacing: -1, maxLines: 1 };
const FOOTER = { x: 76, y: 1261, fontSize: 19, family: 'mono', weight: 600, letterSpacing: 2, maxLines: 1 };
const REEL_HEADLINE = { x: 82, y: [1000, 1165, 1308], fontSize: [164, 126, 108], family: 'sans', weight: 600, letterSpacing: -2, maxLines: 3 };
const reasons = (result) => result.errors.map((e) => [e.line, e.reason]);

test('the safe zone is the canvas minus the 64 px margin on every side, plus the 9:16 bands (U19, D-08, U23)', () => {
  assert.equal(DEFAULT_MARGIN, 64);
  assert.deepEqual(safeZone(POST), { left: 64, top: 64, right: 1016, bottom: 1286, width: 952, height: 1222 });
  assert.deepEqual(safeZone({ width: 1080, height: 1080 }), { left: 64, top: 64, right: 1016, bottom: 1016, width: 952, height: 952 });
  // 9:16: 64 px at the sides, 260 px on top and 340 px at the bottom (both rules together).
  assert.deepEqual(safeZone(STORY), { left: 64, top: 260, right: 1016, bottom: 1580, width: 952, height: 1320 });
  assert.equal(safeZone(POST, 90).width, 900);
});

test('platform bands exist only on a 9:16 canvas, decided by the ratio and not by the pixel size (U23)', () => {
  assert.deepEqual(PLATFORM_BANDS_9_16, { top: 260, bottom: 340 });
  assert.deepEqual(platformBands(STORY), { top: 260, bottom: 340 });
  assert.deepEqual(platformBands({ width: 540, height: 960 }), { top: 260, bottom: 340 });
  for (const canvas of [POST, { width: 1080, height: 1080 }, { width: 1080, height: 1919 }, { width: 1081, height: 1920 }, { width: 1920, height: 1080 }]) {
    assert.deepEqual(platformBands(canvas), { top: 0, bottom: 0 }, JSON.stringify(canvas));
  }
  assert.throws(() => platformBands(null), TypeError);
  assert.throws(() => platformBands({ width: 1080 }), TypeError);
});

test('margin and bands combine by the larger of the two on each side, never by adding them', () => {
  assert.deepEqual(safeZone(STORY, 64, { top: 0, bottom: 0 }), { left: 64, top: 64, right: 1016, bottom: 1856, width: 952, height: 1792 });
  assert.deepEqual(safeZone(STORY, 64, { top: 30, bottom: 500 }), { left: 64, top: 64, right: 1016, bottom: 1420, width: 952, height: 1356 });
  // A margin larger than a band wins on that side: 300 on top, the 340 band at the bottom.
  assert.deepEqual(safeZone(STORY, 300), { left: 300, top: 300, right: 780, bottom: 1580, width: 480, height: 1280 });
  assert.deepEqual(safeZone(STORY, 400), { left: 400, top: 400, right: 680, bottom: 1520, width: 280, height: 1120 });
});

test('safeZone refuses malformed bands and bands that leave no vertical room', () => {
  for (const bad of [null, 5, 'x', {}, { top: 1 }, { bottom: 1 }, { top: -1, bottom: 0 }, { top: 0, bottom: -1 }, { top: Number.NaN, bottom: 0 }, { top: '260', bottom: 340 }]) {
    assert.throws(() => safeZone(STORY, 64, bad), TypeError, JSON.stringify(bad));
  }
  assert.throws(() => safeZone(STORY, 64, { top: 960, bottom: 960 }), RangeError);
  assert.doesNotThrow(() => safeZone(STORY, 64, { top: 960, bottom: 959 }));
});

test('safeZone refuses a bad canvas or a margin that leaves no room', () => {
  assert.throws(() => safeZone(null), TypeError);
  assert.throws(() => safeZone({ width: 1080 }), TypeError);
  assert.throws(() => safeZone({ width: 0, height: 10 }), TypeError);
  assert.throws(() => safeZone({ width: 10.5, height: 10 }), TypeError);
  assert.throws(() => safeZone(POST, -1), RangeError);
  assert.throws(() => safeZone({ width: 100, height: 100 }, 50), RangeError);
  assert.throws(() => safeZone(POST, Number.NaN), RangeError);
});

test('sans advance widths come from the font tables: at 2048 px one unit is one px', () => {
  const sans = (text, weight) => measureText(text, { family: 'sans', fontSize: UNITS_PER_EM, weight }).width;
  assert.equal(sans('a', 400), 1139);
  assert.equal(sans('i', 400), 455);
  assert.equal(sans('i', 700), 569);
  assert.equal(sans('ai', 400), 1139 + 455);
  assert.equal(sans(' ', 400), 569);
  assert.equal(sans('', 400), 0);
});

test('weight 600 and up measures as Bold, below 600 as Regular (Arial has only those two)', () => {
  const w = (weight) => measureText('i', { family: 'sans', fontSize: UNITS_PER_EM, weight }).width;
  assert.equal(w(599), 455);
  assert.equal(w(600), 569);
  assert.equal(w(900), 569);
  assert.equal(measureText('i', { family: 'sans', fontSize: UNITS_PER_EM }).width, 455);
});

test('mono has one advance of 1229/2048 em for every supported character', () => {
  const mono = (text) => measureText(text, { family: 'mono', fontSize: UNITS_PER_EM, weight: 600 });
  assert.equal(mono('i').width, 1229);
  assert.equal(mono('W').width, 1229);
  assert.equal(mono('01 / 06').width, 7 * 1229);
  assert.equal(measureText('01 / 06', { family: 'mono', fontSize: 19, weight: 600, letterSpacing: 2 }).width, (7 * 1229 * 19) / 2048 + 14);
});

test('letter-spacing is added after every character, the last included, and may be negative', () => {
  const style = { family: 'sans', fontSize: UNITS_PER_EM };
  assert.equal(measureText('ab', { ...style, letterSpacing: 5 }).width, 1139 + 1139 + 10);
  assert.equal(measureText('ab', { ...style, letterSpacing: -2 }).width, 1139 + 1139 - 4);
  assert.equal(measureText('a', { ...style, letterSpacing: 0 }).width, 1139);
});

test('PT-BR text is measured: accents are in the table and NFC makes combining marks equal', () => {
  const style = { family: 'sans', fontSize: UNITS_PER_EM };
  assert.deepEqual(measureText('a\u00e7\u00e3o cora\u00e7\u00e3o \u00e9 \u00e0 \u00fc', style).unsupported, []);
  // Without NFC the combining mark is a character with no width, so unsupported must stay empty.
  assert.deepEqual(measureText('e\u0301', style), measureText('\u00e9', style));
  assert.deepEqual(measureText('c\u0327a\u0303o', style), measureText('\u00e7\u00e3o', style));
  assert.deepEqual(measureText('c\u0327a\u0303o', style).unsupported, []);
  assert.equal(measureText('e\u0301', { ...style, letterSpacing: 3 }).width, 1139 + 3); // one character, not two
});

test('a character with no width is reported and not guessed or counted', () => {
  const style = { family: 'sans', fontSize: UNITS_PER_EM };
  const result = measureText('a\u2212a\u2212\u20ac', style);
  assert.deepEqual(result.unsupported, ['\u2212', '\u20ac']);
  assert.equal(result.width, 2 * 1139);
  assert.deepEqual(measureText('\n', style).unsupported, ['\n']);
  assert.deepEqual(measureText('\u00b7', style).unsupported, ['\u00b7']);
  assert.deepEqual(measureText('\u{1F600}', style).unsupported, ['\u{1F600}']);
  assert.deepEqual(measureText('\u201cok\u201d \u2013 \u2026', style).unsupported, []);
});

test('measureText refuses malformed input', () => {
  assert.throws(() => measureText(5, { family: 'sans', fontSize: 10 }), TypeError);
  assert.throws(() => measureText('a', null), TypeError);
  assert.throws(() => measureText('a', { family: 'serif', fontSize: 10 }), TypeError);
  assert.throws(() => measureText('a', { family: 'sans', fontSize: 0 }), TypeError);
  assert.throws(() => measureText('a', { family: 'sans', fontSize: Number.NaN }), TypeError);
  assert.throws(() => measureText('a', { family: 'sans', fontSize: 10, weight: 0 }), TypeError);
  assert.throws(() => measureText('a', { family: 'sans', fontSize: 10, letterSpacing: '1' }), TypeError);
});

test('widths of real lines agree with the Helvetica-Bold and Helvetica AFM widths to 0.5 px', () => {
  // Expected values computed outside this repo from the AFM widths (reportlab), 2026-10-22.
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.5, `${actual} vs ${expected}`);
  const bold = { family: 'sans', fontSize: 110, weight: 600, letterSpacing: -2 };
  near(measureText('De 84% para 92%', bold).width, 874.86);
  near(measureText('em um ano', bold).width, 562.69);
  near(measureText('Pacientes com melhora clinica', { family: 'sans', fontSize: 36, weight: 400, letterSpacing: -1 }).width, 457.144);
});

test('available width runs from the anchor to the zone edge', () => {
  assert.equal(availableWidth({ x: 86, anchor: 'start' }, POST), 930);
  assert.equal(availableWidth({ x: 90 }, POST), 926);
  assert.equal(availableWidth({ x: 1004, anchor: 'end' }, POST), 940);
  assert.equal(availableWidth({ x: 540, anchor: 'middle' }, POST), 952);
  assert.equal(availableWidth({ x: 300, anchor: 'middle' }, POST), 2 * (300 - 64));
  assert.equal(availableWidth({ x: 800, anchor: 'middle' }, POST), 2 * (1016 - 800));
  assert.equal(availableWidth({ x: 86 }, POST, 90), 904);
});

test('a headline that fits passes, with the measured widths returned', () => {
  const result = checkSlot(METRICA_HEADLINE, ['De 84% para 92%', 'em um ano'], POST);
  assert.equal(result.passed, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.widths.length, 2);
  assert.ok(result.widths[0] > 870 && result.widths[0] < 880);
});

test('a line wider than the room fails with width and maxWidth', () => {
  const result = checkSlot(METRICA_HEADLINE, ['De 84% para 92% ao ano'], POST);
  assert.equal(result.passed, false);
  assert.deepEqual(reasons(result), [[0, 'largura_excedida']]);
  assert.equal(result.errors[0].maxWidth, 930);
  assert.ok(result.errors[0].width > 930);
});

test('the boundary is exact: width equal to the room passes, a hair more fails', () => {
  const canvas = { width: 1000, height: 1000 };
  const base = { x: 64, y: 500, fontSize: 100, family: 'sans', weight: 400, maxLines: 1 };
  const room = 872;
  const natural = measureText('a', base).width;
  assert.equal(checkSlot({ ...base, letterSpacing: room - natural }, ['a'], canvas).passed, true);
  const over = checkSlot({ ...base, letterSpacing: room - natural + 0.01 }, ['a'], canvas);
  assert.deepEqual(reasons(over), [[0, 'largura_excedida']]);
});

test('the 64 px margin, not 90 px, is the limit: the same text passes at 64 and fails at 90', () => {
  const slot = { x: 90, y: 500, fontSize: 100, family: 'sans', weight: 400, maxLines: 1 };
  const line = `${'a'.repeat(16)}i`; // 16 * 55.6 + 22.2 = 911.9 px, between the 900 and 926 px rooms
  assert.equal(checkSlot(slot, [line], POST).passed, true);
  assert.deepEqual(reasons(checkSlot(slot, [line], POST, { margin: 90 })), [[0, 'largura_excedida']]);
});

test('under the old 90 px margin x=86 was outside the zone (slot-map-v0 section 3); under 64 px it is inside', () => {
  const slot = { x: 86, y: 500, fontSize: 100, family: 'sans', weight: 400, maxLines: 1 };
  assert.equal(checkSlot(slot, ['a'], POST).passed, true);
  assert.deepEqual(reasons(checkSlot(slot, ['a'], POST, { margin: 90 })), [[null, 'ancora_fora_da_zona_segura']]);
});

test('too many lines fail, and the extra lines are not measured', () => {
  const result = checkSlot(METRICA_SUBHEAD, ['um', 'dois'], POST);
  assert.deepEqual(reasons(result), [[null, 'linhas_excedidas']]);
  assert.equal(result.errors[0].lines, 2);
  assert.equal(result.errors[0].maxLines, 1);
  assert.equal(result.widths.length, 1);
});

test('an unsupported character fails the line that holds it', () => {
  const result = checkSlot(METRICA_SUBHEAD, ['queda de \u22123 pp'], POST);
  assert.deepEqual(reasons(result), [[0, 'caractere_sem_metrica']]);
  assert.deepEqual(result.errors[0].characters, ['\u2212']);
});

test('an anchor outside the zone fails: x=50 starts inside the 64 px margin', () => {
  assert.deepEqual(reasons(checkSlot({ ...METRICA_SUBHEAD, x: 50 }, ['ok'], POST)), [[null, 'ancora_fora_da_zona_segura']]);
  assert.deepEqual(reasons(checkSlot({ ...METRICA_SUBHEAD, x: 63.9 }, ['ok'], POST)), [[null, 'ancora_fora_da_zona_segura']]);
  assert.equal(checkSlot({ ...METRICA_SUBHEAD, x: 64 }, ['ok'], POST).passed, true);
  assert.deepEqual(reasons(checkSlot({ ...METRICA_SUBHEAD, x: 1017, anchor: 'end' }, ['ok'], POST)), [[null, 'ancora_fora_da_zona_segura']]);
  assert.equal(checkSlot({ ...METRICA_SUBHEAD, x: 1016, anchor: 'end' }, ['ok'], POST).passed, true); // the right edge itself is inside
  assert.deepEqual(reasons(checkSlot({ ...METRICA_SUBHEAD, x: 1016 }, ['ok'], POST)), [[0, 'largura_excedida']]); // start at the edge: no room
});

test('vertical bounds use the baseline plus conservative cap and descent ratios', () => {
  // bottom = baseline + 0.25 * size; zone bottom is 1286 on a 1350 canvas.
  assert.equal(checkSlot(FOOTER, ['01 / 06'], POST).passed, true); // 1261 + 4.75
  assert.equal(checkSlot({ ...FOOTER, y: 1281.25 }, ['01 / 06'], POST).passed, true); // exactly 1286
  assert.deepEqual(reasons(checkSlot({ ...FOOTER, y: 1281.5 }, ['01 / 06'], POST)), [[0, 'fora_da_zona_segura_vertical']]);
  // top = baseline - 0.75 * size; zone top is 64.
  const label = { x: 118, y: 125, fontSize: 23, family: 'mono', weight: 600, letterSpacing: 2, maxLines: 1 };
  assert.equal(checkSlot(label, ['PESQUISA'], POST).passed, true);
  assert.equal(checkSlot({ ...label, y: 81.25 }, ['PESQUISA'], POST).passed, true); // 81.25 - 17.25 = 64
  assert.deepEqual(reasons(checkSlot({ ...label, y: 81 }, ['PESQUISA'], POST)), [[0, 'fora_da_zona_segura_vertical']]);
});

test('later lines are checked vertically: a pitch that pushes the last line out fails it', () => {
  const slot = { ...METRICA_HEADLINE, y: 1180, lineHeight: 112 };
  const result = checkSlot(slot, ['um', 'dois', 'tres'], POST);
  assert.deepEqual(reasons(result), [[1, 'fora_da_zona_segura_vertical'], [2, 'fora_da_zona_segura_vertical']]);
});

test('per-line sizes and baselines (reel-01 headline) are measured line by line', () => {
  assert.equal(checkSlot(REEL_HEADLINE, ['Reduz', 'o risco', 'em 12%'], STORY).passed, true);
  // Nine M: 1212 px at 164 px (line 0), 927 px at 126 px (line 1) and 810 px at 108 px (line 2),
  // against 934 px of room, so only line 0 overflows.
  const nine = checkSlot(REEL_HEADLINE, ['MMMMMMMMM', 'MMMMMMMMM', 'MMMMMMMMM'], STORY);
  assert.deepEqual(reasons(nine), [[0, 'largura_excedida']]);
  assert.ok(Math.abs(nine.errors[0].width - 1212) < 1);
  assert.ok(Math.abs(nine.widths[1] - 927) < 1);
  const lastOnly = checkSlot(REEL_HEADLINE, ['ok', 'ok', 'MMMMMMMMMMM'], STORY);
  assert.deepEqual(reasons(lastOnly), [[2, 'largura_excedida']]);
});

test('9:16: text inside the 260 px top band or the 340 px bottom band fails; the same slot passes on a post canvas (U23)', () => {
  const label = { x: 118, y: 125, fontSize: 23, family: 'mono', weight: 600, letterSpacing: 2, maxLines: 1 };
  const inTop = checkSlot(label, ['PESQUISA'], STORY);
  assert.deepEqual(reasons(inTop), [[0, 'fora_da_zona_segura_vertical']]);
  assert.equal(inTop.errors[0].zoneTop, 260);
  assert.equal(inTop.errors[0].zoneBottom, 1580);
  assert.equal(checkSlot(label, ['PESQUISA'], POST).passed, true);
  // reel-02 headline: two lines at 133 px, pitch 130, first baseline 1510.
  const reel2 = { x: 83, y: 1510, fontSize: 133, family: 'sans', weight: 600, letterSpacing: -2, lineHeight: 130, maxLines: 2 };
  // Line 0 ends at 1543 and fits; line 1 ends at 1673 and crosses the 1580 edge.
  assert.deepEqual(reasons(checkSlot(reel2, ['Linha um', 'Linha dois'], STORY)), [[1, 'fora_da_zona_segura_vertical']]);
  assert.equal(checkSlot(reel2, ['Linha um', 'Linha dois'], STORY, { bands: { top: 0, bottom: 0 } }).passed, true);
});

test('9:16: the band edges are exact: baseline + 0.25 size = 1580 and baseline - 0.75 size = 260 pass, a hair beyond fails', () => {
  const slot = { x: 100, y: 1555, fontSize: 100, family: 'sans', weight: 400, maxLines: 1 };
  assert.equal(checkSlot(slot, ['ok'], STORY).passed, true); // bottom 1555 + 25 = 1580
  assert.deepEqual(reasons(checkSlot({ ...slot, y: 1555.5 }, ['ok'], STORY)), [[0, 'fora_da_zona_segura_vertical']]);
  assert.equal(checkSlot({ ...slot, y: 335 }, ['ok'], STORY).passed, true); // top 335 - 75 = 260
  assert.deepEqual(reasons(checkSlot({ ...slot, y: 334.5 }, ['ok'], STORY)), [[0, 'fora_da_zona_segura_vertical']]);
});

test('the 64 px sides still apply on 9:16 together with the bands, and the bands never change the width', () => {
  const slot = { x: 50, y: 800, fontSize: 40, family: 'sans', weight: 400, maxLines: 1 };
  assert.deepEqual(reasons(checkSlot(slot, ['ok'], STORY)), [[null, 'ancora_fora_da_zona_segura']]);
  assert.equal(availableWidth({ x: 82, anchor: 'start' }, STORY), 934);
  assert.equal(availableWidth({ x: 82, anchor: 'start' }, STORY, 64), availableWidth({ x: 82, anchor: 'start' }, { width: 1080, height: 1350 }, 64));
  assert.deepEqual(charBudget(REEL_HEADLINE, STORY), charBudget(REEL_HEADLINE, STORY, { margin: 64 }));
});

test('a malformed slot or lines is a TypeError, not a quiet pass', () => {
  assert.throws(() => checkSlot(null, ['a'], POST), TypeError);
  assert.throws(() => checkSlot({ ...METRICA_SUBHEAD, x: '90' }, ['a'], POST), TypeError);
  assert.throws(() => checkSlot({ ...METRICA_SUBHEAD, anchor: 'left' }, ['a'], POST), TypeError);
  assert.throws(() => checkSlot({ ...METRICA_SUBHEAD, maxLines: 0 }, ['a'], POST), TypeError);
  assert.throws(() => checkSlot({ ...METRICA_HEADLINE, lineHeight: undefined }, ['a'], POST), TypeError);
  assert.throws(() => checkSlot({ ...REEL_HEADLINE, fontSize: [164, 126] }, ['a'], STORY), TypeError);
  assert.throws(() => checkSlot({ ...REEL_HEADLINE, y: [1000, 'x', 1308] }, ['a'], STORY), TypeError);
  assert.throws(() => checkSlot(METRICA_SUBHEAD, 'a', POST), TypeError);
  assert.throws(() => checkSlot(METRICA_SUBHEAD, [1], POST), TypeError);
  assert.throws(() => checkSlot(METRICA_SUBHEAD, ['a', 5], POST), TypeError); // a non-string past maxLines is still malformed
  assert.throws(() => checkSlot({ ...REEL_HEADLINE, fontSize: [164, 126, 108, 100] }, ['a'], STORY), TypeError);
  assert.throws(() => checkSlot({ ...METRICA_HEADLINE, maxLines: 2, lineHeight: undefined }, ['a'], POST), TypeError);
  assert.throws(() => checkSlot(METRICA_SUBHEAD, ['a'], null), TypeError);
});

test('char budget matches an independent calculation (A-Z, 0-9, space mean over the AFM widths)', () => {
  // Expected values computed outside this repo from Helvetica-Bold/Helvetica AFM, 2026-10-22.
  assert.deepEqual(charBudget(METRICA_HEADLINE, POST), [13, 13, 13]);
  assert.deepEqual(charBudget(METRICA_SUBHEAD, POST), [42]);
  assert.deepEqual(charBudget(REEL_HEADLINE, STORY), [9, 11, 13]);
});

test('char budget for mono is exact: floor(room / (0.6001 em + spacing))', () => {
  const mono = { x: 64, y: 500, fontSize: 100, family: 'mono', weight: 400, maxLines: 1 };
  assert.deepEqual(charBudget(mono, POST), [15]); // 952 / 60.0098
  assert.deepEqual(charBudget({ ...mono, letterSpacing: 2 }, POST), [15]); // 952 / 62.0098 = 15.35
  assert.deepEqual(charBudget({ ...mono, letterSpacing: 10 }, POST), [13]); // 952 / 70.0098 = 13.6
});

test('char budget shrinks with size, grows with a smaller margin, and is never negative', () => {
  const slot = { x: 90, y: 500, fontSize: 40, family: 'sans', weight: 600, maxLines: 1 };
  const small = charBudget(slot, POST)[0];
  assert.ok(charBudget({ ...slot, fontSize: 80 }, POST)[0] < small);
  assert.ok(charBudget(slot, POST, { margin: 40 })[0] > small);
  assert.deepEqual(charBudget({ ...slot, x: 1016 }, POST), [0]);
  assert.deepEqual(charBudget({ ...slot, x: 1100 }, POST), [0]);
});

test('char budget refuses spacing that cancels the character width', () => {
  const slot = { x: 64, y: 500, fontSize: 10, family: 'mono', weight: 400, letterSpacing: -7, maxLines: 1 }; // 6.001 - 7 < 0
  assert.throws(() => charBudget(slot, POST), RangeError);
  assert.throws(() => charBudget({ ...slot, letterSpacing: -6.0009765625 }, POST), RangeError); // exactly 1229/2048*10: zero is refused too
  assert.deepEqual(charBudget({ ...slot, letterSpacing: -6 }, POST), [Math.floor(952 / 0.0009765625)]); // just above zero is allowed
});

test('text written within the char budget of a realistic uppercase line fits when measured', () => {
  const budget = charBudget(METRICA_HEADLINE, POST)[0];
  const line = 'RESULTADOS OBTIDOS COM TRATAMENTO'.slice(0, budget).trimEnd();
  assert.equal(checkSlot(METRICA_HEADLINE, [line], POST).passed, true);
});

test('the module has no require() or import, so it runs in the n8n Cloud Code node', () => {
  const source = readFileSync(join(__dirname, 'geometry.js'), 'utf8');
  assert.equal(/\brequire\s*\(/.test(source), false);
  assert.equal(/^\s*import\s/m.test(source), false);
});

// The embedded tables must be exactly what the extractor reads from the font files, so that the
// numbers keep their origin. Locally it is skipped when the Liberation files are missing; in CI
// (CI is set) it never skips, because a skipped check would leave the tables unguarded.
const FONT_DIR = process.env.LIBERATION_FONT_DIR || '/usr/share/fonts/truetype/liberation';
const fontFile = (name) => join(FONT_DIR, `Liberation${name}.ttf`);
const haveFonts = ['Sans-Regular', 'Sans-Bold', 'Mono-Regular', 'Mono-Bold'].every((n) => existsSync(fontFile(n)));

test('embedded width tables equal the Liberation files (skipped without the fonts, except in CI)', { skip: !haveFonts && !process.env.CI && 'Liberation fonts not installed' }, () => {
  assert.ok(haveFonts, `Liberation fonts not found in ${FONT_DIR}; CI installs fonts-liberation`);
  for (const [name, style] of [
    ['Sans-Regular', { family: 'sans', weight: 400 }],
    ['Sans-Bold', { family: 'sans', weight: 700 }],
    ['Mono-Regular', { family: 'mono', weight: 400 }],
    ['Mono-Bold', { family: 'mono', weight: 700 }],
  ]) {
    const metrics = readMetrics(readFileSync(fontFile(name)));
    assert.equal(metrics.unitsPerEm, UNITS_PER_EM);
    assert.equal(Object.keys(metrics.widths).length, CODE_POINTS.length, `${name}: every listed code point has a glyph`);
    for (const code of CODE_POINTS) {
      const ch = String.fromCodePoint(code);
      const measured = measureText(ch, { ...style, fontSize: UNITS_PER_EM }).width;
      assert.equal(measured, metrics.widths[code], `${name} U+${code.toString(16)}`);
    }
  }
});

test('the code points left out of the table are refused', () => {
  const style = { family: 'sans', fontSize: 10 };
  for (const code of [0xaf, 0xb1, 0xb5, 0xb7, 0xf7, 0x2212]) {
    assert.deepEqual(measureText(String.fromCodePoint(code), style).unsupported, [String.fromCodePoint(code)], `U+${code.toString(16)}`);
  }
});

test('baselineRange: the baselines that keep one line inside the zone, 9:16 and post (chrome is not exempt)', () => {
  // 9:16: top = 260 + 0.75 size, bottom = 1580 - 0.25 size.
  assert.deepEqual(baselineRange(STORY, 23), { min: 277.25, max: 1574.25 });
  assert.deepEqual(baselineRange(STORY, 28), { min: 281, max: 1573 });
  // Post 1080x1350: the 64 px margin on both sides of the height.
  assert.deepEqual(baselineRange(POST, 23), { min: 81.25, max: 1280.25 });
  assert.deepEqual(baselineRange(STORY, 100, { bands: { top: 0, bottom: 0 } }), { min: 139, max: 1831 });
  assert.deepEqual(baselineRange(STORY, 100, { margin: 300 }), { min: 375, max: 1555 });
  assert.throws(() => baselineRange(STORY, 0), TypeError);
  assert.throws(() => baselineRange(STORY, '23'), TypeError);
  assert.throws(() => baselineRange(null, 23), TypeError);
});

test('baselineRange agrees with checkSlot at both edges, on 9:16 and on a post', () => {
  for (const canvas of [STORY, POST]) {
    const { min, max } = baselineRange(canvas, 23);
    const slot = { x: 118, y: min, fontSize: 23, family: 'mono', weight: 600, letterSpacing: 2, maxLines: 1 };
    assert.equal(checkSlot(slot, ['PESQUISA'], canvas).passed, true, `min ${canvas.height}`);
    assert.equal(checkSlot({ ...slot, y: max }, ['PESQUISA'], canvas).passed, true, `max ${canvas.height}`);
    assert.deepEqual(reasons(checkSlot({ ...slot, y: min - 0.5 }, ['PESQUISA'], canvas)), [[0, 'fora_da_zona_segura_vertical']]);
    assert.deepEqual(reasons(checkSlot({ ...slot, y: max + 0.5 }, ['PESQUISA'], canvas)), [[0, 'fora_da_zona_segura_vertical']]);
  }
});

test('the old chrome baselines fail on 9:16 and pass on a post: label_top at 125 and story-01 cta_label at 1657', () => {
  assert.ok(125 < baselineRange(STORY, 23).min);
  assert.ok(125 >= baselineRange(POST, 23).min);
  assert.ok(1657 > baselineRange(STORY, 28).max);
});

test('CFM footer baseline: 1540 on 1080x1920, above the 1580 line (decision of 2026-10-22)', () => {
  assert.equal(cfmFooterBaseline(STORY, 12), 1540);
  const footer = { x: 540, y: cfmFooterBaseline(STORY, 12), anchor: 'middle', fontSize: 12, family: 'sans', weight: 400, maxLines: 1 };
  const result = checkSlot(footer, ['Nome Sobrenome \u2013 M\u00c9DICO \u2013 CRM/SP 123456'], STORY);
  assert.deepEqual(result.errors, []);
  assert.equal(result.passed, true);
  // The footer's own box (cap 9 above, descent 3 below) ends at 1543, well above the 1580 line.
  assert.ok(1540 + 0.25 * 12 < safeZone(STORY).bottom);
  assert.ok(cfmFooterBaseline(STORY, 12) <= baselineRange(STORY, 12).max);
});

test('CFM footer baseline on a post canvas: the descent ends on the 64 px bottom margin, whatever the height', () => {
  assert.equal(cfmFooterBaseline(POST, 12), 1283); // 1350 - 64 - 3
  assert.equal(cfmFooterBaseline({ width: 1080, height: 1080 }, 12), 1013);
  // 1080x1440 is not among the six templates; the rule is the same, by the canvas and not by a list.
  assert.equal(cfmFooterBaseline({ width: 1080, height: 1440 }, 12), 1373);
  assert.equal(cfmFooterBaseline(POST, 20), 1281); // the descent scales with the size
  for (const canvas of [POST, { width: 1080, height: 1080 }, { width: 1080, height: 1440 }]) {
    const slot = { x: canvas.width / 2, y: cfmFooterBaseline(canvas, 12), anchor: 'middle', fontSize: 12, family: 'sans', weight: 400, maxLines: 1 };
    assert.equal(checkSlot(slot, ['Nome \u2013 M\u00c9DICO \u2013 CRM/SP 1'], canvas).passed, true, String(canvas.height));
    assert.deepEqual(reasons(checkSlot({ ...slot, y: slot.y + 0.5 }, ['Nome'], canvas)), [[0, 'fora_da_zona_segura_vertical']], String(canvas.height));
  }
});

test('CFM footer baseline refuses a malformed size or canvas', () => {
  assert.throws(() => cfmFooterBaseline(STORY, 0), TypeError);
  assert.throws(() => cfmFooterBaseline(STORY, -12), TypeError);
  assert.throws(() => cfmFooterBaseline(STORY, '12'), TypeError);
  assert.throws(() => cfmFooterBaseline(STORY, Number.NaN), TypeError);
  assert.throws(() => cfmFooterBaseline(null, 12), TypeError);
  assert.throws(() => cfmFooterBaseline({ width: 1080 }, 12), TypeError);
});
