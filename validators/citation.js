'use strict';

// Literal citation check of stage 03_VERIFY. CLAUDE.md section 8: source_text must exist literally in the
// text of the page the evidence names, after normalizing spaces and hyphens. The check is code, never the
// LLM's. Pure JS with no require, no clock and no file access (n8n Cloud Code node).
//
// Inputs:
//   evidence  one evidence row (contracts/evidence.schema.json), already valid against the schema
//   pages     the text of the PDF, one string per page: pages[0] is page 1. The 01_INGEST stage is the one
//             that extracts it; how that text is stored and read back is not decided (UNKNOWN)
//             The evidence's page is that position in the file, not the number printed on the page
//             (decision of 2026-11-07)
//
// Result: { passed, errors }. Each error is { reason }:
//   pagina_inexistente    page is not an integer from 1 to pages.length
//   trecho_vazio          source_text has nothing left after normalizing
//   trecho_nao_encontrado the normalized source_text is not a substring of the normalized page
// Bad arguments (wrong types) are a TypeError. Errors never carry the page text: the PDF stays out of
// logs and rows.
//
// normalizeText, applied to both sides and to nothing else:
//   - Unicode NFC, so a composed and a decomposed accent are the same text;
//   - the soft hyphen (U+00AD) and the zero-width space (U+200B) are removed: they are invisible;
//   - every hyphen look-alike (U+2010 to U+2015 and the minus sign U+2212) becomes "-";
//   - every run of white space (space, tab, line break, no-break space, ...) becomes one space, and the
//     ends are trimmed.
//
// Limits, on purpose, so the check fails closed:
//   - case, accents, quotes and ligatures are NOT folded: "Indicador" is not "indicador";
//   - a word broken at a line end ("termi-" then "nado") is NOT joined, so the excerpt "terminado" is not
//     found in it. Joining would guess where a hyphen belongs; that is a decision for Fonseca (see the PR);
//   - the match is a substring, with no word boundary: "84" is found inside "184". Whether a short
//     excerpt is acceptable is the contract's business (minLength 1), not this check's;
//   - an excerpt cannot cross a page: the page text is the whole haystack.

const INVISIBLE = /[\u00AD\u200B]/g;
const HYPHENS = /[\u2010-\u2015\u2212]/g;
const WHITE_SPACE = /\s+/g;

function normalizeText(text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  return text.normalize('NFC').replace(INVISIBLE, '').replace(HYPHENS, '-').replace(WHITE_SPACE, ' ').trim();
}

function checkCitation(evidence, pages) {
  if (evidence === null || typeof evidence !== 'object' || Array.isArray(evidence)) throw new TypeError('evidence must be an object');
  if (!Array.isArray(pages)) throw new TypeError('pages must be an array');
  pages.forEach((p, i) => {
    if (typeof p !== 'string') throw new TypeError(`pages[${i}] must be a string`);
  });
  if (typeof evidence.source_text !== 'string') throw new TypeError('evidence.source_text must be a string');

  const { page } = evidence;
  if (!Number.isInteger(page) || page < 1 || page > pages.length) {
    return { passed: false, errors: [{ reason: 'pagina_inexistente' }] };
  }
  const excerpt = normalizeText(evidence.source_text);
  if (excerpt.length === 0) return { passed: false, errors: [{ reason: 'trecho_vazio' }] };
  if (!normalizeText(pages[page - 1]).includes(excerpt)) {
    return { passed: false, errors: [{ reason: 'trecho_nao_encontrado' }] };
  }
  return { passed: true, errors: [] };
}

module.exports = { checkCitation, normalizeText };
