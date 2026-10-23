'use strict';

// D-17 (2026-10-23): the CTA is inert text and the caption lives outside the art. The prompts that ask
// a model for them have to agree with the contract, the validator and the QA reasons. One source for
// each number and list, so none of them can drift.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join } = require('node:path');
const { checkCta, checkCaption, CTA_MAX, CAPTION_MAX } = require('../../validators/copy.js');

const ROOT = join(__dirname, '..', '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));
const COPY = read('skills/copywriter-cfm/SKILL.md');
const QA = read('skills/qa-validator/SKILL.md');
const LIB = readJson('config/baseline/visual_library.json');
const jsonBlocks = (text) => [...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1]));

test('the qa-validator reasons are exactly the enum of qa_result (one source), and cta_promete_entrega is among them', () => {
  const section = /## Motivos permitidos[^\n]*\n\n([^\n]+)\n/.exec(QA);
  assert.ok(section, 'seção de motivos não encontrada');
  const listed = [...section[1].matchAll(/`([a-z_]+)`/g)].map((m) => m[1]);
  const schema = readJson('contracts/qa_result.schema.json').properties.semantic.properties.reasons.items.enum;
  assert.deepEqual(listed, schema);
  assert.ok(schema.includes('cta_promete_entrega'));
  assert.match(QA, /`cta_promete_entrega`/);
});

test('the qa-validator input carries cta and caption, and its rules cover an inert CTA', () => {
  const input = jsonBlocks(QA)[0];
  assert.ok('cta' in input && 'caption' in input);
  assert.match(QA, /texto inerte/);
  assert.match(QA, /Vale também para a `caption`/);
});

test('the copywriter input carries the limits of the decision, equal to the validator\'s constants', () => {
  const example = jsonBlocks(COPY).find((b) => Array.isArray(b.blocklist) && b.blocklist.length > 1);
  assert.deepEqual(example.limits, { cta_max_chars: CTA_MAX, caption_max_chars: CAPTION_MAX });
  const format = jsonBlocks(COPY)[0];
  assert.deepEqual(format.limits, { cta_max_chars: 40, caption_max_chars: 300 });
  assert.equal(CTA_MAX, 40);
  assert.equal(CAPTION_MAX, 300);
  assert.match(COPY, /\(40\) caracteres/);
  assert.match(COPY, /\(300\) caracteres/);
});

test('the copywriter output asks for caption and caption_evidence_ids, and says who builds cta and post_copy', () => {
  const output = jsonBlocks(COPY)[1];
  assert.deepEqual(Object.keys(output), ['evidence_ids', 'slots', 'alt_text', 'caption', 'caption_evidence_ids']);
  assert.match(COPY, /copia a linha do slot `cta_label` para o campo `cta`/);
  assert.match(COPY, /contracts\/post_copy\.schema\.json/);
  assert.equal('cta' in output, false, 'the code derives cta from the slot; the model does not write it twice');
});

test('the copywriter prompt forbids what makes a CTA non-inert, and names none of the automation', () => {
  for (const word of ['inerte', 'receba', 'baixe', 'link', 'direct', 'URL', '`@`', '`#`', 'telefone', 'hashtag', 'menção']) {
    assert.ok(COPY.includes(word), word);
  }
  assert.match(COPY, /Sem o slot `cta_label` na entrada, não escreva CTA/);
  assert.match(COPY, /Não cria gatilho, automação nem entrega de material/);
  assert.doesNotMatch(COPY + QA, /manychat/i);
});

test('the example of the copywriter prompt obeys the rules it teaches: its CTA and caption pass copy.js on a real template', () => {
  const [input, output] = [jsonBlocks(COPY).find((b) => Array.isArray(b.blocklist) && b.blocklist.length > 1), jsonBlocks(COPY).filter((b) => 'caption' in b).pop()];
  assert.equal(input.template_id, 'story-01-convite');
  const template = LIB.templates.find((t) => t.template_id === input.template_id);
  assert.ok(template.slots.some((s) => s.slot_id === 'cta_label'));
  const cta = output.slots.find((s) => s.slot_id === 'cta_label').lines;
  assert.equal(cta.length, 1);
  const cover = { cta: cta[0], slots: output.slots };
  assert.deepEqual(checkCta(cover, template), { passed: true, errors: [] });
  assert.deepEqual(checkCaption(output.caption), { passed: true, errors: [] });
  assert.ok(output.caption_evidence_ids.every((id) => input.evidences.some((e) => e.evidence_id === id)));
});

test('nothing that configures engagement automation exists in contracts, validators, skills or config', () => {
  const walk = (dir) => readdirSync(join(ROOT, dir)).flatMap((n) => {
    const rel = `${dir}/${n}`;
    return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
  });
  const files = [...walk('contracts'), ...walk('config'), ...walk('skills'), ...walk('validators').filter((f) => !f.endsWith('.test.js'))];
  assert.ok(files.length > 15);
  for (const f of files) assert.doesNotMatch(read(f), /manychat/i, f);
});
