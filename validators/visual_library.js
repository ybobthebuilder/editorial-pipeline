'use strict';

// Business validator for config/baseline/visual_library.json (key visual_library, CLAUDE.md section 9).
// It runs after contracts/visual_library.schema.json and checks what the schema cannot say:
// uniqueness, references between sections, contrast of the allowed color pairs, the exact set of
// templates, the format of each canvas, the geometry of every slot and the CFM footer.
//
// Pure JS with no require, like the other validators (n8n Cloud Code node). The two modules it needs
// are handed in, so this file stays free of imports:
//   options.templateIds  the template_id enum of cover_spec, read by the caller from the schema
//   options.geometry     { checkSlot, cfmFooterBaseline } from validators/geometry.js
//   options.contrast     { contrastRatio } from validators/contrast.js
//
// Chrome is not exempt from the safe zone (decision of 2026-10-22): every slot, claim or chrome, is
// measured with geometry.checkSlot, and the library is refused if one leaves the zone. The safe zone
// itself is not in the file; it is geometry.js's (CLAUDE.md section 9 keeps one source of truth).
//
// The CFM footer (decisions U18 and U23, 2026-10-22) is a chrome slot named cfm_footer in every
// template: 12 px, centred on the canvas, on the baseline geometry.cfmFooterBaseline gives (1540 on
// 1080x1920). Family and weight of the footer are not fixed by any decision and are not checked.
//
// Limits, on purpose: svg_sha256 is not compared with the file (this code reads no file; the test of
// the baseline does). The text of a slot is not here, so the line width is measured with a one-
// character line: the horizontal budget per line is geometry.charBudget's job at run time.

const FOOTER_SLOT = 'cfm_footer';
const FOOTER_FONT_SIZE = 12;
const THRESHOLDS = { normal: 4.5, large: 3 };
const FORMATS = [['1:1', 1, 1], ['4:5', 4, 5], ['9:16', 9, 16]];

function assertObject(value, what) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${what} must be an object`);
}

function assertArray(value, what) {
  if (!Array.isArray(value)) throw new TypeError(`${what} must be an array`);
}

function formatOf(canvas) {
  for (const [name, w, h] of FORMATS) if (canvas.width * h === canvas.height * w) return name;
  return null;
}

function duplicates(values) {
  const seen = new Set();
  const out = [];
  for (const v of values) {
    if (seen.has(v) && !out.includes(v)) out.push(v);
    seen.add(v);
  }
  return out;
}

// Returns { passed, errors }; each error is { path, reason, ... } where path locates the problem
// ($.tokens, $.templates[1].slots[0], ...) and the rest names the values involved.
function checkVisualLibrary(library, options) {
  assertObject(library, 'library');
  assertObject(options, 'options');
  assertArray(options.templateIds, 'options.templateIds');
  const { geometry, contrast } = options;
  if (!geometry || typeof geometry.checkSlot !== 'function' || typeof geometry.cfmFooterBaseline !== 'function') {
    throw new TypeError('options.geometry must provide checkSlot and cfmFooterBaseline');
  }
  if (!contrast || typeof contrast.contrastRatio !== 'function') throw new TypeError('options.contrast must provide contrastRatio');
  for (const key of ['tokens', 'color_pairs', 'grammars', 'templates']) assertArray(library[key], `library.${key}`);

  const errors = [];
  const add = (path, reason, detail = {}) => errors.push({ path, reason, ...detail });

  // Uniqueness.
  const tokenValue = new Map();
  library.tokens.forEach((t, i) => {
    assertObject(t, `library.tokens[${i}]`);
    if (!tokenValue.has(t.name)) tokenValue.set(t.name, t.value);
  });
  for (const name of duplicates(library.tokens.map((t) => t.name))) add('$.tokens', 'id_duplicado', { id: name });
  for (const id of duplicates(library.grammars.map((g) => g.grammar_id))) add('$.grammars', 'id_duplicado', { id });
  for (const id of duplicates(library.templates.map((t) => t.template_id))) add('$.templates', 'id_duplicado', { id });

  // Color pairs: names exist and the pair reaches the threshold of its text size.
  const allowed = new Map();
  library.color_pairs.forEach((p, i) => {
    const path = `$.color_pairs[${i}]`;
    let known = true;
    for (const key of ['text', 'on']) {
      if (!tokenValue.has(p[key])) {
        add(path, 'token_inexistente', { token: p[key], field: key });
        known = false;
      }
    }
    if (!known) return;
    const min = THRESHOLDS[p.text_size];
    if (min === undefined) throw new TypeError(`${path}.text_size must be normal or large`);
    const ratio = contrast.contrastRatio(tokenValue.get(p.text), tokenValue.get(p.on));
    if (ratio < min) add(path, 'contraste_insuficiente', { text: p.text, on: p.on, ratio, min });
    allowed.set(`${p.text}|${p.on}`, p.text_size);
  });

  // Grammars point to templates that exist; every template belongs to a grammar; one template per
  // (grammar, format).
  const templateById = new Map(library.templates.map((t) => [t.template_id, t]));
  const inGrammar = new Set();
  library.grammars.forEach((g, i) => {
    const path = `$.grammars[${i}]`;
    const formats = new Map();
    for (const id of g.templates) {
      inGrammar.add(id);
      const template = templateById.get(id);
      if (!template) {
        add(path, 'gramatica_aponta_template_inexistente', { grammar_id: g.grammar_id, template_id: id });
        continue;
      }
      const format = formatOf(template.canvas) || template.format;
      if (formats.has(format)) {
        add(path, 'gramatica_com_dois_templates_no_mesmo_formato', { grammar_id: g.grammar_id, format, template_ids: [formats.get(format), id] });
      } else {
        formats.set(format, id);
      }
    }
  });

  // Templates: the exact set, the grammar, the format, the markup path and every slot.
  const ids = library.templates.map((t) => t.template_id);
  for (const id of options.templateIds) if (!ids.includes(id)) add('$.templates', 'template_ausente', { template_id: id });
  for (const id of ids) if (!options.templateIds.includes(id)) add('$.templates', 'template_fora_do_enum', { template_id: id });

  library.templates.forEach((t, ti) => {
    const base = `$.templates[${ti}]`;
    if (!inGrammar.has(t.template_id)) add(base, 'template_sem_gramatica', { template_id: t.template_id });
    const derived = formatOf(t.canvas);
    if (derived === null || derived !== t.format) add(base, 'formato_incoerente', { template_id: t.template_id, format: t.format, derived });
    if (t.svg !== `assets/brand/${t.template_id}.svg`) add(base, 'svg_incoerente', { template_id: t.template_id, svg: t.svg });
    for (const id of duplicates(t.slots.map((s) => s.slot_id))) add(`${base}.slots`, 'id_duplicado', { template_id: t.template_id, id });

    t.slots.forEach((s, si) => {
      const path = `${base}.slots[${si}]`;
      const where = { template_id: t.template_id, slot_id: s.slot_id };
      // References and the allowed pair.
      let tokensKnown = true;
      for (const key of ['token', 'on']) {
        if (!tokenValue.has(s[key])) {
          add(path, 'token_inexistente', { ...where, token: s[key], field: key });
          tokensKnown = false;
        }
      }
      if (tokensKnown && !allowed.has(`${s.token}|${s.on}`)) add(path, 'par_de_cor_nao_permitido', { ...where, token: s.token, on: s.on });
      // Geometry: one entry per line, then geometry.checkSlot on a one-character line per line.
      if (!Array.isArray(s.y) || !Array.isArray(s.font_size) || s.y.length !== s.max_lines || s.font_size.length !== s.max_lines) {
        add(path, 'slot_malformado', { ...where, max_lines: s.max_lines });
        return;
      }
      const result = geometry.checkSlot({
        x: s.x, y: s.y, anchor: s.anchor, family: s.family, fontSize: s.font_size, weight: s.weight,
        letterSpacing: s.letter_spacing, maxLines: s.max_lines,
      }, Array.from({ length: s.max_lines }, () => '0'), t.canvas);
      for (const e of result.errors) add(path, e.reason, { ...where, line: e.line });
    });

    // The CFM footer: present once, and exactly where the decision puts it.
    const footers = t.slots.filter((s) => s.slot_id === FOOTER_SLOT);
    if (footers.length === 0) {
      add(`${base}.slots`, 'rodape_cfm_ausente', { template_id: t.template_id });
      return;
    }
    const f = footers[0];
    const wrong = [];
    if (f.kind !== 'chrome') wrong.push('kind');
    if (f.anchor !== 'middle') wrong.push('anchor');
    if (f.x !== t.canvas.width / 2) wrong.push('x');
    if (f.max_lines !== 1) wrong.push('max_lines');
    if (!Array.isArray(f.font_size) || f.font_size.length !== 1 || f.font_size[0] !== FOOTER_FONT_SIZE) wrong.push('font_size');
    else if (!Array.isArray(f.y) || f.y.length !== 1 || f.y[0] !== geometry.cfmFooterBaseline(t.canvas, FOOTER_FONT_SIZE)) wrong.push('y');
    if (wrong.length > 0) add(`${base}.slots[${t.slots.indexOf(f)}]`, 'rodape_cfm_incorreto', { template_id: t.template_id, fields: wrong });
  });

  return { passed: errors.length === 0, errors };
}

module.exports = { checkVisualLibrary, FOOTER_SLOT, FOOTER_FONT_SIZE, THRESHOLDS };
