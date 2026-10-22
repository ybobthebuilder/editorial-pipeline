'use strict';

// WCAG 2.x contrast ratio between two sRGB colors. Pure JS, no dependencies
// (n8n Cloud compatible).
//
// Source (official W3C repository, read 2026-10-22):
//   w3c/wcag guidelines/terms/20/relative-luminance.html
//   w3c/wcag guidelines/terms/20/contrast-ratio.html
//   L = 0.2126 * R + 0.7152 * G + 0.0722 * B, with each channel linearized as
//   c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4, where c = value8bit / 255.
//   ratio = (L1 + 0.05) / (L2 + 0.05), L1 the lighter and L2 the darker color.
//
// The ratio is returned unrounded on purpose: thresholds such as 4.5:1 must be
// compared against the raw value, so 4.499 never passes as 4.5.

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function parseHex(color) {
  if (typeof color !== 'string') {
    throw new TypeError(`color must be a string, received ${color === null ? 'null' : typeof color}`);
  }
  const match = HEX_COLOR.exec(color);
  if (!match) {
    throw new RangeError(`color must be #RGB or #RRGGBB, received ${JSON.stringify(color)}`);
  }
  const digits = match[1].length === 3
    ? match[1].split('').map((digit) => digit + digit).join('')
    : match[1];
  return [0, 2, 4].map((offset) => parseInt(digits.slice(offset, offset + 2), 16));
}

function linearize(channel8bit) {
  const srgb = channel8bit / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color) {
  const [red, green, blue] = parseHex(color).map(linearize);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(colorA, colorB) {
  const luminanceA = relativeLuminance(colorA);
  const luminanceB = relativeLuminance(colorB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

module.exports = { contrastRatio, relativeLuminance };
