'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { checkQaResult, computePassed, PASSING, CFM_GATE } = require('./qa_result.js');

const ROOT = join(__dirname, '..');
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const VALID = read('fixtures/synthetic/contracts/qa_result/valid-01.json');
const FAILED = read('fixtures/synthetic/contracts/qa_result/valid-02.json');
const GATE_IDS = read('contracts/qa_result.schema.json').properties.gates.items.properties.gate_id.enum;
const gate = (gate_id, status = 'passed', detail = 'ok') => ({ gate_id, status, detail });
const row = (overrides = {}) => ({ ...clone(VALID), ...overrides });
const reasons = (r) => checkQaResult(r).errors.map((e) => e.reason);
const PASS = { verdict: 'pass', reasons: [] };

test('a row whose gates all passed, with a pass verdict and passed = true, is coherent; so is a row with a failed gate and no semantic', () => {
  assert.deepEqual(checkQaResult(VALID), { passed: true, errors: [] });
  assert.deepEqual(checkQaResult(FAILED), { passed: true, errors: [] });
});

test('computePassed: all gates passed AND semantic pass; anything else is false', () => {
  const ok = [gate('QA-DIM'), gate('QA-CFM')];
  assert.equal(computePassed(ok, PASS), true);
  assert.equal(computePassed(ok, { verdict: 'fail', reasons: ['tom_promocional'] }), false, 'semantic fail');
  assert.equal(computePassed(ok, undefined), false, 'a missing semantic never passes');
  assert.equal(computePassed([gate('QA-DIM'), gate('QA-CFM', 'failed')], PASS), false, 'a failed gate');
  assert.equal(computePassed([gate('QA-DIM'), gate('QA-CFM', 'waived')], PASS), false, 'a waived gate does not count as passed');
  assert.equal(computePassed([], PASS), false, 'no gates');
  assert.equal(computePassed(VALID.gates, VALID.semantic), true);
  assert.equal(computePassed(FAILED.gates, FAILED.semantic), false);
  assert.deepEqual(PASSING, ['passed']);
});

test('a gate_id may appear only once, reported once however many copies', () => {
  const r = row({ gates: [...VALID.gates, gate('QA-DIM'), gate('QA-DIM')] });
  assert.deepEqual(checkQaResult(r).errors, [{ reason: 'gate_repetido', gate_id: 'QA-DIM' }]);
  const two = row({ gates: [...VALID.gates, gate('QA-DIM'), gate('QA-NUM')] });
  assert.deepEqual(checkQaResult(two).errors.map((e) => [e.reason, e.gate_id]), [['gate_repetido', 'QA-DIM'], ['gate_repetido', 'QA-NUM']]);
});

test('QA-CFM is never waived; any other gate may be, with a detail', () => {
  const cfmWaived = row({ gates: VALID.gates.map((g) => (g.gate_id === CFM_GATE ? { ...g, status: 'waived' } : g)), semantic: undefined, passed: false });
  assert.deepEqual(checkQaResult(cfmWaived).errors, [{ reason: 'cfm_dispensado', gate_id: 'QA-CFM' }]);
  for (const id of GATE_IDS.filter((g) => g !== CFM_GATE)) {
    const r = row({ gates: [gate(id, 'waived', 'dispensado por X'), gate(CFM_GATE)], semantic: undefined, passed: false });
    assert.deepEqual(checkQaResult(r).errors, [], id);
  }
  assert.equal(CFM_GATE, 'QA-CFM');
});

test('a waiver needs its reason: blank detail is refused, on QA-CFM as well', () => {
  for (const detail of ['', '   ', '\n\t']) {
    const r = row({ gates: [gate('QA-DIM', 'waived', detail), gate(CFM_GATE)], semantic: undefined, passed: false });
    assert.deepEqual(checkQaResult(r).errors, [{ reason: 'dispensa_sem_detalhe', gate_id: 'QA-DIM' }], JSON.stringify(detail));
  }
  const both = row({ gates: [gate(CFM_GATE, 'waived', ' ')], semantic: undefined, passed: false });
  assert.deepEqual(checkQaResult(both).errors.map((e) => e.reason), ['cfm_dispensado', 'dispensa_sem_detalhe']);
  const passedBlank = row({ gates: VALID.gates.map((g, i) => (i === 0 ? { ...g, detail: '  ' } : g)) });
  assert.deepEqual(checkQaResult(passedBlank).errors, [], 'a blank detail is only refused on a waiver');
});

test('QA-CFM must be present: leaving it out would waive it unseen', () => {
  const r = row({ gates: VALID.gates.filter((g) => g.gate_id !== CFM_GATE) });
  assert.deepEqual(checkQaResult(r).errors, [{ reason: 'qa_cfm_ausente' }]);
  const failedNoCfm = row({ gates: [gate('QA-DIM', 'failed', 'x')], semantic: undefined, passed: false });
  assert.deepEqual(checkQaResult(failedNoCfm).errors, [{ reason: 'qa_cfm_ausente' }]);
  const failedCfm = row({ gates: [gate(CFM_GATE, 'failed', '1 blocked term')], semantic: undefined, passed: false });
  assert.deepEqual(checkQaResult(failedCfm).errors, [], 'a failed QA-CFM is a real result, not a missing one');
});

test('the semantic judge exists only after every gate passed, and must exist then', () => {
  const failedGate = row({ gates: FAILED.gates, semantic: PASS, passed: false });
  assert.deepEqual(checkQaResult(failedGate).errors, [{ reason: 'semantic_com_gate_nao_aprovado' }]);
  const waived = row({ gates: [gate('QA-DIM', 'waived', 'x'), gate(CFM_GATE)], semantic: PASS, passed: false });
  assert.deepEqual(checkQaResult(waived).errors, [{ reason: 'semantic_com_gate_nao_aprovado' }], 'a waived gate is not passed');
  const missing = row({ semantic: undefined, passed: false });
  delete missing.semantic;
  assert.deepEqual(checkQaResult(missing).errors, [{ reason: 'semantic_ausente' }]);
  const missingPassedTrue = row({ passed: true });
  delete missingPassedTrue.semantic;
  assert.deepEqual(checkQaResult(missingPassedTrue).errors.map((e) => e.reason), ['semantic_ausente', 'passed_incoerente']);
});

test('an empty gates list never counts as "every gate passed" (the schema forbids it; the code does not trust that)', () => {
  const withSemantic = row({ gates: [], semantic: PASS, passed: false });
  assert.deepEqual(reasons(withSemantic), ['qa_cfm_ausente', 'semantic_com_gate_nao_aprovado']);
  const without = row({ gates: [], passed: false });
  delete without.semantic;
  assert.deepEqual(reasons(without), ['qa_cfm_ausente'], 'no semantic_ausente: there is no gate that passed');
  assert.deepEqual(reasons(row({ gates: [], semantic: PASS, passed: true })), ['qa_cfm_ausente', 'semantic_com_gate_nao_aprovado', 'passed_incoerente']);
});

test('semantic reasons: empty if and only if pass, and without repeats', () => {
  const sem = (semantic, passed = false) => row({ semantic, passed });
  assert.deepEqual(checkQaResult(sem({ verdict: 'pass', reasons: ['tom_promocional'] })).errors.map((e) => e.reason), ['pass_com_motivo', 'passed_incoerente']);
  assert.deepEqual(checkQaResult(sem({ verdict: 'fail', reasons: [] })).errors, [{ reason: 'fail_sem_motivo' }]);
  assert.deepEqual(checkQaResult(sem({ verdict: 'fail', reasons: ['tom_promocional', 'exagero_de_forca'] })).errors, []);
  assert.deepEqual(checkQaResult(sem({ verdict: 'fail', reasons: ['tom_promocional', 'tom_promocional'] })).errors, [{ reason: 'motivo_repetido' }]);
  assert.deepEqual(checkQaResult(sem({ verdict: 'fail', reasons: ['a', 'a', 'a'] })).errors, [{ reason: 'motivo_repetido' }], 'reported once');
});

test('passed must be what the code computes, both ways', () => {
  assert.deepEqual(checkQaResult(row({ passed: false })).errors, [{ reason: 'passed_incoerente' }], 'everything green but passed = false');
  const semFail = row({ semantic: { verdict: 'fail', reasons: ['tom_promocional'] }, passed: true });
  assert.deepEqual(checkQaResult(semFail).errors, [{ reason: 'passed_incoerente' }], 'semantic fail but passed = true');
  assert.deepEqual(checkQaResult({ ...clone(FAILED), passed: true }).errors, [{ reason: 'passed_incoerente' }], 'a failed gate but passed = true');
  assert.deepEqual(checkQaResult(row({ semantic: { verdict: 'fail', reasons: ['tom_promocional'] }, passed: false })).errors, []);
});

test('all the problems of a row are reported in a fixed order; inputs are not changed; the output has no detail text', () => {
  const r = row({
    gates: [gate('QA-DIM', 'waived', ' '), gate('QA-DIM', 'failed', 'segredo-123'), gate(CFM_GATE, 'waived', 'x')],
    semantic: { verdict: 'pass', reasons: ['a', 'a'] },
    passed: true,
  });
  const before = JSON.stringify(r);
  const first = checkQaResult(r);
  assert.deepEqual(first.errors.map((e) => [e.reason, e.gate_id]), [
    ['dispensa_sem_detalhe', 'QA-DIM'], ['gate_repetido', 'QA-DIM'], ['cfm_dispensado', 'QA-CFM'],
    ['semantic_com_gate_nao_aprovado', undefined], ['pass_com_motivo', undefined], ['motivo_repetido', undefined], ['passed_incoerente', undefined],
  ]);
  assert.deepEqual(first, checkQaResult(r));
  assert.equal(JSON.stringify(r), before);
  assert.doesNotMatch(JSON.stringify(first), /segredo/);
  assert.equal(first.passed, false);
  assert.equal(checkQaResult(VALID).passed, true);
});

test('checkQaResult and computePassed: bad arguments are a TypeError with their own message', () => {
  const g = [gate('QA-DIM')];
  const cases = [
    [() => checkQaResult(null), /row must be an object/], [() => checkQaResult([]), /row must be an object/],
    [() => checkQaResult({ gates: 'x', passed: true }), /row\.gates must be an array/],
    [() => checkQaResult({ gates: [5], passed: true }), /row\.gates\[0\] must be an object/],
    [() => checkQaResult({ gates: [{ gate_id: 1 }], passed: true }), /row\.gates\[0\]\.gate_id must be a string/],
    [() => checkQaResult({ gates: [{ gate_id: 'a', status: 1 }], passed: true }), /row\.gates\[0\]\.status must be a string/],
    [() => checkQaResult({ gates: [{ gate_id: 'a', status: 'passed', detail: 1 }], passed: true }), /row\.gates\[0\]\.detail must be a string/],
    [() => checkQaResult({ gates: g, passed: 'true' }), /row\.passed must be a boolean/],
    [() => checkQaResult({ gates: g, passed: true, semantic: 5 }), /row\.semantic must be an object/],
    [() => checkQaResult({ gates: g, passed: true, semantic: { verdict: 1 } }), /row\.semantic\.verdict must be a string/],
    [() => checkQaResult({ gates: g, passed: true, semantic: { verdict: 'pass' } }), /row\.semantic\.reasons must be an array/],
    [() => computePassed(null, PASS), /gates must be an array/], [() => computePassed([5], PASS), /gates\[0\] must be an object/],
    [() => computePassed(g, 5), /semantic must be an object/], [() => computePassed(g, { verdict: 'pass' }), /semantic\.reasons must be an array/],
  ];
  for (const [fn, message] of cases) assert.throws(fn, { name: 'TypeError', message }, String(message));
});
