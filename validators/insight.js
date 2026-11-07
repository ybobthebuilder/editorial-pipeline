'use strict';

// Code side of contracts/insight.schema.json (stage 04_INSIGHTS). The schema checks the shape of one
// row; this file checks what the schema cannot say. Pure JS with no require, no clock and no file
// access (n8n Cloud Code node). The numbers module is handed in.
//
// checkInsights(insights, verifications, evidences, numbers)
//   insights       the insight rows of ONE job, each already valid against the schema
//   verifications  the verification rows of the same job (contracts/verification.schema.json)
//   evidences      the evidence rows of the same job (contracts/evidence.schema.json)
//   numbers        { extractNumbers, checkNumbersAllowed } from validators/numbers.js
// Returns { passed, errors }; each error is { reason, insight_id, evidence_id? }. The result never carries
// the text of an insight or of an excerpt. Reasons:
//   sem_insights                    the job has no insight: "all checked" would be vacuous
//   insight_repetido                two insights share an insight_id (the id is unique per job)
//   texto_vazio                     the text is blank (the schema allows "   ")
//   evidencia_repetida_no_insight   the same evidence_id twice in one evidence_ids
//   evidencia_inexistente           the evidence has no verification row or no evidence row in the job
//   job_divergente                  the verification row belongs to another job than the insight
//   evidencia_nao_verificada        the verification status is not VERIFIED (CLAUDE.md section 4)
//   formato_invalido, precisao_excedida, numero_nao_autorizado, unidade_divergente
//                                   a number of the text that numbers.js refuses, or that no cited
//                                   VERIFIED evidence holds with the same value and unit (section 8)
//
// The numbers that an insight may show are the numbers of the source_text of the evidences it cites that are
// VERIFIED. Deltas are NOT allowed here: computing them is the 05_SCORE stage's (CLAUDE.md section 3).
//
// Decisions of mine, to confirm: an empty job fails (sem_insights), like a job without evidence does in
// verification.js; and a verification row that appears more than once for an evidence counts as VERIFIED
// only if every one of its rows is.
//
// Limits, on purpose: the strength of the language ("causes", "proves") is the semantic QA's, not this
// file's; whether a cited evidence is relevant to the text is not decidable here.

const NUMBER_REASONS = ['formato_invalido', 'precisao_excedida', 'numero_nao_autorizado', 'unidade_divergente'];

function assertObject(value, what) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${what} must be an object`);
}

function assertArray(value, what) {
  if (!Array.isArray(value)) throw new TypeError(`${what} must be an array`);
}

function checkInsights(insights, verifications, evidences, numbers) {
  assertArray(insights, 'insights');
  assertArray(verifications, 'verifications');
  assertArray(evidences, 'evidences');
  assertObject(numbers, 'numbers');
  if (typeof numbers.extractNumbers !== 'function' || typeof numbers.checkNumbersAllowed !== 'function') {
    throw new TypeError('numbers must provide extractNumbers and checkNumbersAllowed');
  }
  insights.forEach((r, i) => {
    assertObject(r, `insights[${i}]`);
    if (typeof r.insight_id !== 'string') throw new TypeError(`insights[${i}].insight_id must be a string`);
    if (typeof r.text !== 'string') throw new TypeError(`insights[${i}].text must be a string`);
    assertArray(r.evidence_ids, `insights[${i}].evidence_ids`);
    r.evidence_ids.forEach((id, j) => {
      if (typeof id !== 'string') throw new TypeError(`insights[${i}].evidence_ids[${j}] must be a string`);
    });
  });
  verifications.forEach((r, i) => {
    assertObject(r, `verifications[${i}]`);
    if (typeof r.evidence_id !== 'string') throw new TypeError(`verifications[${i}].evidence_id must be a string`);
    if (typeof r.status !== 'string') throw new TypeError(`verifications[${i}].status must be a string`);
  });
  evidences.forEach((r, i) => {
    assertObject(r, `evidences[${i}]`);
    if (typeof r.evidence_id !== 'string') throw new TypeError(`evidences[${i}].evidence_id must be a string`);
    if (typeof r.source_text !== 'string') throw new TypeError(`evidences[${i}].source_text must be a string`);
  });

  const errors = [];
  const add = (reason, insight_id, extra = {}) => errors.push({ reason, insight_id, ...extra });

  if (insights.length === 0) add('sem_insights', null);
  const seenIds = new Set();
  for (const insight of insights) {
    const insightId = insight.insight_id;
    if (seenIds.has(insightId)) {
      if (!errors.some((x) => x.reason === 'insight_repetido' && x.insight_id === insightId)) add('insight_repetido', insightId);
    }
    seenIds.add(insightId);

    const blank = insight.text.trim().length === 0;
    if (blank) add('texto_vazio', insightId);

    const usable = [];
    const counted = new Set();
    for (const evidenceId of insight.evidence_ids) {
      if (counted.has(evidenceId)) {
        if (!errors.some((x) => x.reason === 'evidencia_repetida_no_insight' && x.insight_id === insightId && x.evidence_id === evidenceId)) {
          add('evidencia_repetida_no_insight', insightId, { evidence_id: evidenceId });
        }
        continue;
      }
      counted.add(evidenceId);

      const rows = verifications.filter((v) => v.evidence_id === evidenceId);
      const evidence = evidences.find((e) => e.evidence_id === evidenceId && e.job_id === insight.job_id);
      if (rows.length === 0) {
        add('evidencia_inexistente', insightId, { evidence_id: evidenceId });
        continue;
      }
      if (rows.some((v) => v.job_id !== insight.job_id)) {
        add('job_divergente', insightId, { evidence_id: evidenceId });
        continue;
      }
      if (!rows.every((v) => v.status === 'VERIFIED')) {
        add('evidencia_nao_verificada', insightId, { evidence_id: evidenceId });
        continue;
      }
      if (!evidence) {
        add('evidencia_inexistente', insightId, { evidence_id: evidenceId });
        continue;
      }
      usable.push(evidence);
    }

    const allowed = [];
    for (const evidence of usable) {
      for (const n of numbers.extractNumbers(evidence.source_text).numbers) allowed.push({ value: n.value, unit: n.unit });
    }
    const found = new Set(numbers.checkNumbersAllowed([{ id: insightId, text: insight.text }], allowed).problems.map((p) => p.reason));
    for (const reason of NUMBER_REASONS) if (found.has(reason)) add(reason, insightId);
  }

  return { passed: errors.length === 0, errors };
}

module.exports = { checkInsights, NUMBER_REASONS };
