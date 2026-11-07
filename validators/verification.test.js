'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { checkVerificationRows, runNumbersCheck, CITATION_REASONS, NUMBERS_REASONS } = require('./verification.js');
const numbers = require('./numbers.js');
const { checkCitation } = require('./citation.js');

const ROOT = join(__dirname, '..');
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const EVIDENCE = read('fixtures/synthetic/contracts/evidence/valid-01.json');
const JOB = EVIDENCE.job_id;
const evidenceOf = (id, extra = {}) => ({ ...clone(EVIDENCE), evidence_id: id, ...extra });
const row = (id, overrides = {}) => ({
  job_id: JOB, evidence_id: id, status: 'VERIFIED',
  checks: [{ check_id: 'CITATION', status: 'passed', reasons: [] }, { check_id: 'NUMBERS', status: 'passed', reasons: [] }],
  ...overrides,
});
const failedRow = (id, checks) => row(id, { status: 'FAILED', checks });
const reasonsOf = (rows, evidences) => checkVerificationRows(rows, evidences).errors.map((e) => e.reason);
const GOOD = () => ({ rows: [row('ev-0001'), row('ev-0002')], evidences: [evidenceOf('ev-0001'), evidenceOf('ev-0002')] });

// ---- checkVerificationRows -------------------------------------------------------------------------

test('a job whose every evidence has one coherent VERIFIED row passes', () => {
  const { rows, evidences } = GOOD();
  assert.deepEqual(checkVerificationRows(rows, evidences), { passed: true, errors: [] });
  assert.deepEqual(checkVerificationRows([read('fixtures/synthetic/contracts/verification/valid-01.json')], [EVIDENCE]), { passed: true, errors: [] });
});

test('a coherent FAILED row passes too, with one failed check or with both', () => {
  const e = [evidenceOf('ev-0001')];
  assert.deepEqual(reasonsOf([failedRow('ev-0001', [{ check_id: 'CITATION', status: 'failed', reasons: ['trecho_nao_encontrado'] }])], e), []);
  assert.deepEqual(reasonsOf([read('fixtures/synthetic/contracts/verification/valid-02.json')], [{ ...EVIDENCE, job_id: '00000000-0000-4000-8000-000000000002', evidence_id: 'ev-0002' }]), []);
  assert.deepEqual(reasonsOf([failedRow('ev-0001', [{ check_id: 'CITATION', status: 'passed', reasons: [] }, { check_id: 'NUMBERS', status: 'failed', reasons: ['medida_fora_do_trecho'] }])], e), []);
});

test('coverage of the job is total: no evidence, a missing row, a row without evidence', () => {
  assert.deepEqual(checkVerificationRows([], []).errors, [{ reason: 'sem_evidencias', evidence_id: null }]);
  assert.deepEqual(reasonsOf([row('ev-0001')], []), ['sem_evidencias', 'evidencia_inexistente']);
  const { rows, evidences } = GOOD();
  assert.deepEqual(checkVerificationRows(rows.slice(0, 1), evidences).errors, [{ reason: 'evidencia_sem_linha', evidence_id: 'ev-0002' }]);
  assert.deepEqual(checkVerificationRows([...rows, row('ev-0003')], evidences).errors, [{ reason: 'evidencia_inexistente', evidence_id: 'ev-0003' }]);
  assert.deepEqual(checkVerificationRows([], [evidenceOf('ev-0001')]).errors, [{ reason: 'evidencia_sem_linha', evidence_id: 'ev-0001' }]);
});

test('ids are unique: two rows for one evidence, two evidences with one id', () => {
  const { rows, evidences } = GOOD();
  assert.deepEqual(checkVerificationRows([...rows, row('ev-0001')], evidences).errors, [{ reason: 'linha_repetida', evidence_id: 'ev-0001' }]);
  assert.deepEqual(checkVerificationRows([...rows, row('ev-0001'), row('ev-0001')], evidences).errors, [{ reason: 'linha_repetida', evidence_id: 'ev-0001' }], 'reported once');
  assert.deepEqual(checkVerificationRows(rows, [...evidences, evidenceOf('ev-0002')]).errors, [{ reason: 'evidencia_repetida', evidence_id: 'ev-0002' }]);
  assert.deepEqual(checkVerificationRows(rows, [...evidences, evidenceOf('ev-0002'), evidenceOf('ev-0002')]).errors, [{ reason: 'evidencia_repetida', evidence_id: 'ev-0002' }], 'reported once');
});

test('a row and its evidence belong to the same job', () => {
  const { rows, evidences } = GOOD();
  rows[1].job_id = '00000000-0000-4000-8000-000000000099';
  assert.deepEqual(checkVerificationRows(rows, evidences).errors, [{ reason: 'job_divergente', evidence_id: 'ev-0002' }]);
});

test('the verdict is the AND of the checks, both ways', () => {
  const e = [evidenceOf('ev-0001')];
  const failedCheck = [{ check_id: 'CITATION', status: 'passed', reasons: [] }, { check_id: 'NUMBERS', status: 'failed', reasons: ['numero_nao_autorizado'] }];
  assert.deepEqual(reasonsOf([row('ev-0001', { checks: failedCheck })], e), ['veredito_incoerente'], 'VERIFIED with a failed check');
  assert.deepEqual(reasonsOf([failedRow('ev-0001', row('x').checks)], e), ['veredito_incoerente'], 'FAILED with every check passed');
  assert.deepEqual(reasonsOf([failedRow('ev-0001', failedCheck)], e), []);
});

test('VERIFIED needs both checks (CITATION and NUMBERS); a FAILED row does not', () => {
  const e = [evidenceOf('ev-0001')];
  assert.deepEqual(reasonsOf([row('ev-0001', { checks: [{ check_id: 'CITATION', status: 'passed', reasons: [] }] })], e), ['verified_sem_checagem_completa']);
  assert.deepEqual(reasonsOf([row('ev-0001', { checks: [{ check_id: 'NUMBERS', status: 'passed', reasons: [] }] })], e), ['verified_sem_checagem_completa']);
  assert.deepEqual(reasonsOf([row('ev-0001', { checks: [] })], e), ['verified_sem_checagem_completa']);
  assert.deepEqual(reasonsOf([failedRow('ev-0001', [{ check_id: 'NUMBERS', status: 'failed', reasons: ['formato_invalido'] }])], e), []);
});

test('a repeated check_id is refused, and it does not count as the other check', () => {
  const e = [evidenceOf('ev-0001')];
  const twice = [{ check_id: 'CITATION', status: 'passed', reasons: [] }, { check_id: 'CITATION', status: 'passed', reasons: [] }];
  assert.deepEqual(checkVerificationRows([row('ev-0001', { checks: twice })], e).errors.map((x) => [x.reason, x.check_id]), [['check_repetido', 'CITATION'], ['verified_sem_checagem_completa', undefined]]);
});

test('reasons: empty if and only if passed', () => {
  const e = [evidenceOf('ev-0001')];
  const withReason = [{ check_id: 'CITATION', status: 'passed', reasons: ['trecho_vazio'] }, { check_id: 'NUMBERS', status: 'passed', reasons: [] }];
  assert.deepEqual(checkVerificationRows([row('ev-0001', { checks: withReason })], e).errors, [{ reason: 'passed_com_motivo', evidence_id: 'ev-0001', check_id: 'CITATION' }]);
  const none = [{ check_id: 'CITATION', status: 'failed', reasons: [] }];
  assert.deepEqual(checkVerificationRows([failedRow('ev-0001', none)], e).errors, [{ reason: 'failed_sem_motivo', evidence_id: 'ev-0001', check_id: 'CITATION' }]);
});

test('reasons belong to their own check: every code is accepted under its check and refused under the other', () => {
  const e = [evidenceOf('ev-0001')];
  const under = (check_id, reason) => reasonsOf([failedRow('ev-0001', [{ check_id, status: 'failed', reasons: [reason] }])], e);
  for (const reason of CITATION_REASONS) {
    assert.deepEqual(under('CITATION', reason), [], reason);
    assert.deepEqual(under('NUMBERS', reason), ['motivo_de_outro_check'], reason);
  }
  for (const reason of NUMBERS_REASONS) {
    assert.deepEqual(under('NUMBERS', reason), [], reason);
    assert.deepEqual(under('CITATION', reason), ['motivo_de_outro_check'], reason);
  }
  assert.deepEqual(under('CITATION', 'tom_ruim'), ['motivo_de_outro_check'], 'a code that is nobody\'s');
  assert.deepEqual(under('DELTAS', 'trecho_vazio'), ['motivo_de_outro_check'], 'an unknown check_id owns nothing');
});

test('a repeated reason is refused once per check', () => {
  const e = [evidenceOf('ev-0001')];
  const checks = [{ check_id: 'NUMBERS', status: 'failed', reasons: ['formato_invalido', 'formato_invalido', 'formato_invalido'] }];
  assert.deepEqual(checkVerificationRows([failedRow('ev-0001', checks)], e).errors, [{ reason: 'motivo_repetido', evidence_id: 'ev-0001', check_id: 'NUMBERS' }]);
});

test('the reason lists are the contract\'s enum, in order, and cover what citation.js can say', () => {
  const schema = read('contracts/verification.schema.json');
  assert.deepEqual(schema.properties.checks.items.properties.reasons.items.enum, [...CITATION_REASONS, ...NUMBERS_REASONS]);
  assert.deepEqual(schema.properties.checks.items.properties.check_id.enum, ['CITATION', 'NUMBERS']);
  const said = new Set();
  for (const [page, text] of [[9, 'x'], [1, '   '], [1, 'ausente']]) {
    for (const e of checkCitation({ page, source_text: text }, ['presente']).errors) said.add(e.reason);
  }
  assert.deepEqual([...said].sort(), [...CITATION_REASONS].sort());
  for (const reason of numbers.extractNumbers('1.2.3 ' + '1'.repeat(16)).errors.map((e) => e.reason)) assert.ok(NUMBERS_REASONS.includes(reason), reason);
  for (const reason of ['numero_nao_autorizado', 'unidade_divergente']) assert.ok(NUMBERS_REASONS.includes(reason));
});

test('all the problems of a job are reported, in the order rows, then missing rows; inputs are not changed', () => {
  const evidences = [evidenceOf('ev-0001'), evidenceOf('ev-0002'), evidenceOf('ev-0003')];
  const rows = [row('ev-0001', { checks: [{ check_id: 'CITATION', status: 'passed', reasons: [] }] }), row('ev-0009')];
  const before = JSON.stringify([rows, evidences]);
  const first = checkVerificationRows(rows, evidences);
  assert.deepEqual(first.errors.map((e) => [e.reason, e.evidence_id]), [['verified_sem_checagem_completa', 'ev-0001'], ['evidencia_inexistente', 'ev-0009'], ['evidencia_sem_linha', 'ev-0002'], ['evidencia_sem_linha', 'ev-0003']]);
  assert.deepEqual(first, checkVerificationRows(rows, evidences));
  assert.equal(JSON.stringify([rows, evidences]), before);
});

test('checkVerificationRows: bad arguments are a TypeError with their own message', () => {
  const cases = [
    [null, [], /rows must be an array/], ['x', [], /rows must be an array/], [[], null, /evidences must be an array/],
    [[5], [], /rows\[0\] must be an object/], [[null], [], /rows\[0\] must be an object/],
    [[{ evidence_id: 5 }], [], /rows\[0\]\.evidence_id must be a string/],
    [[{ evidence_id: 'a', status: 1 }], [], /rows\[0\]\.status must be a string/],
    [[{ evidence_id: 'a', status: 'VERIFIED' }], [], /rows\[0\]\.checks must be an array/],
    [[{ evidence_id: 'a', status: 'VERIFIED', checks: [5] }], [], /rows\[0\]\.checks\[0\] must be an object/],
    [[{ evidence_id: 'a', status: 'VERIFIED', checks: [{ check_id: 1 }] }], [], /checks\[0\]\.check_id must be a string/],
    [[{ evidence_id: 'a', status: 'VERIFIED', checks: [{ check_id: 'A', status: 1 }] }], [], /checks\[0\]\.status must be a string/],
    [[{ evidence_id: 'a', status: 'VERIFIED', checks: [{ check_id: 'A', status: 'passed' }] }], [], /checks\[0\]\.reasons must be an array/],
    [[], [5], /evidences\[0\] must be an object/], [[], [{ evidence_id: 5 }], /evidences\[0\]\.evidence_id must be a string/],
  ];
  for (const [rows, evidences, message] of cases) assert.throws(() => checkVerificationRows(rows, evidences), { name: 'TypeError', message }, String(message));
});

// ---- runNumbersCheck -------------------------------------------------------------------------------

const ev = (source_text, claim, measures = []) => ({ source_text, claim, measures });
const run = (evidence) => runNumbersCheck(evidence, numbers);
const SRC = 'O indicador passou de 84% para 92% e a queda foi de -5 pontos, com 9,52% no total.';

test('NUMBERS passes when the claim and the measures use only numbers that the excerpt holds', () => {
  assert.deepEqual(run(EVIDENCE), { status: 'passed', reasons: [] });
  assert.deepEqual(run(ev(SRC, 'Foi de 84% para 92%.', [{ role: 'before', raw: '84%' }, { role: 'after', raw: '92%' }])), { status: 'passed', reasons: [] });
  assert.deepEqual(run(ev(SRC, 'Sem número nenhum.')), { status: 'passed', reasons: [] }, 'a claim without numbers');
  assert.deepEqual(run(ev(SRC, 'Total de 9,52%.', [{ role: 'single', raw: '9,52%' }, { role: 'single', raw: '-5' }])), { status: 'passed', reasons: [] });
});

test('claim numbers: one that is not in the excerpt, one with another unit, one with a bad format', () => {
  assert.deepEqual(run(ev(SRC, 'Foi de 84% para 94%.')), { status: 'failed', reasons: ['numero_nao_autorizado'] });
  assert.deepEqual(run(ev(SRC, 'Foi de 84 pp.')), { status: 'failed', reasons: ['unidade_divergente'] });
  assert.deepEqual(run(ev(SRC, 'Foi de 84.')), { status: 'failed', reasons: ['unidade_divergente'] }, 'a bare 84 is not 84%');
  assert.deepEqual(run(ev(SRC, 'Foi de 9.52%.')), { status: 'failed', reasons: ['formato_invalido'] });
  assert.deepEqual(run(ev(SRC, `Valor ${'1'.repeat(16)}.`)), { status: 'failed', reasons: ['precisao_excedida'] });
  assert.deepEqual(run(ev(SRC, 'Foi de 184%.')), { status: 'failed', reasons: ['numero_nao_autorizado'] }, '84 is not inside 184');
  assert.deepEqual(run(ev(SRC, 'Queda de 5 pontos.')), { status: 'failed', reasons: ['numero_nao_autorizado'] }, 'the sign counts: -5 is not 5');
});

test('measures: not exactly one number, not in the excerpt, wrong unit, padded, or malformed', () => {
  const m = (raw) => run(ev(SRC, 'Sem número.', [{ role: 'single', raw }]));
  for (const raw of ['77%', '84', '92 pp', '184%', '5', ' 84%', '84% ', '84% 92%', 'abc', '', '%', '84 e 92']) {
    assert.deepEqual(m(raw), { status: 'failed', reasons: ['medida_fora_do_trecho'] }, JSON.stringify(raw));
  }
  assert.deepEqual(m('9.52%'), { status: 'failed', reasons: ['formato_invalido'] });
  assert.deepEqual(m('1'.repeat(16)), { status: 'failed', reasons: ['precisao_excedida'] });
  assert.deepEqual(m('84%'), { status: 'passed', reasons: [] });
});

test('measures match by number, so a different spelling of the same value and unit is the same measure', () => {
  assert.deepEqual(run(ev('Subiu 84 % no ano.', 'Sem número.', [{ role: 'single', raw: '84%' }])), { status: 'passed', reasons: [] });
  assert.deepEqual(run(ev('Subiu 84% no ano.', 'Sem número.', [{ role: 'single', raw: '84 %' }])), { status: 'passed', reasons: [] });
});

test('numbers of the excerpt that are malformed are not allowed values; they do not make the check fail by themselves', () => {
  assert.deepEqual(run(ev('Versão 1.2.3 e 84%.', 'Foi 84%.')), { status: 'passed', reasons: [] });
  assert.deepEqual(run(ev('Versão 1.2.3 e 84%.', 'Foi 1.2.3.')), { status: 'failed', reasons: ['formato_invalido'] });
});

test('reasons are deduped and come in the fixed order of NUMBERS_REASONS', () => {
  const result = run(ev(SRC, 'De 11% para 12%, 84 pp e 9.5%.', [{ role: 'single', raw: '77%' }, { role: 'single', raw: '88%' }, { role: 'single', raw: '9.52%' }]));
  assert.deepEqual(result.reasons, ['formato_invalido', 'numero_nao_autorizado', 'unidade_divergente', 'medida_fora_do_trecho']);
  assert.deepEqual(result.reasons, NUMBERS_REASONS.filter((r) => result.reasons.includes(r)));
  assert.equal(result.status, 'failed');
});

test('the result carries only the status and the codes, never the text; inputs are not changed; same input, same output', () => {
  const evidence = clone(EVIDENCE);
  evidence.claim = 'Segredo de 55%.';
  const before = JSON.stringify(evidence);
  const first = run(evidence);
  assert.deepEqual(first, run(evidence));
  assert.equal(JSON.stringify(evidence), before);
  assert.deepEqual(Object.keys(first), ['status', 'reasons']);
  assert.doesNotMatch(JSON.stringify(first), /Segredo|55/);
});

test('runNumbersCheck: bad arguments are a TypeError with their own message', () => {
  const ok = ev('a 1', 'b', []);
  const cases = [
    [null, numbers, /evidence must be an object/], [[], numbers, /evidence must be an object/],
    [ok, null, /numbers must be an object/], [ok, {}, /numbers must provide/], [ok, { extractNumbers: numbers.extractNumbers }, /numbers must provide/],
    [{ ...ok, source_text: 5 }, numbers, /source_text must be a string/], [{ ...ok, claim: null }, numbers, /claim must be a string/],
    [{ ...ok, measures: 'x' }, numbers, /measures must be an array/], [{ ...ok, measures: [5] }, numbers, /measures\[0\] must be an object/],
    [{ ...ok, measures: [{ raw: 5 }] }, numbers, /measures\[0\]\.raw must be a string/],
  ];
  for (const [evidence, deps, message] of cases) assert.throws(() => runNumbersCheck(evidence, deps), { name: 'TypeError', message }, String(message));
});
