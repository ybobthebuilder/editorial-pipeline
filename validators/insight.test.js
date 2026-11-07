'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { checkInsights, NUMBER_REASONS } = require('./insight.js');
const numbers = require('./numbers.js');

const ROOT = join(__dirname, '..');
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const EVIDENCE = read('fixtures/synthetic/contracts/evidence/valid-01.json');
const JOB = EVIDENCE.job_id;
const SRC = 'O indicador passou de 84% para 92% e a queda foi de -5 pontos, com 9,52% no total.';
const evidenceOf = (id, extra = {}) => ({ ...clone(EVIDENCE), evidence_id: id, source_text: SRC, ...extra });
const verification = (id, extra = {}) => ({ job_id: JOB, evidence_id: id, status: 'VERIFIED', ...extra });
const insight = (id, text, evidence_ids, extra = {}) => ({ job_id: JOB, insight_id: id, text, evidence_ids, ...extra });
const run = (insights, verifications, evidences) => checkInsights(insights, verifications, evidences, numbers);
const reasons = (...args) => run(...args).errors.map((e) => e.reason);
const BASE = () => ({ insights: [insight('ins-0001', 'Foi de 84% para 92%.', ['ev-0001'])], verifications: [verification('ev-0001')], evidences: [evidenceOf('ev-0001')] });
const go = (b) => run(b.insights, b.verifications, b.evidences);

test('an insight that cites a VERIFIED evidence and uses only its numbers passes', () => {
  assert.deepEqual(go(BASE()), { passed: true, errors: [] });
  assert.deepEqual(run([read('fixtures/synthetic/contracts/insight/valid-01.json')], [read('fixtures/synthetic/contracts/verification/valid-01.json')], [EVIDENCE]), { passed: true, errors: [] });
  const b = BASE();
  b.insights = [insight('ins-0001', 'Sem número nenhum.', ['ev-0001']), insight('ins-0002', 'Total de 9,52%, queda de -5.', ['ev-0001'])];
  assert.deepEqual(go(b), { passed: true, errors: [] });
});

test('a job without insights fails, and so does a repeated insight_id (reported once)', () => {
  assert.deepEqual(run([], [], []).errors, [{ reason: 'sem_insights', insight_id: null }]);
  const b = BASE();
  b.insights = [insight('ins-0001', 'a', ['ev-0001']), insight('ins-0001', 'b', ['ev-0001']), insight('ins-0001', 'c', ['ev-0001'])];
  assert.deepEqual(go(b).errors, [{ reason: 'insight_repetido', insight_id: 'ins-0001' }]);
});

test('a blank text is texto_vazio, and nothing else is said about it', () => {
  for (const text of ['', '   ', '\n\t ']) {
    const b = BASE();
    b.insights = [insight('ins-0001', text, ['ev-0001'])];
    assert.deepEqual(go(b).errors, [{ reason: 'texto_vazio', insight_id: 'ins-0001' }], JSON.stringify(text));
  }
});

test('a cited evidence must have a verification row, in the same job, with status VERIFIED', () => {
  const b = BASE();
  b.insights = [insight('ins-0001', 'Sem número.', ['ev-0001', 'ev-0009'])];
  assert.deepEqual(go(b).errors, [{ reason: 'evidencia_inexistente', insight_id: 'ins-0001', evidence_id: 'ev-0009' }]);

  const other = BASE();
  other.insights = [insight('ins-0001', 'Sem número.', ['ev-0001'])];
  other.verifications = [verification('ev-0001', { job_id: '00000000-0000-4000-8000-000000000099' })];
  assert.deepEqual(go(other).errors, [{ reason: 'job_divergente', insight_id: 'ins-0001', evidence_id: 'ev-0001' }]);

  const failed = BASE();
  failed.verifications = [verification('ev-0001', { status: 'FAILED' })];
  assert.deepEqual(reasons(failed.insights, failed.verifications, failed.evidences), ['evidencia_nao_verificada', 'numero_nao_autorizado'], 'its numbers are not allowed either, reported once');
  for (const status of ['verified', 'PENDING', '', 'FAILED']) {
    const c = BASE();
    c.insights = [insight('ins-0001', 'Sem número.', ['ev-0001'])];
    c.verifications = [verification('ev-0001', { status })];
    assert.deepEqual(go(c).errors, [{ reason: 'evidencia_nao_verificada', insight_id: 'ins-0001', evidence_id: 'ev-0001' }], status);
  }
});

test('a verification row that exists twice counts as VERIFIED only if both are', () => {
  const b = BASE();
  b.insights = [insight('ins-0001', 'Sem número.', ['ev-0001'])];
  b.verifications = [verification('ev-0001'), verification('ev-0001')];
  assert.deepEqual(go(b), { passed: true, errors: [] });
  b.verifications = [verification('ev-0001'), verification('ev-0001', { status: 'FAILED' })];
  assert.deepEqual(go(b).errors.map((e) => e.reason), ['evidencia_nao_verificada']);
  b.verifications = [verification('ev-0001'), verification('ev-0001', { job_id: '00000000-0000-4000-8000-000000000099' })];
  assert.deepEqual(go(b).errors.map((e) => e.reason), ['job_divergente']);
});

test('an evidence that exists but has no verification row is evidencia_inexistente, never accepted', () => {
  const b = BASE();
  b.insights = [insight('ins-0001', 'Sem número.', ['ev-0001'])];
  b.verifications = [];
  assert.deepEqual(go(b).errors, [{ reason: 'evidencia_inexistente', insight_id: 'ins-0001', evidence_id: 'ev-0001' }]);
  b.verifications = [verification('ev-0002')];
  assert.deepEqual(go(b).errors.map((e) => e.reason), ['evidencia_inexistente'], 'a row for another evidence does not count');
});

test('a VERIFIED evidence whose row is missing from the job, or belongs to another job, is evidencia_inexistente', () => {
  const b = BASE();
  b.insights = [insight('ins-0001', 'Sem número.', ['ev-0001'])];
  b.evidences = [];
  assert.deepEqual(go(b).errors, [{ reason: 'evidencia_inexistente', insight_id: 'ins-0001', evidence_id: 'ev-0001' }]);
  b.evidences = [evidenceOf('ev-0001', { job_id: '00000000-0000-4000-8000-000000000099' })];
  assert.deepEqual(go(b).errors.map((e) => e.reason), ['evidencia_inexistente']);
});

test('an evidence_id repeated inside one insight is refused once and judged once', () => {
  const b = BASE();
  b.insights = [insight('ins-0001', 'Foi de 84% para 92%.', ['ev-0001', 'ev-0001', 'ev-0001'])];
  assert.deepEqual(go(b).errors, [{ reason: 'evidencia_repetida_no_insight', insight_id: 'ins-0001', evidence_id: 'ev-0001' }]);
  b.insights = [insight('ins-0001', 'Sem número.', ['ev-0009', 'ev-0009'])];
  assert.deepEqual(go(b).errors.map((e) => e.reason), ['evidencia_inexistente', 'evidencia_repetida_no_insight'], 'the second copy is not judged again');
  b.verifications = [verification('ev-0001', { status: 'FAILED' })];
  b.insights = [insight('ins-0001', 'Sem número.', ['ev-0001', 'ev-0001'])];
  assert.deepEqual(go(b).errors.map((e) => e.reason), ['evidencia_nao_verificada', 'evidencia_repetida_no_insight']);
});

test('numbers: each one must be in a cited VERIFIED evidence with the same value and unit', () => {
  const t = (text) => { const b = BASE(); b.insights = [insight('ins-0001', text, ['ev-0001'])]; return reasons(b.insights, b.verifications, b.evidences); };
  assert.deepEqual(t('Foi de 84% para 94%.'), ['numero_nao_autorizado']);
  assert.deepEqual(t('Foi de 84 pp.'), ['unidade_divergente']);
  assert.deepEqual(t('Foi de 84.'), ['unidade_divergente'], 'a bare 84 is not 84%');
  assert.deepEqual(t('Foi de 9.52%.'), ['formato_invalido']);
  assert.deepEqual(t(`Valor ${'1'.repeat(16)}.`), ['precisao_excedida']);
  assert.deepEqual(t('Foi de 184%.'), ['numero_nao_autorizado'], '84 is not inside 184');
  assert.deepEqual(t('Queda de 5 pontos.'), ['numero_nao_autorizado'], 'the sign counts');
  assert.deepEqual(t('Subiu 8 pp.'), ['numero_nao_autorizado'], 'a delta is not allowed here: 05_SCORE computes it');
});

test('numbers come only from the cited evidences, and only from VERIFIED ones', () => {
  const b = BASE();
  b.evidences = [evidenceOf('ev-0001'), evidenceOf('ev-0002', { source_text: 'O grupo B teve 41% de resposta.' })];
  b.verifications = [verification('ev-0001'), verification('ev-0002')];
  b.insights = [insight('ins-0001', 'A resposta foi de 41%.', ['ev-0001'])];
  assert.deepEqual(reasons(b.insights, b.verifications, b.evidences), ['numero_nao_autorizado'], 'ev-0002 holds 41% but is not cited');
  b.insights = [insight('ins-0001', 'A resposta foi de 41%.', ['ev-0001', 'ev-0002'])];
  assert.deepEqual(go(b), { passed: true, errors: [] }, 'several evidences, their numbers together');
  b.verifications = [verification('ev-0001'), verification('ev-0002', { status: 'FAILED' })];
  assert.deepEqual(reasons(b.insights, b.verifications, b.evidences), ['evidencia_nao_verificada', 'numero_nao_autorizado'], 'the numbers of a non-VERIFIED evidence are not allowed');
});

test('malformed numbers in a source_text are not allowed values and do not fail an insight that does not use them', () => {
  const b = BASE();
  b.evidences = [evidenceOf('ev-0001', { source_text: 'Versão 1.2.3 e 84%.' })];
  b.insights = [insight('ins-0001', 'Foi 84%.', ['ev-0001'])];
  assert.deepEqual(go(b), { passed: true, errors: [] });
  b.insights = [insight('ins-0001', 'Foi 1.2.3.', ['ev-0001'])];
  assert.deepEqual(reasons(b.insights, b.verifications, b.evidences), ['formato_invalido']);
});

test('each number reason is reported once per insight, in the fixed order of NUMBER_REASONS', () => {
  const b = BASE();
  b.insights = [insight('ins-0001', 'De 11% para 12%, 84 pp e 9.5%.', ['ev-0001'])];
  const got = reasons(b.insights, b.verifications, b.evidences);
  assert.deepEqual(got, ['formato_invalido', 'numero_nao_autorizado', 'unidade_divergente']);
  assert.deepEqual(got, NUMBER_REASONS.filter((r) => got.includes(r)));
  const b2 = BASE();
  b2.insights = [insight('ins-0001', `De 9.5% para ${'1'.repeat(16)} e 77 pp.`, ['ev-0001'])];
  assert.deepEqual(reasons(b2.insights, b2.verifications, b2.evidences), ['formato_invalido', 'precisao_excedida', 'numero_nao_autorizado']);
  assert.deepEqual(NUMBER_REASONS, ['formato_invalido', 'precisao_excedida', 'numero_nao_autorizado', 'unidade_divergente']);
});

test('passed is false whenever there is an error, true only with none', () => {
  assert.equal(go(BASE()).passed, true);
  assert.equal(run([], [], []).passed, false);
  const b = BASE();
  b.insights = [insight('ins-0001', 'Foi de 94%.', ['ev-0001'])];
  assert.equal(go(b).passed, false);
});

test('all problems of a job are reported, insight by insight; inputs are not changed; the output has no text', () => {
  const b = BASE();
  b.insights = [insight('ins-0001', 'Segredo de 55%.', ['ev-0001', 'ev-0009']), insight('ins-0002', '   ', ['ev-0001'])];
  const before = JSON.stringify(b);
  const first = go(b);
  assert.deepEqual(first.errors.map((e) => [e.reason, e.insight_id, e.evidence_id]), [
    ['evidencia_inexistente', 'ins-0001', 'ev-0009'], ['numero_nao_autorizado', 'ins-0001', undefined], ['texto_vazio', 'ins-0002', undefined],
  ]);
  assert.deepEqual(first, go(b));
  assert.equal(JSON.stringify(b), before);
  assert.doesNotMatch(JSON.stringify(first), /Segredo|55/);
});

test('checkInsights: bad arguments are a TypeError with their own message', () => {
  const ok = BASE();
  const call = (a, b, c, d = numbers) => () => checkInsights(a, b, c, d);
  const cases = [
    [call(null, [], []), /insights must be an array/], [call([], 'x', []), /verifications must be an array/], [call([], [], {}), /evidences must be an array/],
    [call([], [], [], null), /numbers must be an object/], [call([], [], [], {}), /numbers must provide/], [call([], [], [], { extractNumbers() {} }), /numbers must provide/],
    [call([5], [], []), /insights\[0\] must be an object/], [call([{ insight_id: 1 }], [], []), /insights\[0\]\.insight_id must be a string/],
    [call([{ insight_id: 'a', text: 5 }], [], []), /insights\[0\]\.text must be a string/], [call([{ insight_id: 'a', text: 'b' }], [], []), /insights\[0\]\.evidence_ids must be an array/],
    [call([{ insight_id: 'a', text: 'b', evidence_ids: [5] }], [], []), /insights\[0\]\.evidence_ids\[0\] must be a string/],
    [call(ok.insights, [5], ok.evidences), /verifications\[0\] must be an object/], [call(ok.insights, [{ evidence_id: 1 }], ok.evidences), /verifications\[0\]\.evidence_id must be a string/],
    [call(ok.insights, [{ evidence_id: 'a', status: 1 }], ok.evidences), /verifications\[0\]\.status must be a string/],
    [call(ok.insights, ok.verifications, [5]), /evidences\[0\] must be an object/], [call(ok.insights, ok.verifications, [{ evidence_id: 1 }]), /evidences\[0\]\.evidence_id must be a string/],
    [call(ok.insights, ok.verifications, [{ evidence_id: 'a', source_text: 1 }]), /evidences\[0\]\.source_text must be a string/],
  ];
  for (const [fn, message] of cases) assert.throws(fn, { name: 'TypeError', message }, String(message));
});
