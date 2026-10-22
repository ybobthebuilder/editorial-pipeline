'use strict';

// Text geometry for the covers (gate QA-OVF and QA-SAFE, stage 07_COVERS). Code measures, the LLM
// writes: the model is told a conservative character budget per line, and this file refuses any
// text whose measured width leaves the safe zone. Pure JS, no dependencies (n8n Cloud compatible).
//
// Safe zone (decision U19, 2026-10-22): D-08 fixes a 64 px outer margin on every side; the safe
// zone is what remains, so a 1080x1350 canvas has 952x1222 usable. The 260/340 px platform bands
// that templates.json declares for 9:16 are NOT enforced here; that is still an open question.
//
// Fonts (decision U20, 2026-10-22): Arial for text, Courier New for numbers and codes, as
// design-time fallbacks until Figma in Phase 5. The container has neither file, so the tables
// below are advance widths read from Liberation Sans Regular/Bold and Liberation Mono, which are
// designed as metric-compatible with Arial and Courier New (vendor claim, not verified here).
//   VERIFIED  by scripts/extract-font-metrics.js from fonts-liberation 1:2.1.5-3 (head.fontRevision
//             137625):
//     LiberationSans-Regular.ttf sha256 4659bc0c58c5028dd488ec928d41d9265db43d9b669fc14ca8b0832daca7b144
//     LiberationSans-Bold.ttf    sha256 3973aa5054fb467dd5627245d3dc82e37bf16fe075756156a570455871351582
//     LiberationMono-Regular.ttf sha256 395fa5ab8d40c8eba390ced528744ea75a7f69aabf3e68b6f925ca0e39a27370
//     LiberationMono-Bold.ttf    sha256 626655e94dd82f3f42549daf995c921b0915fa8ab1f4b839559e8892ea41d240
//     Mono has one advance (1229/2048 em) for all 194 code points, in both weights.
//   VERIFIED  cross-check against the Helvetica AFM widths (the Arial widths follow Helvetica):
//             185 of 190 comparable Latin-1 code points agree within 1/1000 em; U+00AF U+00B1 U+00B5
//             U+00B7 U+00F7 differ and are left out of the table. The 8 typographic marks agree.
//             U+2212 was inconclusive and is left out; use the hyphen-minus.
//   UNKNOWN   real Arial and Courier New files were never measured. Replace the tables from the
//             real files with scripts/extract-font-metrics.js when Phase 5 settles the fonts.
//
// Known limits, on purpose: kerning is not applied (renderers usually kern, which only narrows
// text in practice, but that is not proven); SVG letter-spacing is added after every code point,
// the last included; Arial has Regular and Bold only, so any weight from 600 up measures as Bold.
// A code point without a width makes the line fail ("caractere_sem_metrica"); it is never guessed.
// The character budget is a hint for the prompt. The measured width is what decides.

const UNITS_PER_EM = 2048;
const MONO_ADVANCE = 1229;
const DEFAULT_MARGIN = 64;
const BOLD_FROM_WEIGHT = 600;
// PROPOSED, deliberately rounded up. The Liberation cap height (0.688 em) is not Arial's
// (about 0.716 em), so vertical bounds use these conservative ratios instead of font data.
const CAP_RATIO = 0.75;
const DESCENT_RATIO = 0.25;
const EPSILON = 1e-9;
const REFERENCE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';
const FAMILIES = ['sans', 'mono'];
const ANCHORS = ['start', 'middle', 'end'];

const SANS_REGULAR = {
  32: 569, 33: 569, 34: 727, 35: 1139, 36: 1139, 37: 1821, 38: 1366, 39: 391,
  40: 682, 41: 682, 42: 797, 43: 1196, 44: 569, 45: 682, 46: 569, 47: 569,
  48: 1139, 49: 1139, 50: 1139, 51: 1139, 52: 1139, 53: 1139, 54: 1139, 55: 1139,
  56: 1139, 57: 1139, 58: 569, 59: 569, 60: 1196, 61: 1196, 62: 1196, 63: 1139,
  64: 2079, 65: 1366, 66: 1366, 67: 1479, 68: 1479, 69: 1366, 70: 1251, 71: 1593,
  72: 1479, 73: 569, 74: 1024, 75: 1366, 76: 1139, 77: 1706, 78: 1479, 79: 1593,
  80: 1366, 81: 1593, 82: 1479, 83: 1366, 84: 1251, 85: 1479, 86: 1366, 87: 1933,
  88: 1366, 89: 1366, 90: 1251, 91: 569, 92: 569, 93: 569, 94: 961, 95: 1139,
  96: 682, 97: 1139, 98: 1139, 99: 1024, 100: 1139, 101: 1139, 102: 569, 103: 1139,
  104: 1139, 105: 455, 106: 455, 107: 1024, 108: 455, 109: 1706, 110: 1139, 111: 1139,
  112: 1139, 113: 1139, 114: 682, 115: 1024, 116: 569, 117: 1139, 118: 1024, 119: 1479,
  120: 1024, 121: 1024, 122: 1024, 123: 684, 124: 532, 125: 684, 126: 1196, 160: 569,
  161: 682, 162: 1139, 163: 1139, 164: 1139, 165: 1139, 166: 532, 167: 1139, 168: 682,
  169: 1509, 170: 758, 171: 1139, 172: 1196, 173: 682, 174: 1509, 176: 819, 178: 682,
  179: 682, 180: 682, 182: 1100, 184: 682, 185: 682, 186: 748, 187: 1139, 188: 1708,
  189: 1708, 190: 1708, 191: 1251, 192: 1366, 193: 1366, 194: 1366, 195: 1366, 196: 1366,
  197: 1366, 198: 2048, 199: 1479, 200: 1366, 201: 1366, 202: 1366, 203: 1366, 204: 569,
  205: 569, 206: 569, 207: 569, 208: 1479, 209: 1479, 210: 1593, 211: 1593, 212: 1593,
  213: 1593, 214: 1593, 215: 1196, 216: 1593, 217: 1479, 218: 1479, 219: 1479, 220: 1479,
  221: 1366, 222: 1366, 223: 1251, 224: 1139, 225: 1139, 226: 1139, 227: 1139, 228: 1139,
  229: 1139, 230: 1821, 231: 1024, 232: 1139, 233: 1139, 234: 1139, 235: 1139, 236: 569,
  237: 569, 238: 569, 239: 569, 240: 1139, 241: 1139, 242: 1139, 243: 1139, 244: 1139,
  245: 1139, 246: 1139, 248: 1251, 249: 1139, 250: 1139, 251: 1139, 252: 1139, 253: 1024,
  254: 1139, 255: 1024, 8211: 1139, 8212: 2048, 8216: 455, 8217: 455, 8220: 682, 8221: 682,
  8226: 717, 8230: 2048,
};

const SANS_BOLD = {
  32: 569, 33: 682, 34: 971, 35: 1139, 36: 1139, 37: 1821, 38: 1479, 39: 487,
  40: 682, 41: 682, 42: 797, 43: 1196, 44: 569, 45: 682, 46: 569, 47: 569,
  48: 1139, 49: 1139, 50: 1139, 51: 1139, 52: 1139, 53: 1139, 54: 1139, 55: 1139,
  56: 1139, 57: 1139, 58: 682, 59: 682, 60: 1196, 61: 1196, 62: 1196, 63: 1251,
  64: 1997, 65: 1479, 66: 1479, 67: 1479, 68: 1479, 69: 1366, 70: 1251, 71: 1593,
  72: 1479, 73: 569, 74: 1139, 75: 1479, 76: 1251, 77: 1706, 78: 1479, 79: 1593,
  80: 1366, 81: 1593, 82: 1479, 83: 1366, 84: 1251, 85: 1479, 86: 1366, 87: 1933,
  88: 1366, 89: 1366, 90: 1251, 91: 682, 92: 569, 93: 682, 94: 1196, 95: 1139,
  96: 682, 97: 1139, 98: 1251, 99: 1139, 100: 1251, 101: 1139, 102: 682, 103: 1251,
  104: 1251, 105: 569, 106: 569, 107: 1139, 108: 569, 109: 1821, 110: 1251, 111: 1251,
  112: 1251, 113: 1251, 114: 797, 115: 1139, 116: 682, 117: 1251, 118: 1139, 119: 1593,
  120: 1139, 121: 1139, 122: 1024, 123: 797, 124: 573, 125: 797, 126: 1196, 160: 569,
  161: 682, 162: 1139, 163: 1139, 164: 1139, 165: 1139, 166: 573, 167: 1139, 168: 682,
  169: 1509, 170: 758, 171: 1139, 172: 1196, 173: 682, 174: 1509, 176: 819, 178: 682,
  179: 682, 180: 682, 182: 1139, 184: 682, 185: 682, 186: 748, 187: 1139, 188: 1708,
  189: 1708, 190: 1708, 191: 1251, 192: 1479, 193: 1479, 194: 1479, 195: 1479, 196: 1479,
  197: 1479, 198: 2048, 199: 1479, 200: 1366, 201: 1366, 202: 1366, 203: 1366, 204: 569,
  205: 569, 206: 569, 207: 569, 208: 1479, 209: 1479, 210: 1593, 211: 1593, 212: 1593,
  213: 1593, 214: 1593, 215: 1196, 216: 1593, 217: 1479, 218: 1479, 219: 1479, 220: 1479,
  221: 1366, 222: 1366, 223: 1251, 224: 1139, 225: 1139, 226: 1139, 227: 1139, 228: 1139,
  229: 1139, 230: 1821, 231: 1139, 232: 1139, 233: 1139, 234: 1139, 235: 1139, 236: 569,
  237: 569, 238: 569, 239: 569, 240: 1251, 241: 1251, 242: 1251, 243: 1251, 244: 1251,
  245: 1251, 246: 1251, 248: 1251, 249: 1251, 250: 1251, 251: 1251, 252: 1251, 253: 1139,
  254: 1251, 255: 1139, 8211: 1139, 8212: 2048, 8216: 569, 8217: 569, 8220: 1024, 8221: 1024,
  8226: 717, 8230: 2048,
};

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function assertCanvas(canvas) {
  if (canvas === null || typeof canvas !== 'object' || !Number.isInteger(canvas.width) || !Number.isInteger(canvas.height) || canvas.width <= 0 || canvas.height <= 0) {
    throw new TypeError('canvas must be { width, height } with positive integers');
  }
}

// The rectangle where text may sit: the canvas minus the margin on every side.
function safeZone(canvas, margin = DEFAULT_MARGIN) {
  assertCanvas(canvas);
  if (!isNumber(margin) || margin < 0 || 2 * margin >= Math.min(canvas.width, canvas.height)) {
    throw new RangeError('margin must be a number from 0 up to less than half of the smaller canvas side');
  }
  return {
    left: margin,
    top: margin,
    right: canvas.width - margin,
    bottom: canvas.height - margin,
    width: canvas.width - 2 * margin,
    height: canvas.height - 2 * margin,
  };
}

function assertStyle(style) {
  if (style === null || typeof style !== 'object') throw new TypeError('style must be an object');
  if (!FAMILIES.includes(style.family)) throw new TypeError('style.family must be one of: sans, mono');
  if (!isNumber(style.fontSize) || style.fontSize <= 0) throw new TypeError('style.fontSize must be a positive number');
  if (style.weight !== undefined && (!isNumber(style.weight) || style.weight < 1 || style.weight > 1000)) {
    throw new TypeError('style.weight must be a number from 1 to 1000');
  }
  if (style.letterSpacing !== undefined && !isNumber(style.letterSpacing)) {
    throw new TypeError('style.letterSpacing must be a number');
  }
}

function advanceTable(style) {
  const bold = (style.weight === undefined ? 400 : style.weight) >= BOLD_FROM_WEIGHT;
  return bold ? SANS_BOLD : SANS_REGULAR;
}

// Width in px of one line of text. Returns { width, unsupported }, where unsupported lists the
// distinct characters that have no width in the table; they are not counted in width.
function measureText(text, style) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  assertStyle(style);
  const spacing = style.letterSpacing === undefined ? 0 : style.letterSpacing;
  // Mono shares the code points of the sans table: same set, one source, one advance.
  const table = style.family === 'sans' ? advanceTable(style) : SANS_REGULAR;
  let units = 0;
  let count = 0;
  const unsupported = [];
  for (const ch of text.normalize('NFC')) {
    count += 1;
    const known = table[ch.codePointAt(0)];
    if (known === undefined) {
      if (!unsupported.includes(ch)) unsupported.push(ch);
    } else {
      units += style.family === 'mono' ? MONO_ADVANCE : known;
    }
  }
  return { width: (units / UNITS_PER_EM) * style.fontSize + count * spacing, unsupported };
}

function assertSlot(slot) {
  if (slot === null || typeof slot !== 'object') throw new TypeError('slot must be an object');
  if (!isNumber(slot.x)) throw new TypeError('slot.x must be a number');
  if (slot.anchor !== undefined && !ANCHORS.includes(slot.anchor)) throw new TypeError('slot.anchor must be one of: start, middle, end');
  if (!Number.isInteger(slot.maxLines) || slot.maxLines < 1) throw new TypeError('slot.maxLines must be an integer of at least 1');
  for (const key of ['y', 'fontSize']) {
    const value = slot[key];
    if (Array.isArray(value)) {
      if (value.length !== slot.maxLines || !value.every(isNumber)) throw new TypeError(`slot.${key} as an array needs one number per line (maxLines)`);
    } else if (!isNumber(value)) {
      throw new TypeError(`slot.${key} must be a number or an array of numbers`);
    }
  }
  if (!Array.isArray(slot.y) && slot.maxLines > 1 && !isNumber(slot.lineHeight)) {
    throw new TypeError('slot.lineHeight is required when y is a number and maxLines > 1');
  }
  const sizes = Array.isArray(slot.fontSize) ? slot.fontSize : [slot.fontSize];
  for (const fontSize of sizes) assertStyle({ family: slot.family, fontSize, weight: slot.weight, letterSpacing: slot.letterSpacing });
}

function lineStyle(slot, i) {
  return {
    family: slot.family,
    fontSize: Array.isArray(slot.fontSize) ? slot.fontSize[i] : slot.fontSize,
    weight: slot.weight,
    letterSpacing: slot.letterSpacing,
  };
}

function baselineOf(slot, i) {
  return Array.isArray(slot.y) ? slot.y[i] : slot.y + i * (slot.lineHeight || 0);
}

// Horizontal room for a line: from the anchor to the zone edge (both edges for "middle").
function availableWidth(slot, canvas, margin = DEFAULT_MARGIN) {
  const zone = safeZone(canvas, margin);
  const anchor = slot.anchor === undefined ? 'start' : slot.anchor;
  if (anchor === 'start') return zone.right - slot.x;
  if (anchor === 'end') return slot.x - zone.left;
  return 2 * Math.min(slot.x - zone.left, zone.right - slot.x);
}

// Every anchor sits at x, so x itself must be inside the zone.
function anchorInside(slot, zone) {
  return slot.x >= zone.left && slot.x <= zone.right;
}

// Checks the lines of one slot against the safe zone. Returns { passed, errors, widths }:
//   errors: { line, reason, ... }   line is the index, or null for the slot as a whole
//   reasons: linhas_excedidas, ancora_fora_da_zona_segura, caractere_sem_metrica,
//            largura_excedida (with width and maxWidth), fora_da_zona_segura_vertical
// slot: { x, y, anchor, fontSize, family, weight, letterSpacing, lineHeight, maxLines }
//   y is the first baseline, or one baseline per line; fontSize may also be one per line.
function checkSlot(slot, lines, canvas, options = {}) {
  assertSlot(slot);
  if (!Array.isArray(lines) || lines.some((l) => typeof l !== 'string')) throw new TypeError('lines must be an array of strings');
  const zone = safeZone(canvas, options.margin === undefined ? DEFAULT_MARGIN : options.margin);
  const errors = [];
  const widths = [];
  if (lines.length > slot.maxLines) errors.push({ line: null, reason: 'linhas_excedidas', lines: lines.length, maxLines: slot.maxLines });
  if (!anchorInside(slot, zone)) errors.push({ line: null, reason: 'ancora_fora_da_zona_segura', x: slot.x });
  const maxWidth = availableWidth(slot, canvas, options.margin === undefined ? DEFAULT_MARGIN : options.margin);
  lines.slice(0, slot.maxLines).forEach((text, i) => {
    const style = lineStyle(slot, i);
    const { width, unsupported } = measureText(text, style);
    widths.push(width);
    if (unsupported.length > 0) errors.push({ line: i, reason: 'caractere_sem_metrica', characters: unsupported });
    if (width > maxWidth + EPSILON) errors.push({ line: i, reason: 'largura_excedida', width, maxWidth });
    const baseline = baselineOf(slot, i);
    const top = baseline - CAP_RATIO * style.fontSize;
    const bottom = baseline + DESCENT_RATIO * style.fontSize;
    if (top < zone.top - EPSILON || bottom > zone.bottom + EPSILON) {
      errors.push({ line: i, reason: 'fora_da_zona_segura_vertical', top, bottom, zoneTop: zone.top, zoneBottom: zone.bottom });
    }
  });
  return { passed: errors.length === 0, errors, widths };
}

// Conservative characters per line, one entry per line of the slot, for the prompt. It divides
// the room by the mean width of A-Z, 0-9 and space at the slot style (all caps is the wide case).
// It is a hint: text with many W or M can still overflow, and checkSlot is what refuses it.
function charBudget(slot, canvas, options = {}) {
  assertSlot(slot);
  const margin = options.margin === undefined ? DEFAULT_MARGIN : options.margin;
  const room = availableWidth(slot, canvas, margin);
  const budget = [];
  for (let i = 0; i < slot.maxLines; i += 1) {
    const style = lineStyle(slot, i);
    const spacing = style.letterSpacing === undefined ? 0 : style.letterSpacing;
    const reference = measureText(REFERENCE_CHARS, { ...style, letterSpacing: 0 });
    const perChar = reference.width / REFERENCE_CHARS.length + spacing;
    if (!(perChar > 0)) throw new RangeError('letterSpacing makes the average character width zero or negative');
    budget.push(Math.max(0, Math.floor((room + EPSILON) / perChar)));
  }
  return budget;
}

module.exports = {
  DEFAULT_MARGIN,
  UNITS_PER_EM,
  safeZone,
  measureText,
  availableWidth,
  checkSlot,
  charBudget,
};
