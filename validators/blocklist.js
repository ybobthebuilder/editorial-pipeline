'use strict';

// Forbidden-term check for cover texts (gate QA-CFM, decision D-05: the CFM applies). The code
// checks the terms; the LLM never does. Pure JS, no dependencies (n8n Cloud compatible).
//
// The list of terms is data from the config (cfm_blocklist), never a literal here: this file
// decides HOW a term is found, not WHICH terms exist.
//
// Matching, by design:
//   - whole words or phrases: "cura" does not match "procura" or "curativo"
//   - case and accents are ignored: "CURA", "cura" and "cúra" are the same
//   - runs of spaces (including non-breaking ones) count as one space
//   - a boundary is any character that is not a letter or a digit, so "cura-se" matches "cura"
// Inflections are not guessed: "curar" must be in the list if it is forbidden.
//
// An empty list throws. Passing every text because the list failed to load would claim a
// conformity nobody checked.

// Lowercase, accent-free copy of text, with the index in the original for each of its characters.
function normalize(text) {
  let normalized = '';
  const origin = [];
  let index = 0;
  let lastWasSpace = false;
  for (const char of text) {
    const start = index;
    index += char.length;
    for (const part of char.normalize('NFD')) {
      if (/\p{M}/u.test(part)) continue;
      if (/\s/u.test(part)) {
        if (!lastWasSpace) {
          normalized += ' ';
          origin.push(start);
          lastWasSpace = true;
        }
        continue;
      }
      lastWasSpace = false;
      for (const lower of part.toLowerCase()) {
        normalized += lower;
        origin.push(start);
      }
    }
  }
  origin.push(index);
  return { normalized, origin };
}

function normalizeTerm(term) {
  return normalize(term).normalized.trim();
}

const isWordChar = (char) => char !== undefined && /[\p{L}\p{N}]/u.test(char);

// items: [{ id, text }]; terms: array of non-empty strings.
// Returns { passed, matches } with matches ordered by item and position:
//   { id, term, start, end, text }   start and end index the original text
function findBlockedTerms(items, terms) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  if (!Array.isArray(terms) || terms.some((t) => typeof t !== 'string')) {
    throw new TypeError('terms must be an array of strings');
  }
  const prepared = terms.map((term) => ({ term, needle: normalizeTerm(term) }));
  if (prepared.some((t) => t.needle === '')) throw new TypeError('terms must not contain an empty term');
  if (prepared.length === 0) throw new RangeError('empty term list: conformity cannot be claimed');

  const matches = [];
  for (const item of items) {
    if (item === null || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.text !== 'string') {
      throw new TypeError('each item needs a string id and a string text');
    }
    const { normalized, origin } = normalize(item.text);
    const found = [];
    for (const { term, needle } of prepared) {
      let from = 0;
      for (;;) {
        const at = normalized.indexOf(needle, from);
        if (at === -1) break;
        from = at + 1;
        const end = at + needle.length;
        if (isWordChar(normalized[at - 1]) || isWordChar(normalized[end])) continue;
        found.push({ id: item.id, term, start: origin[at], end: origin[end], text: item.text.slice(origin[at], origin[end]) });
      }
    }
    found.sort((a, b) => a.start - b.start || a.end - b.end);
    matches.push(...found);
  }
  return { passed: matches.length === 0, matches };
}

module.exports = { findBlockedTerms };
