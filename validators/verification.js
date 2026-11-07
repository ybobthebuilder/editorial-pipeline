'use strict';

// Code side of contracts/verification.schema.json (stage 03_VERIFY). The schema checks the shape of one
// row; this file checks what the schema cannot say, and computes the NUMBERS check. Pure JS with no
// require, no clock and no file access (n8n Cloud Code node). The modules it needs are handed in.
//
// 1. checkVerificationRows(rows, evidences)
//      rows       the verification rows of ONE job, each already valid against the schema
//      evidences  the evidence rows of the same job, each already valid against contracts/evidence.schema.json
//    Returns { passed, errors }; each error is { reason, evidence_id, check_id? }. Reasons:
//      sem_evidencias               the job has no evidence at all: "all verified" would be vacuous
//      evidencia_repetida           two evidences share an evidence_id (the id is unique per job)
//      linha_repetida               two rows judge the same evidence_id
//      evidencia_inexistente        a row names an evidence_id that the job does not have
//      evidencia_sem_linha          an evidence has no row (coverage of the job is total)
//      job_divergente               the row and its evidence have different job_id
//      check_repetido               the same check_id twice in one row
//      veredito_incoerente          status VERIFIED with a failed check, or FAILED with every check passed
//      verified_sem_checagem_completa  status VERIFIED without both CITATION and NUMBERS (see below)
//      passed_com_motivo            a passed check that lists reasons
//      failed_sem_motivo            a failed check without any reason
//      motivo_repetido              the same reason twice in one check
//      motivo_de_outro_check        a reason that belongs to the other check_id
//
// 2. runNumbersCheck(evidence, numbers)
//      numbers    { extractNumbers, checkNumbersAllowed } from validators/numbers.js
//    The NUMBERS check of 03_VERIFY: every number of the claim, and every measures[].raw, must be a number
//    that source_text itself holds, with the same value and the same unit (CLAUDE.md section 8). Returns
//    { status, reasons }: status is 'passed' or 'failed', reasons are the codes of the contract without
//    repeats, in the fixed order of NUMBERS_REASONS. The result never carries the text.
//      claim:    formato_invalido, precisao_excedida, numero_nao_autorizado, unidade_divergente (numbers.js)
//      measures: medida_fora_do_trecho when raw is not exactly one number, or when no number of
//                source_text has its value and unit. A raw that is itself malformed ("9.52") gives the
//                numbers.js reason. Matching is by number, not by substring: "84" is not inside "184".
//
// Decisions of mine, to confirm (the contract proposal says only "no repeated check_id"):
//   - VERIFIED needs both checks. A VERIFIED row that carries only CITATION would let the numbers go
//     unchecked, against CLAUDE.md section 8. A FAILED row may carry one failed check (a stage may stop
//     at the first failure).
//   - An empty job fails: with no evidence there is nothing that was verified.
//
// Limits, on purpose: whether the text of source_text is in the PDF is citation.js's job; the pairing of
// before/after for computeDeltas is the next stage's; the stage rule that one FAILED row sinks the job
// (Fonseca, Q3) belongs to the workflow, not to this file.

const CITATION_REASONS = ['pagina_inexistente', 'trecho_vazio', 'trecho_nao_encontrado'];
const NUMBERS_REASONS = ['formato_invalido', 'precisao_excedida', 'numero_nao_autorizado', 'unidade_divergente', 'medida_fora_do_trecho'];
const OWN_REASONS = { CITATION: CITATION_REASONS, NUMBERS: NUMBERS_REASONS };

function assertObject(value, what) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${what} must be an object`);
}

function assertArray(value, what) {
  if (!Array.isArray(value)) throw new TypeError(`${what} must be an array`);
}

function checkVerificationRows(rows, evidences) {
  assertArray(rows, 'rows');
  assertArray(evidences, 'evidences');
  evidences.forEach((e, i) => {
    assertObject(e, `evidences[${i}]`);
    if (typeof e.evidence_id !== 'string') throw new TypeError(`evidences[${i}].evidence_id must be a string`);
  });
  rows.forEach((r, i) => {
    assertObject(r, `rows[${i}]`);
    if (typeof r.evidence_id !== 'string') throw new TypeError(`rows[${i}].evidence_id must be a string`);
    if (typeof r.status !== 'string') throw new TypeError(`rows[${i}].status must be a string`);
    assertArray(r.checks, `rows[${i}].checks`);
    r.checks.forEach((c, j) => {
      assertObject(c, `rows[${i}].checks[${j}]`);
      if (typeof c.check_id !== 'string') throw new TypeError(`rows[${i}].checks[${j}].check_id must be a string`);
      if (typeof c.status !== 'string') throw new TypeError(`rows[${i}].checks[${j}].status must be a string`);
      assertArray(c.reasons, `rows[${i}].checks[${j}].reasons`);
    });
  });

  const errors = [];
  const add = (reason, evidence_id, extra = {}) => errors.push({ reason, evidence_id, ...extra });

  if (evidences.length === 0) add('sem_evidencias', null);
  const byId = new Map();
  for (const e of evidences) {
    if (byId.has(e.evidence_id)) {
      if (!errors.some((x) => x.reason === 'evidencia_repetida' && x.evidence_id === e.evidence_id)) add('evidencia_repetida', e.evidence_id);
    } else {
      byId.set(e.evidence_id, e);
    }
  }

  const judged = new Set();
  for (const row of rows) {
    const id = row.evidence_id;
    if (judged.has(id)) {
      if (!errors.some((x) => x.reason === 'linha_repetida' && x.evidence_id === id)) add('linha_repetida', id);
    }
    judged.add(id);
    const evidence = byId.get(id);
    if (!evidence) add('evidencia_inexistente', id);
    else if (evidence.job_id !== row.job_id) add('job_divergente', id);

    const seen = new Set();
    for (const check of row.checks) {
      if (seen.has(check.check_id)) add('check_repetido', id, { check_id: check.check_id });
      seen.add(check.check_id);
      if (check.status === 'passed' && check.reasons.length > 0) add('passed_com_motivo', id, { check_id: check.check_id });
      if (check.status === 'failed' && check.reasons.length === 0) add('failed_sem_motivo', id, { check_id: check.check_id });
      const own = OWN_REASONS[check.check_id] || [];
      const counted = new Set();
      for (const reason of check.reasons) {
        if (counted.has(reason)) {
          if (!errors.some((x) => x.reason === 'motivo_repetido' && x.evidence_id === id && x.check_id === check.check_id)) {
            add('motivo_repetido', id, { check_id: check.check_id });
          }
        }
        counted.add(reason);
        if (!own.includes(reason)) {
          if (!errors.some((x) => x.reason === 'motivo_de_outro_check' && x.evidence_id === id && x.check_id === check.check_id)) {
            add('motivo_de_outro_check', id, { check_id: check.check_id });
          }
        }
      }
    }

    const anyFailed = row.checks.some((c) => c.status === 'failed');
    if (row.status === 'VERIFIED' && anyFailed) add('veredito_incoerente', id);
    else if (row.status === 'FAILED' && !anyFailed) add('veredito_incoerente', id);
    if (row.status === 'VERIFIED' && !(seen.has('CITATION') && seen.has('NUMBERS'))) add('verified_sem_checagem_completa', id);
  }
  for (const e of byId.values()) if (!judged.has(e.evidence_id)) add('evidencia_sem_linha', e.evidence_id);

  return { passed: errors.length === 0, errors };
}

function runNumbersCheck(evidence, numbers) {
  assertObject(evidence, 'evidence');
  assertObject(numbers, 'numbers');
  if (typeof numbers.extractNumbers !== 'function' || typeof numbers.checkNumbersAllowed !== 'function') {
    throw new TypeError('numbers must provide extractNumbers and checkNumbersAllowed');
  }
  if (typeof evidence.source_text !== 'string') throw new TypeError('evidence.source_text must be a string');
  if (typeof evidence.claim !== 'string') throw new TypeError('evidence.claim must be a string');
  assertArray(evidence.measures, 'evidence.measures');
  evidence.measures.forEach((m, i) => {
    assertObject(m, `evidence.measures[${i}]`);
    if (typeof m.raw !== 'string') throw new TypeError(`evidence.measures[${i}].raw must be a string`);
  });

  const inSource = numbers.extractNumbers(evidence.source_text).numbers;
  const allowed = inSource.map((n) => ({ value: n.value, unit: n.unit }));
  const found = new Set();

  for (const problem of numbers.checkNumbersAllowed([{ id: 'claim', text: evidence.claim }], allowed).problems) found.add(problem.reason);

  for (const measure of evidence.measures) {
    const parsed = numbers.extractNumbers(measure.raw);
    if (parsed.errors.length > 0) {
      for (const error of parsed.errors) found.add(error.reason);
    } else if (parsed.numbers.length !== 1 || parsed.numbers[0].raw !== measure.raw) {
      found.add('medida_fora_do_trecho');
    } else if (!inSource.some((n) => n.value === parsed.numbers[0].value && n.unit === parsed.numbers[0].unit)) {
      found.add('medida_fora_do_trecho');
    }
  }

  const reasons = NUMBERS_REASONS.filter((r) => found.has(r));
  return { status: reasons.length === 0 ? 'passed' : 'failed', reasons };
}

module.exports = { checkVerificationRows, runNumbersCheck, CITATION_REASONS, NUMBERS_REASONS };
