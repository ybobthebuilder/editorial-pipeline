'use strict';

// Render core of stage 08_RENDER (VL-5, decision D-03: SVG in the MVP). renderCover takes a validated
// cover_spec, the visual_library and the markup of the template, and returns the final SVG as a string.
// Pure, deterministic JS with no require, no clock, no random, no network and no file access (n8n Cloud
// Code node). The same input gives the same bytes.
//
// Inputs:
//   coverSpec  a cover_spec document (contracts/cover_spec.schema.json), already valid against the schema
//   library    config/baseline/visual_library.json, already valid against its schema and validators/
//              visual_library.js (the render does not repeat that check on every call)
//   options    { markup, geometry }
//                markup    the text of assets/brand/<template_id>.svg. The caller loads it and checks its
//                          hash against library.templates[].svg_sha256; how the markup reaches the n8n
//                          stage is not decided (UNKNOWN), which is why it is an input and not a read
//                          geometry  { checkSlot } from validators/geometry.js
//
// Result: { passed, errors, svg }. When anything is wrong, passed is false, svg is null and nothing was
// rendered (CP-VL5.3: reject before rendering). Bad arguments (wrong types) are a TypeError.
//
// What is checked before rendering, in this order:
//   - the template exists in the library and the markup is the markup of that library entry (every
//     <text> id, position, size and anchor equals the library's; each placeholder is the expected one);
//   - every slot of the template is in the cover_spec exactly once, with the kind the library gives it,
//     and the cover_spec has no slot that the template lacks;
//   - every line is a single line of well-formed XML text, not blank;
//   - geometry.checkSlot accepts the lines (line count, width, safe zone, characters with a width).
//
// Escaping: the five XML characters & < > " ' become entities; text is NFC; a line is substituted
// once, in one pass, so a line that contains "{{x}}" stays literal. alt_text replaces the aria-label of the
// root element, escaped the same way.
//
// Limits, on purpose: PNG is not produced (D-03). Fonts are not embedded: the markup names Arial and
// monospace and the viewer picks the file, so widths are the geometry.js estimate, not a measurement of
// the final render. Kerning is not applied (see geometry.js).

const TEXT_ELEMENT = /<text\s([^>]*)>([^<]*)<\/text>/g;
const ROOT_TAG = /<svg\s[^>]*>/;
const ARIA_LABEL = /(\saria-label=")[^"]*(")/;
// XML 1.0 Char: #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]. Lines may not
// hold tab, line feed or carriage return either: a line is one line.
const FORBIDDEN = /[\u0000-\u001F\u007F-\u009F\uFFFE\uFFFF]/;
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

function assertObject(value, what) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${what} must be an object`);
}

function assertArray(value, what) {
  if (!Array.isArray(value)) throw new TypeError(`${what} must be an array`);
}

const escapeXml = (text) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

function attrsOf(source) {
  const out = {};
  for (const m of source.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

// True when the string has a lone surrogate (not valid in XML, and invisible to a regex without the u flag).
function hasLoneSurrogate(text) {
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) return true;
      i += 1;
    } else if (c >= 0xDC00 && c <= 0xDFFF) {
      return true;
    }
  }
  return false;
}

function elementIds(slot) {
  return slot.max_lines === 1 ? [slot.slot_id] : Array.from({ length: slot.max_lines }, (_, i) => `${slot.slot_id}__${i}`);
}

function toGeometrySlot(slot) {
  return {
    x: slot.x, y: slot.y, anchor: slot.anchor, family: slot.family, fontSize: slot.font_size, weight: slot.weight,
    letterSpacing: slot.letter_spacing, maxLines: slot.max_lines,
  };
}

function renderCover(coverSpec, library, options) {
  assertObject(coverSpec, 'coverSpec');
  assertObject(library, 'library');
  assertObject(options, 'options');
  assertArray(library.templates, 'library.templates');
  assertArray(coverSpec.slots, 'coverSpec.slots');
  if (typeof options.markup !== 'string') throw new TypeError('options.markup must be a string');
  if (!options.geometry || typeof options.geometry.checkSlot !== 'function') throw new TypeError('options.geometry must provide checkSlot');
  if (typeof coverSpec.template_id !== 'string') throw new TypeError('coverSpec.template_id must be a string');
  if (typeof coverSpec.alt_text !== 'string') throw new TypeError('coverSpec.alt_text must be a string');

  const errors = [];
  const fail = () => ({ passed: false, errors, svg: null });
  const add = (reason, detail = {}) => errors.push({ reason, ...detail });

  const template = library.templates.find((t) => t.template_id === coverSpec.template_id);
  if (!template) {
    add('template_desconhecido', { template_id: coverSpec.template_id });
    return fail();
  }
  assertArray(template.slots, 'template.slots');

  // 1. The markup is the markup of this library entry.
  const markup = options.markup;
  const root = ROOT_TAG.exec(markup);
  const elements = [...markup.matchAll(TEXT_ELEMENT)].map((m) => ({ match: m, attrs: attrsOf(m[1]), content: m[2] }));
  const expected = new Map();
  for (const slot of template.slots) {
    elementIds(slot).forEach((id, i) => expected.set(id, { slot, line: i }));
  }
  if (!root || !ARIA_LABEL.test(root[0])) add('markup_sem_aria_label', { template_id: template.template_id });
  const seenIds = new Set();
  for (const el of elements) {
    const id = el.attrs.id;
    const want = id === undefined ? undefined : expected.get(id);
    if (!want) {
      add('markup_texto_sem_slot', { template_id: template.template_id, id: id === undefined ? null : id });
      continue;
    }
    if (seenIds.has(id)) add('markup_id_repetido', { template_id: template.template_id, id });
    seenIds.add(id);
    const { slot, line } = want;
    const same = Number(el.attrs.x) === slot.x && Number(el.attrs.y) === slot.y[line]
      && Number(el.attrs['font-size']) === slot.font_size[line] && (el.attrs['text-anchor'] || 'start') === slot.anchor;
    if (!same) add('markup_diverge_da_biblioteca', { template_id: template.template_id, id });
    const placeholder = slot.max_lines === 1 ? `{{${slot.slot_id}}}` : `{{${slot.slot_id}.${line}}}`;
    if (el.content !== placeholder) add('marcador_inesperado', { template_id: template.template_id, id });
  }
  for (const id of expected.keys()) if (!seenIds.has(id)) add('markup_sem_elemento', { template_id: template.template_id, id });
  if (errors.length > 0) return fail();

  // 2. The cover_spec fills exactly the slots of the template.
  const byId = new Map();
  coverSpec.slots.forEach((s, i) => {
    assertObject(s, `coverSpec.slots[${i}]`);
    if (typeof s.slot_id !== 'string') throw new TypeError(`coverSpec.slots[${i}].slot_id must be a string`);
    assertArray(s.lines, `coverSpec.slots[${i}].lines`);
    if (byId.has(s.slot_id)) add('slot_repetido', { slot_id: s.slot_id });
    else byId.set(s.slot_id, s);
  });
  const templateIds = new Set(template.slots.map((s) => s.slot_id));
  for (const id of byId.keys()) if (!templateIds.has(id)) add('slot_inexistente', { slot_id: id });
  for (const slot of template.slots) {
    const given = byId.get(slot.slot_id);
    if (!given) {
      add('slot_ausente', { slot_id: slot.slot_id });
      continue;
    }
    if (given.kind !== slot.kind) add('kind_divergente', { slot_id: slot.slot_id, kind: given.kind, expected: slot.kind });
  }
  if (errors.length > 0) return fail();

  // 3. Lines are plain text, and the geometry accepts them.
  const lines = new Map();
  for (const slot of template.slots) {
    const raw = byId.get(slot.slot_id).lines;
    const clean = [];
    if (raw.length === 0) add('linhas_ausentes', { slot_id: slot.slot_id });
    raw.forEach((line, i) => {
      if (typeof line !== 'string') throw new TypeError(`line ${i} of slot ${slot.slot_id} must be a string`);
      const text = line.normalize('NFC');
      if (text.trim().length === 0) add('linha_vazia', { slot_id: slot.slot_id, line: i });
      else if (FORBIDDEN.test(text) || hasLoneSurrogate(text)) add('caractere_invalido_xml', { slot_id: slot.slot_id, line: i });
      clean.push(text);
    });
    lines.set(slot.slot_id, clean);
  }
  const alt = coverSpec.alt_text.normalize('NFC');
  if (alt.trim().length === 0) add('alt_text_vazio');
  else if (FORBIDDEN.test(alt) || hasLoneSurrogate(alt)) add('caractere_invalido_xml', { slot_id: 'alt_text', line: null });
  if (errors.length > 0) return fail();
  for (const slot of template.slots) {
    const result = options.geometry.checkSlot(toGeometrySlot(slot), lines.get(slot.slot_id), template.canvas);
    for (const e of result.errors) add(e.reason, { slot_id: slot.slot_id, line: e.line });
  }
  if (errors.length > 0) return fail();

  // 4. Render: one pass over the text elements, then the aria-label.
  let svg = markup.replace(TEXT_ELEMENT, (whole, attrSource) => {
    const { id } = attrsOf(attrSource);
    const { slot, line } = expected.get(id);
    const text = lines.get(slot.slot_id)[line];
    if (text === undefined) return ''; // fewer lines than max_lines: the unused line element is dropped
    return whole.replace(/>[^<]*<\/text>$/, () => `>${escapeXml(text)}</text>`);
  });
  const label = escapeXml(alt);
  svg = svg.replace(ROOT_TAG, (tag) => tag.replace(ARIA_LABEL, (_m, open, close) => `${open}${label}${close}`));
  return { passed: true, errors: [], svg };
}

module.exports = { renderCover, escapeXml, elementIds };
