'use strict';

// Design-time tool: reads advance widths from TrueType files so that validators/geometry.js
// carries a table with a known origin instead of guessed numbers (decision U20, 2026-10-22).
// No dependencies. Usage:
//   node scripts/extract-font-metrics.js <font.ttf>            prints JSON
// The same parser is exported for tests. Only cmap format 4 (BMP) is read; any other subtable
// is ignored, and a missing code point is reported as absent, never defaulted.

const { readFileSync } = require('node:fs');

// Code points the covers can use: ASCII, Latin-1 (PT-BR accents) and typographic marks. Anything
// outside is refused by geometry.js, not measured. Left out on purpose, because their Liberation
// Sans width differs from the Helvetica/Arial AFM width in the cross-check of 2026-10-22: U+00AF
// U+00B1 U+00B5 U+00B7 U+00F7; U+2212 (minus) was inconclusive in that check.
const LEFT_OUT = new Set([0xaf, 0xb1, 0xb5, 0xb7, 0xf7, 0x2212]);
const CODE_POINTS = [];
for (let c = 0x20; c <= 0x7e; c += 1) CODE_POINTS.push(c);
for (let c = 0xa0; c <= 0xff; c += 1) if (!LEFT_OUT.has(c)) CODE_POINTS.push(c);
for (const c of [0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026]) CODE_POINTS.push(c);

function tables(buf) {
  const count = buf.readUInt16BE(4);
  const out = {};
  for (let i = 0; i < count; i += 1) {
    const at = 12 + 16 * i;
    out[buf.toString('latin1', at, at + 4)] = { offset: buf.readUInt32BE(at + 8), length: buf.readUInt32BE(at + 12) };
  }
  return out;
}

function cmapFormat4(buf, cmap) {
  const n = buf.readUInt16BE(cmap.offset + 2);
  for (let i = 0; i < n; i += 1) {
    const rec = cmap.offset + 4 + 8 * i;
    const platform = buf.readUInt16BE(rec);
    const encoding = buf.readUInt16BE(rec + 2);
    const at = cmap.offset + buf.readUInt32BE(rec + 4);
    if (buf.readUInt16BE(at) === 4 && ((platform === 3 && encoding === 1) || platform === 0)) return at;
  }
  throw new Error('no cmap format 4 subtable (platform 3/1 or 0)');
}

function glyphOf(buf, at, code) {
  const segX2 = buf.readUInt16BE(at + 6);
  const ends = at + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  for (let s = 0; s < segX2; s += 2) {
    const end = buf.readUInt16BE(ends + s);
    if (code > end) continue;
    const start = buf.readUInt16BE(starts + s);
    if (code < start) return 0;
    const delta = buf.readInt16BE(deltas + s);
    const off = buf.readUInt16BE(ranges + s);
    if (off === 0) return (code + delta) & 0xffff;
    const g = buf.readUInt16BE(ranges + s + off + 2 * (code - start));
    return g === 0 ? 0 : (g + delta) & 0xffff;
  }
  return 0;
}

// Returns { unitsPerEm, widths: { [codePoint]: advance } } in font units. Vertical metrics are not
// read: the OS/2 cap height of Liberation Sans (1409) is not Arial's, so it would mislead.
function readMetrics(buf) {
  const t = tables(buf);
  const unitsPerEm = buf.readUInt16BE(t.head.offset + 18);
  const hMetrics = buf.readUInt16BE(t.hhea.offset + 34);
  const sub = cmapFormat4(buf, t.cmap);
  const widths = {};
  for (const code of CODE_POINTS) {
    const g = glyphOf(buf, sub, code);
    if (g === 0) continue;
    const idx = Math.min(g, hMetrics - 1);
    widths[code] = buf.readUInt16BE(t.hmtx.offset + 4 * idx);
  }
  return { unitsPerEm, widths };
}

module.exports = { CODE_POINTS, readMetrics };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write('usage: node scripts/extract-font-metrics.js <font.ttf>\n');
    process.exit(2);
  }
  process.stdout.write(`${JSON.stringify(readMetrics(readFileSync(file)))}\n`);
}
