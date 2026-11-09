'use strict';

// The insight-generator prompt (stage 04_INSIGHTS) asks a model for rows of the insight contract, and
// validators judge them. The prompt has to agree with the contract and with the validator: one source
// for each limit and list, so none of them can drift. No test here runs a model.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { validate } = require('../../validators/schema.js');
const { checkInsights } = require('../../validators/insight.js');
const numbers = require('../../validators/numbers.js');
const { PROMPT_KEYS } = require('../../scripts/lib/baseline.js');

const ROOT = join(__dirname, '..', '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const SKILL = read('skills/insight-generator/SKILL.md');
const SCHEMAS = Object.fromEntries(['insight', 'evidence', 'verification'].map((n) => [n, JSON.parse(read(`contracts/${n}.schema.json`))]));
const jsonBlocks = (text) => [...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1]));
const BLOCKS = jsonBlocks(SKILL);
const INPUT = BLOCKS.filter((b) => Array.isArray(b.evidences) && b.evidences.length > 0 && b.evidences[0].claim !== 'string').pop();
const OUTPUT = BLOCKS.filter((b) => Array.isArray(b.insights) && b.insights.length > 0).pop();

const PROVENANCE = ['job_id', 'stage', 'config_source', 'config_version', 'model', 'execution_id', 'created_at'];
const MODEL_FIELDS = Object.keys(SCHEMAS.insight.properties).filter((key) => !PROVENANCE.includes(key) && key !== 'insight_id');

// The provenance and the ids are code's job: the same ones as the valid fixtures.
const base = (stage, model) => ({
  job_id: '00000000-0000-4000-8000-000000000001',
  stage,
  config_source: 'public',
  config_version: 'v1',
  model,
  execution_id: 'exec-0001',
  created_at: '2026-11-07T12:00:00Z',
});
const id = (prefix, n) => `${prefix}-${String(n).padStart(4, '0')}`;

// What the code hands to checkInsights for the example: the evidence rows of the input, one VERIFIED
// verification row for each, and the insight rows built from the model's output.
function jobFor(input, output, status = 'VERIFIED') {
  const evidences = input.evidences.map((e) => ({ ...base('02_EXTRACT', 'synthetic-model-v0'), evidence_id: e.evidence_id, page: 1, source_text: e.source_text, claim: e.claim, measures: [] }));
  const verifications = input.evidences.map((e) => ({
    ...base('03_VERIFY', 'not_reported'),
    evidence_id: e.evidence_id,
    status,
    checks: [{ check_id: 'CITATION', status: 'passed', reasons: [] }, { check_id: 'NUMBERS', status: 'passed', reasons: [] }],
  }));
  const insights = output.insights.map((insight, i) => ({ ...base('04_INSIGHTS', 'synthetic-model-v0'), insight_id: id('ins', i + 1), ...insight }));
  return { evidences, verifications, insights };
}

test('the skill folder maps to prompt.04_insights, the key of CLAUDE.md section 9', () => {
  assert.equal(PROMPT_KEYS['insight-generator'], 'prompt.04_insights');
});

test('the prompt shows an input and an output example, and finds them', () => {
  assert.ok(INPUT, 'esperava um exemplo de entrada com evidences');
  assert.ok(OUTPUT, 'esperava um exemplo de saída com insights');
});

test('what the model writes is exactly the contract minus the provenance and the id, which are code', () => {
  assert.deepEqual([...MODEL_FIELDS].sort(), ['evidence_ids', 'text']);
  for (const insight of OUTPUT.insights) assert.deepEqual(Object.keys(insight).sort(), [...MODEL_FIELDS].sort());
  assert.match(SKILL, /\*\*não\*\* numera o insight \(`insight_id`\)/);
  assert.match(SKILL, /não escreve proveniência/);
});

test('the model is handed what the validator needs: the id, the claim and the source_text of each evidence', () => {
  for (const evidence of INPUT.evidences) assert.deepEqual(Object.keys(evidence).sort(), ['claim', 'evidence_id', 'source_text']);
});

test('the limits written in the prompt are the limits of the contract', () => {
  assert.match(SKILL, new RegExp(`até ${SCHEMAS.insight.properties.text.maxLength} caracteres`));
  assert.equal(SCHEMAS.insight.properties.evidence_ids.minItems, 1);
  assert.match(SKILL, /ao menos uma evidência/);
});

test('the example obeys the rules it teaches: schema, ids and numbers all pass, with every evidence VERIFIED', () => {
  const { evidences, verifications, insights } = jobFor(INPUT, OUTPUT);
  for (const e of evidences) assert.deepEqual(validate(SCHEMAS.evidence, e).errors, [], 'a evidência do exemplo reprova no schema');
  for (const v of verifications) assert.deepEqual(validate(SCHEMAS.verification, v).errors, [], 'a verificação do exemplo reprova no schema');
  for (const i of insights) assert.deepEqual(validate(SCHEMAS.insight, i).errors, [], 'o insight do exemplo reprova no schema');
  assert.ok(OUTPUT.insights.every((i) => i.evidence_ids.every((e) => INPUT.evidences.some((x) => x.evidence_id === e))));
  assert.deepEqual(checkInsights(insights, verifications, evidences, numbers), { passed: true, errors: [] });
});

test('the example is a real check: a delta, a foreign number, an unknown id or an unverified evidence fails', () => {
  const run = (mutate, status) => {
    const job = jobFor(INPUT, { insights: OUTPUT.insights.map((i) => mutate({ ...i })) }, status);
    return checkInsights(job.insights, job.verifications, job.evidences, numbers);
  };
  const reasons = (result) => result.errors.map((e) => e.reason);
  assert.ok(reasons(run((i) => ({ ...i, text: `${i.text} A diferença foi de 8 pontos.` }))).includes('numero_nao_autorizado'), 'um delta que nenhuma evidência escreve');
  assert.ok(reasons(run((i) => ({ ...i, text: `${i.text} Foram 77%.` }))).includes('numero_nao_autorizado'), 'um número que nenhuma evidência tem');
  assert.ok(reasons(run((i) => ({ ...i, evidence_ids: ['ev-0099'] }))).includes('evidencia_inexistente'), 'um id fora da entrada');
  assert.ok(reasons(run((i) => i, 'FAILED')).includes('evidencia_nao_verificada'), 'uma evidência reprovada');
  assert.equal(run((i) => i).passed, true);
});

test('the prompt closes the doors the validator cannot: causation, calculation, order and labels', () => {
  assert.match(SKILL, /Não calcule/);
  assert.match(SKILL, /associação, não escreva causa/);
  assert.match(SKILL, /ranquear é do 05_SCORE/);
  assert.match(SKILL, /Não classifique/);
  assert.match(SKILL, /Na dúvida, omita/);
});

test('the prompt runs as a single node at temperature 0, without tools, and reads only VERIFIED evidences', () => {
  assert.match(SKILL, /temperatura 0/);
  assert.match(SKILL, /Sem ferramentas, sem memória, sem laço/);
  assert.match(SKILL, /somente|só chama este nó com evidências `VERIFIED`/);
});
