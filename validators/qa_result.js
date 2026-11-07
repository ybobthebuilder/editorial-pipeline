'use strict';

// Code side of contracts/qa_result.schema.json (stage 09_QA). The schema checks the shape of the row; this file
// checks what the schema cannot say (contracts-proposal.md section 6). Pure JS with no require, no clock and no
// file access (n8n Cloud Code node).
//
// computePassed(gates, semantic) -> boolean
//   The value that `passed` must have (CLAUDE.md section 3: code computes, the model does not): every gate has
//   status "passed" and the semantic verdict is "pass". A missing semantic never passes.
//
// checkQaResult(row) -> { passed, errors }
//   row   one qa_result row, already valid against the schema
//   Each error is { reason, gate_id? }. Reasons:
//     gate_repetido                  the same gate_id twice (one entry per gate)
//     cfm_dispensado                 QA-CFM with status "waived": regulatory conformity is never waived (D-05)
//     dispensa_sem_detalhe           a waived gate whose detail is blank: a waiver needs its reason
//     qa_cfm_ausente                 no QA-CFM entry: leaving the gate out would waive it unseen
//     semantic_com_gate_nao_aprovado semantic present although some gate is not "passed": the judge runs only
//                                    after every gate passed
//     semantic_ausente               every gate passed but there is no semantic: the row is incomplete
//     pass_com_motivo                semantic.verdict "pass" with reasons
//     fail_sem_motivo                semantic.verdict "fail" without reasons
//     motivo_repetido                the same semantic reason twice
//     passed_incoerente              `passed` differs from computePassed
//   The result never carries the detail texts.
//
// Decisions of mine, to confirm (the proposal says only "all gates passed"):
//   - A "waived" gate does NOT count as passed (PASSING below). That is fail closed: a waiver keeps the row from
//     passing. If the intent is that a waiver lets the cover pass, change PASSING to ['passed', 'waived'].
//   - QA-CFM must be present, and an all-green row without semantic is an error (semantic_ausente).
//
// Limits, on purpose: that cover_spec_id exists and belongs to the same job is not checked here: the cover_spec
// has no id of its own yet (open decision), so there is nothing to check it against.

const PASSING = ['passed'];
const CFM_GATE = 'QA-CFM';

function assertObject(value, what) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${what} must be an object`);
}

function assertArray(value, what) {
  if (!Array.isArray(value)) throw new TypeError(`${what} must be an array`);
}

function assertGates(gates, what) {
  assertArray(gates, what);
  gates.forEach((g, i) => {
    assertObject(g, `${what}[${i}]`);
    if (typeof g.gate_id !== 'string') throw new TypeError(`${what}[${i}].gate_id must be a string`);
    if (typeof g.status !== 'string') throw new TypeError(`${what}[${i}].status must be a string`);
  });
}

function assertSemantic(semantic, what) {
  assertObject(semantic, what);
  if (typeof semantic.verdict !== 'string') throw new TypeError(`${what}.verdict must be a string`);
  assertArray(semantic.reasons, `${what}.reasons`);
}

function allGatesPass(gates) {
  return gates.every((g) => PASSING.includes(g.status));
}

function computePassed(gates, semantic) {
  assertGates(gates, 'gates');
  if (semantic !== undefined) assertSemantic(semantic, 'semantic');
  return gates.length > 0 && allGatesPass(gates) && semantic !== undefined && semantic.verdict === 'pass';
}

function checkQaResult(row) {
  assertObject(row, 'row');
  assertGates(row.gates, 'row.gates');
  row.gates.forEach((g, i) => {
    if (typeof g.detail !== 'string') throw new TypeError(`row.gates[${i}].detail must be a string`);
  });
  if (typeof row.passed !== 'boolean') throw new TypeError('row.passed must be a boolean');
  if (row.semantic !== undefined) assertSemantic(row.semantic, 'row.semantic');

  const errors = [];
  const add = (reason, gate_id) => errors.push(gate_id === undefined ? { reason } : { reason, gate_id });

  const seen = new Set();
  const repeated = new Set();
  for (const gate of row.gates) {
    if (seen.has(gate.gate_id)) {
      if (!repeated.has(gate.gate_id)) add('gate_repetido', gate.gate_id);
      repeated.add(gate.gate_id);
    }
    seen.add(gate.gate_id);
    if (gate.status === 'waived') {
      if (gate.gate_id === CFM_GATE) add('cfm_dispensado', gate.gate_id);
      if (gate.detail.trim().length === 0) add('dispensa_sem_detalhe', gate.gate_id);
    }
  }
  if (!seen.has(CFM_GATE)) add('qa_cfm_ausente');

  const gatesPass = row.gates.length > 0 && allGatesPass(row.gates);
  if (row.semantic !== undefined) {
    if (!gatesPass) add('semantic_com_gate_nao_aprovado');
    const { verdict, reasons } = row.semantic;
    if (verdict === 'pass' && reasons.length > 0) add('pass_com_motivo');
    if (verdict === 'fail' && reasons.length === 0) add('fail_sem_motivo');
    if (new Set(reasons).size !== reasons.length) add('motivo_repetido');
  } else if (gatesPass) {
    add('semantic_ausente');
  }

  if (row.passed !== computePassed(row.gates, row.semantic)) add('passed_incoerente');

  return { passed: errors.length === 0, errors };
}

module.exports = { checkQaResult, computePassed, PASSING, CFM_GATE };
