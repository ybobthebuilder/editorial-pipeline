'use strict';

// Numbers shown on a cover must come from verified data. CLAUDE.md §3 and §8: the LLM writes
// text, code checks every number in it. Pure JS, no dependencies (n8n Cloud compatible).
//
// Format is PT-BR (decision U10, 2026-10-22): "." groups thousands and "," is the decimal mark,
// as in "9,52" and "1.234,56". Anything else that looks like a number is reported as an error,
// never guessed: "9.52" is a format error, not 9,52.
//
// Known limits, on purpose: a range "10-20%" is two numbers and the first has no unit; "1.000" is
// one thousand in PT-BR; letters glued to digits ("H2O", "B12") yield a number, so exempt such
// terms with ignoreTerms. Failing closed is the point: an exempt term is a decision, not a default.

const UNITS = [null, '%', 'pp'];
const MAX_DIGITS = 15; // beyond this a double no longer holds the digits exactly

const RUN = /\d[\d.,]*\d|\d/gu;
const PTBR = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?$/;
const UNIT_AFTER = /^[ \u00a0]?(%|pp(?![\p{L}\d])|p\.p\.)/u;
const SIGN_CHARS = ['-', '\u2212', '+'];
const SIGN_FOLLOWS = /[\s([{:;/]/;

function maskTerms(text, terms) {
  let masked = text;
  for (const term of terms) masked = masked.split(term).join(' '.repeat(term.length));
  return masked;
}

function assertTerms(terms) {
  if (!Array.isArray(terms) || terms.some((t) => typeof t !== 'string' || t === '')) {
    throw new TypeError('ignoreTerms must be an array of non-empty strings');
  }
}

// Finds every number in text. Returns { numbers, errors }, both ordered by position:
//   numbers: { raw, start, end, value, unit }   unit is null, '%' or 'pp'
//   errors:  { raw, start, end, reason }        reason is 'formato_invalido' or 'precisao_excedida'
// A sign counts only at the start of the text or after a space or an opening mark, so the hyphen
// in "COVID-19" and "2020-2021" is not a minus.
function extractNumbers(text, options = {}) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  const ignoreTerms = options.ignoreTerms === undefined ? [] : options.ignoreTerms;
  assertTerms(ignoreTerms);

  const masked = maskTerms(text, ignoreTerms);
  const numbers = [];
  const errors = [];
  RUN.lastIndex = 0;
  let match;
  while ((match = RUN.exec(masked)) !== null) {
    let start = match.index;
    let end = start + match[0].length;
    let negative = false;

    const sign = masked[start - 1];
    if (SIGN_CHARS.includes(sign) && (start === 1 || SIGN_FOLLOWS.test(masked[start - 2]))) {
      start -= 1;
      negative = sign !== '+';
    }

    let unit = null;
    const unitMatch = UNIT_AFTER.exec(masked.slice(end));
    if (unitMatch) {
      unit = unitMatch[1] === '%' ? '%' : 'pp';
      end += unitMatch[0].length;
    }

    const raw = text.slice(start, end);
    const parsed = PTBR.exec(match[0]);
    if (!parsed) {
      errors.push({ raw, start, end, reason: 'formato_invalido' });
      continue;
    }
    const integer = parsed[1].replace(/\./g, '');
    const fraction = parsed[2] || '';
    if (integer.length + fraction.length > MAX_DIGITS) {
      errors.push({ raw, start, end, reason: 'precisao_excedida' });
      continue;
    }
    const magnitude = Number(fraction ? `${integer}.${fraction}` : integer);
    numbers.push({ raw, start, end, value: negative && magnitude !== 0 ? -magnitude : magnitude, unit });
  }
  return { numbers, errors };
}

function assertAllowed(allowed) {
  if (!Array.isArray(allowed)) throw new TypeError('allowed must be an array');
  for (const entry of allowed) {
    if (entry === null || typeof entry !== 'object' || typeof entry.value !== 'number' || !Number.isFinite(entry.value)) {
      throw new TypeError('each allowed entry needs a finite numeric value');
    }
    if (!UNITS.includes(entry.unit)) {
      throw new TypeError("each allowed entry needs an explicit unit: null, '%' or 'pp'");
    }
  }
}

// Checks every number in the cover texts against the values that verified data allows.
//   items:   [{ id, text }]  the slot id is echoed back in each problem
//   allowed: [{ value, unit }]  unit is null, '%' or 'pp'; "8 pp" and "8%" are different numbers
// Values match exactly. A cover that shows 9,5 does not match a stored 9.52: rounding is decided
// where the value is computed, not here. Returns { passed, found, problems } with problems ordered
// by item and position; reasons: formato_invalido, precisao_excedida, numero_nao_autorizado,
// unidade_divergente.
function checkNumbersAllowed(items, allowed, options = {}) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  assertAllowed(allowed);

  const found = [];
  const problems = [];
  for (const item of items) {
    if (item === null || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.text !== 'string') {
      throw new TypeError('each item needs a string id and a string text');
    }
    const { numbers, errors } = extractNumbers(item.text, options);
    const mine = [];
    for (const error of errors) mine.push({ id: item.id, raw: error.raw, start: error.start, reason: error.reason });
    for (const number of numbers) {
      found.push({ id: item.id, ...number });
      const sameValue = allowed.filter((a) => a.value === number.value);
      if (sameValue.length === 0) {
        mine.push({ id: item.id, raw: number.raw, start: number.start, reason: 'numero_nao_autorizado' });
      } else if (!sameValue.some((a) => a.unit === number.unit)) {
        mine.push({ id: item.id, raw: number.raw, start: number.start, reason: 'unidade_divergente' });
      }
    }
    mine.sort((a, b) => a.start - b.start);
    problems.push(...mine);
  }
  return { passed: problems.length === 0, found, problems };
}

module.exports = { extractNumbers, checkNumbersAllowed };
