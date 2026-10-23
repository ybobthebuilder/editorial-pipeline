'use strict';

// Business validators for the two texts that D-17 (2026-10-23) adds to stage 07_COVERS: the call to
// action written on the art (cta, a field of cover_spec) and the caption of the post (caption, a field
// of post_copy). Pure JS, no dependencies and no require (n8n Cloud Code node).
//
// D-17 makes the CTA inert text: no automation of engagement, so nothing in it may carry a link, a
// handle, a hashtag or a phone number that an outside system could capture or follow. The code only
// sees the text, so the rules below are mechanical; "Comente abaixo" passes and "Comente QUERO e
// receba" also passes: that boundary is semantic and belongs to the prompt and to 09_QA (reason
// cta_promete_entrega), then to the human gate. These functions do not reimplement the blocklist
// (validators/blocklist.js) or the numbers check (validators/numbers.js): the stage feeds the same
// text to them. Length is the schema's job; it is repeated here only as a second line of defence.
//
// Decisions: 40 characters for cta (Fonseca, 2026-10-23); 300 for caption (Q3, approved); no hashtag
// and no mention in the caption in v0.1 (Q4, approved); URL, @, # and phone in the CTA (Q7, approved).
// UNKNOWN: whether the caption may carry a link. No decision exists, so it is not checked.
//
// Known false positives, on purpose (a rejected text is regenerated; a text that slips through is not
// caught): "p.ex" and "Sr.Silva" read as domains, four numbers joined by dots ("1.2.3.4") read as an IP address, and "2026 2027" reads as a phone number (eight digits
// or more in one run of digits and separators).

const CTA_MAX = 40;
const CAPTION_MAX = 300;
const PHONE_MIN_DIGITS = 8;
const MENTION = /[@\uFF20]/;
const HASHTAG = /[#\uFF03]/;
const SCHEME_OR_WWW = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/i;
const DOMAIN = /[\p{L}\p{N}][\p{L}\p{N}-]*\.\p{L}{2,}/u;
const IPV4 = /(?<!\p{Nd})(?:\p{Nd}{1,3}\.){3}\p{Nd}{1,3}(?!\p{Nd})/u;
// separators of a phone number: space, parentheses, dot, hyphen-minus, the typographic dashes U+2010 to U+2015 and the minus sign U+2212
const PHONE_RUN = /\p{Nd}[\p{Nd}\s().\-\u2010-\u2015\u2212]{6,}\p{Nd}/gu;

/** Count Unicode code points, including any surrounding whitespace. */
const codePoints = (text) => Array.from(text).length;

/** @throws {TypeError} If value is not a string, naming the field supplied in what. */
function assertString(value, what) {
  if (typeof value !== 'string') throw new TypeError(`${what} must be a string`);
}

/** Detect a URL scheme, www. prefix, domain-like substring (p.ex and Sr.Silva count) or bare IPv4 address (1.2.3.4 counts). */
function hasUrl(text) {
  return SCHEME_OR_WWW.test(text) || DOMAIN.test(text) || IPV4.test(text);
}

/** Detect at least eight Unicode decimal digits separated only by whitespace, parentheses, dots, hyphens or typographic dashes. */
function hasPhone(text) {
  for (const run of text.match(PHONE_RUN) || []) {
    if ((run.match(/\p{Nd}/gu) || []).length >= PHONE_MIN_DIGITS) return true;
  }
  return false;
}

/**
 * Append reasons to errors in URL, at-sign, hashtag, then phone order, using prefix (cta or legenda).
 * Both ASCII and fullwidth at-signs and number signs count; links enables URL and phone checks.
 */
function symbols(text, prefix, errors, { links }) {
  if (links && hasUrl(text)) errors.push({ reason: `${prefix}_com_url` });
  if (MENTION.test(text)) errors.push({ reason: `${prefix}_com_${prefix === 'cta' ? 'arroba' : 'mencao'}` });
  if (HASHTAG.test(text)) errors.push({ reason: `${prefix}_com_hashtag` });
  if (links && hasPhone(text)) errors.push({ reason: `${prefix}_com_telefone` });
}

/**
 * Check CTA presence, its exact slot text, and mechanical content rules without changing the inputs.
 * An undefined cta is absent; it is required exactly when the template has a cta_label slot.
 * A present CTA must contain non-whitespace text and at most 40 Unicode code points, counting spaces.
 * URL-like text, ASCII or fullwidth @ and #, and phone-like digit runs are rejected.
 *
 * coverSpec: a cover_spec (cta optional); template: the library entry of coverSpec.template_id, with
 * slots[].slot_id. Returns { passed, errors: [{ reason }] }, with passed true exactly when errors is
 * empty. Reasons, in order: cta_sem_slot (a cta on a template that has no cta_label slot), slot_sem_cta
 * (the slot without a cta), cta_diferente_do_slot (the slot's lines are not exactly [cta], or the slot
 * is missing from the cover_spec), cta_so_espacos, cta_acima_de_40, cta_com_url, cta_com_arroba,
 * cta_com_hashtag, cta_com_telefone.
 *
 * @throws {TypeError} If either argument is not a non-null, non-array object, either slots field
 * is not an array, or a present cta is not a string. Content violations are returned in errors.
 */
function checkCta(coverSpec, template) {
  if (coverSpec === null || typeof coverSpec !== 'object' || Array.isArray(coverSpec)) throw new TypeError('coverSpec must be an object');
  if (template === null || typeof template !== 'object' || Array.isArray(template)) throw new TypeError('template must be an object');
  if (!Array.isArray(template.slots)) throw new TypeError('template.slots must be an array');
  if (!Array.isArray(coverSpec.slots)) throw new TypeError('coverSpec.slots must be an array');
  const present = coverSpec.cta !== undefined;
  if (present) assertString(coverSpec.cta, 'coverSpec.cta');

  const errors = [];
  const hasSlot = template.slots.some((s) => s !== null && typeof s === 'object' && s.slot_id === 'cta_label');
  if (present && !hasSlot) errors.push({ reason: 'cta_sem_slot' });
  if (!present && hasSlot) errors.push({ reason: 'slot_sem_cta' });
  if (!present) return { passed: errors.length === 0, errors };

  if (hasSlot) {
    const slot = coverSpec.slots.find((s) => s !== null && typeof s === 'object' && s.slot_id === 'cta_label');
    const lines = slot === undefined ? undefined : slot.lines;
    if (!Array.isArray(lines) || lines.length !== 1 || lines[0] !== coverSpec.cta) errors.push({ reason: 'cta_diferente_do_slot' });
  }
  const cta = coverSpec.cta;
  if (cta.trim().length === 0) errors.push({ reason: 'cta_so_espacos' });
  if (codePoints(cta) > CTA_MAX) errors.push({ reason: 'cta_acima_de_40' });
  symbols(cta, 'cta', errors, { links: true });
  return { passed: errors.length === 0, errors };
}

/**
 * Check the caption text of post_copy for non-whitespace content and at most 300 Unicode code points,
 * counting spaces. Reject ASCII and fullwidth @ and #; links and phone numbers are allowed here.
 * Returns { passed, errors: [{ reason }] }, with passed true exactly when errors is empty.
 * Reasons, in order: legenda_so_espacos, legenda_acima_de_300, legenda_com_mencao, legenda_com_hashtag
 * (no hashtag and no mention in v0.1).
 *
 * @throws {TypeError} If caption is not a string. Content violations are returned in errors.
 */
function checkCaption(caption) {
  assertString(caption, 'caption');
  const errors = [];
  if (caption.trim().length === 0) errors.push({ reason: 'legenda_so_espacos' });
  if (codePoints(caption) > CAPTION_MAX) errors.push({ reason: 'legenda_acima_de_300' });
  symbols(caption, 'legenda', errors, { links: false });
  return { passed: errors.length === 0, errors };
}

module.exports = { checkCta, checkCaption, CTA_MAX, CAPTION_MAX };
