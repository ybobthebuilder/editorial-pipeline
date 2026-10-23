'use strict';

// Tests of the image_assets schema (layer (a)) and of validators/media.js (layer (b)) of the
// clinical-media block (decisions D-15 and U24; approval as a database record, 2026-10-22).
// Fixtures are synthetic; see fixtures/synthetic/contracts.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { validate } = require('./schema.js');
const { checkMedia, CLINICAL_SUBJECTS, APPROVABLE_SUBJECTS } = require('./media.js');

const ROOT = join(__dirname, '..');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const SCHEMA = readJson(join(ROOT, 'contracts', 'image_assets.schema.json'));
const fixture = (name) => readJson(join(ROOT, 'fixtures', 'synthetic', 'contracts', 'image_assets', `${name}.json`));
const clone = (value) => JSON.parse(JSON.stringify(value));
const schemaPaths = (data) => validate(SCHEMA, data).errors.map((e) => e.path);

const JOB = '00000000-0000-4000-8000-000000000001';
const APPROVAL = '00000000-0000-4000-8000-0000000000a1';
// The row get_image_approvals returns for the exception of valid-01.
const approvalRow = (over = {}) => ({ id: APPROVAL, job_id: JOB, ref: 'img://job-0001/2', subject: 'none', signed_at: '2026-10-22T12:00:00Z', ...over });
const valid = () => clone(fixture('valid-01'));
const reasons = (result) => result.errors.map((e) => [e.list, e.index, e.reason]);
const check = (assets, approvals = [approvalRow()]) => checkMedia(assets, approvals);
const withImage = (over, base = {}) => ({ ...fixture('valid-02'), job_id: JOB, images: [{ ...fixture('valid-01').images[0], ...base, ...over }] });
const withException = (over, approvals = [approvalRow()]) => ({
  result: checkMedia({ ...fixture('valid-02'), job_id: JOB, exceptions: [{ ...fixture('valid-01').exceptions[0], ...over }] }, approvals),
});

// ---- Layer (a): the schema -------------------------------------------------------------------

test('image_assets schema: provenance block first, 01_INGEST, closed objects, subject and seal enums as proposed', () => {
  assert.deepEqual(Object.keys(SCHEMA.properties), ['job_id', 'stage', 'config_source', 'config_version', 'model', 'execution_id', 'created_at', 'images', 'exceptions']);
  assert.equal(SCHEMA.properties.stage.const, '01_INGEST');
  assert.equal(SCHEMA.additionalProperties, false);
  assert.equal(SCHEMA.properties.images.items.additionalProperties, false);
  assert.equal(SCHEMA.properties.exceptions.items.additionalProperties, false);
  const item = SCHEMA.properties.images.items.properties;
  assert.deepEqual(item.subject.enum, ['none', 'person_not_patient', 'patient', 'before_after', 'exam', 'unknown']);
  assert.deepEqual(item.seal.enum, ['applied', 'not_applicable']);
  assert.deepEqual(Object.keys(item).sort(), ['alt_text', 'attribution', 'provenance', 'ref', 'seal', 'subject']);
  assert.deepEqual(Object.keys(SCHEMA.properties.exceptions.items.properties).sort(), ['alt_text', 'approval_id', 'attribution', 'provenance', 'ref', 'seal', 'subject']);
});

test('layer (a): images[] accepts only generated_illustration and stock_licensed; owned_photo is a schema error there', () => {
  assert.deepEqual(SCHEMA.properties.images.items.properties.provenance.enum, ['generated_illustration', 'stock_licensed']);
  for (const provenance of ['generated_illustration', 'stock_licensed']) {
    const data = valid();
    data.images[0].provenance = provenance;
    assert.deepEqual(schemaPaths(data), [], provenance);
  }
  for (const provenance of ['owned_photo', 'patient_upload', 'Stock_Licensed', '', 'stock_licensed ', 7]) {
    const data = valid();
    data.images[0].provenance = provenance;
    assert.deepEqual(schemaPaths(data), ['$.images[0].provenance'], String(provenance));
  }
});

test('layer (a): exceptions[] is owned_photo only, and carries an approval_id (a lowercase uuid), not a flag', () => {
  assert.equal(SCHEMA.properties.exceptions.items.properties.provenance.const, 'owned_photo');
  for (const provenance of ['generated_illustration', 'stock_licensed', 'OWNED_PHOTO', '']) {
    const data = valid();
    data.exceptions[0].provenance = provenance;
    assert.deepEqual(schemaPaths(data), ['$.exceptions[0].provenance'], provenance);
  }
  for (const approval of ['', 'x', 7, null, true, 'A0000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a', '00000000-0000-4000-8000-0000000000a1 ']) {
    const data = valid();
    data.exceptions[0].approval_id = approval;
    assert.deepEqual(schemaPaths(data), ['$.exceptions[0].approval_id'], String(approval));
  }
  // The old design carried the approval in the payload. Neither field exists any more.
  for (const key of ['human_approved', 'justification']) {
    const data = valid();
    data.exceptions[0][key] = key === 'human_approved' ? true : 'Foto da fachada do consultório, sem pessoas.';
    assert.deepEqual(schemaPaths(data), [`$.exceptions[0].${key}`], key);
  }
  assert.equal(Object.hasOwn(SCHEMA.properties.images.items.properties, 'approval_id'), false);
  const data = valid();
  data.images[0].approval_id = APPROVAL;
  assert.deepEqual(schemaPaths(data), ['$.images[0].approval_id']);
});

test('ref, attribution and alt_text bounds', () => {
  for (const ref of ['', 'img://', 'job-0001/0', 'http://job-0001/0', 'IMG://job-0001/0', 'img://job 0001', 'xximg://job-0001/0', 'img://job-0001/0\n', 'img://ç']) {
    const data = valid();
    data.images[0].ref = ref;
    assert.deepEqual(schemaPaths(data), ['$.images[0].ref'], JSON.stringify(ref));
  }
  for (const ref of ['img://a', 'img://job-0001/0', 'img://NX-2026-10-13-001/0', 'img://a.b_c/d-e']) {
    const data = valid();
    data.images[0].ref = ref;
    assert.deepEqual(schemaPaths(data), [], ref);
  }
  const data = valid();
  data.images[0].attribution = '';
  assert.deepEqual(schemaPaths(data), ['$.images[0].attribution']);
  data.images[0].attribution = 'x';
  assert.deepEqual(schemaPaths(data), []);
  data.images[0].alt_text = 'x'.repeat(9);
  assert.deepEqual(schemaPaths(data), ['$.images[0].alt_text']);
  data.images[0].alt_text = 'x'.repeat(10);
  assert.deepEqual(schemaPaths(data), []);
  data.images[0].alt_text = 'x'.repeat(250);
  assert.deepEqual(schemaPaths(data), []);
  data.images[0].alt_text = 'x'.repeat(251);
  assert.deepEqual(schemaPaths(data), ['$.images[0].alt_text']);
});

test('every item field is required, in images[] and in exceptions[]', () => {
  for (const key of ['ref', 'provenance', 'subject', 'attribution', 'seal', 'alt_text']) {
    const data = valid();
    delete data.images[0][key];
    assert.deepEqual(schemaPaths(data), [`$.images[0].${key}`], `images.${key}`);
    const exc = valid();
    delete exc.exceptions[0][key];
    assert.deepEqual(schemaPaths(exc), [`$.exceptions[0].${key}`], `exceptions.${key}`);
  }
  const noList = valid();
  delete noList.exceptions;
  assert.deepEqual(schemaPaths(noList), ['$.exceptions']);
});

test('the schema accepts a clinical subject: refusing it is the validator\'s job, so it can say why', () => {
  for (const subject of ['patient', 'before_after', 'exam', 'unknown']) {
    const data = valid();
    data.images[0].subject = subject;
    assert.deepEqual(schemaPaths(data), [], subject);
  }
  const data = valid();
  data.images[0].subject = 'Patient';
  assert.deepEqual(schemaPaths(data), ['$.images[0].subject']);
});

// ---- Layer (b): media.js ---------------------------------------------------------------------

test('the valid fixtures pass, with the approval row that get_image_approvals would return', () => {
  assert.deepEqual(check(valid()), { passed: true, errors: [] });
  assert.deepEqual(checkMedia(fixture('valid-02'), []), { passed: true, errors: [] });
  assert.deepEqual(approvalRow().job_id, fixture('valid-01').job_id);
  assert.equal(fixture('valid-01').exceptions[0].approval_id, APPROVAL);
});

test('a clinical subject is refused in images[], whatever else is true', () => {
  assert.deepEqual(CLINICAL_SUBJECTS, ['patient', 'before_after', 'exam']);
  for (const subject of CLINICAL_SUBJECTS) {
    const result = check(withImage({ subject }));
    assert.deepEqual(reasons(result), [['images', 0, 'assunto_clinico']], subject);
    assert.equal(result.errors[0].ref, 'img://job-0001/0');
    assert.equal(result.passed, false);
  }
});

test('a clinical subject is refused in exceptions[] even with a genuine approval that names it', () => {
  // The database cannot hold such an approval (CHECK on subject); a forged row would still be refused.
  for (const subject of CLINICAL_SUBJECTS) {
    const { result } = withException({ subject }, [approvalRow({ subject })]);
    assert.deepEqual(reasons(result), [['exceptions', 0, 'assunto_clinico']], subject);
  }
});

test('an unknown subject, or any value that is not one of the two approvable ones, is refused (fail closed)', () => {
  assert.deepEqual(APPROVABLE_SUBJECTS, ['none', 'person_not_patient']);
  for (const subject of ['unknown', '', 'Patient', 'patient ', 'selfie', 'none ']) {
    assert.deepEqual(reasons(check(withImage({ subject }))), [['images', 0, 'assunto_desconhecido']], JSON.stringify(subject));
  }
  for (const subject of ['none', 'person_not_patient']) assert.equal(check(withImage({ subject })).passed, true, subject);
});

test('layer (b) also holds if the schema was skipped: a provenance in the wrong list is refused', () => {
  const owned = check(withImage({ provenance: 'owned_photo' }));
  assert.deepEqual(reasons(owned), [['images', 0, 'proveniencia_nao_permitida']]);
  for (const provenance of ['patient_upload', '', 'Stock_Licensed']) {
    assert.deepEqual(reasons(check(withImage({ provenance }))), [['images', 0, 'proveniencia_nao_permitida']], provenance);
  }
  for (const provenance of ['generated_illustration', 'stock_licensed']) {
    const { result } = withException({ provenance, seal: 'applied' });
    assert.deepEqual(reasons(result), [['exceptions', 0, 'proveniencia_nao_permitida']], provenance);
  }
});

test('a generated illustration needs the seal; stock needs none', () => {
  assert.deepEqual(reasons(check(withImage({ seal: 'not_applicable' }))), [['images', 0, 'selo_ausente']]);
  assert.deepEqual(reasons(check(withImage({ seal: 'applied' }))), []);
  assert.deepEqual(reasons(check(withImage({ provenance: 'stock_licensed', seal: 'not_applicable' }))), []);
  assert.deepEqual(reasons(check(withImage({ provenance: 'stock_licensed', seal: 'applied' }))), []);
});

test('a blank credit or a blank alt text passes the schema length and not this validator', () => {
  assert.deepEqual(schemaPaths(withImage({ attribution: '   ' })), []);
  assert.deepEqual(reasons(check(withImage({ attribution: '   ' }))), [['images', 0, 'atribuicao_vazia']]);
  assert.deepEqual(reasons(check(withImage({ attribution: ' \t' }))), [['images', 0, 'atribuicao_vazia']]);
  assert.deepEqual(reasons(check(withImage({ attribution: ' x ' }))), []);
  assert.deepEqual(schemaPaths(withImage({ alt_text: ' '.repeat(10) })), []);
  assert.deepEqual(reasons(check(withImage({ alt_text: ' '.repeat(10) }))), [['images', 0, 'alt_text_vazio']]);
  assert.deepEqual(reasons(check(withImage({ alt_text: `  ${'x'.repeat(9)}  ` }))), [['images', 0, 'alt_text_vazio']]);
  assert.deepEqual(reasons(check(withImage({ alt_text: `  ${'x'.repeat(10)}  ` }))), []);
});

test('a ref used twice is refused on the second use, across both lists', () => {
  const twice = valid();
  twice.images.push({ ...twice.images[1], ref: twice.images[0].ref });
  assert.deepEqual(reasons(check(twice)), [['images', 2, 'ref_duplicado']]);
  const across = valid();
  across.images[0].ref = across.exceptions[0].ref;
  assert.deepEqual(reasons(check(across)), [['exceptions', 0, 'ref_duplicado']]);
});

test('an exception needs an approval record that names this job, this image and this subject', () => {
  assert.deepEqual(reasons(withException({}).result), []);
  // No row at all, or the id is not in the rows.
  assert.deepEqual(reasons(withException({}, []).result), [['exceptions', 0, 'aprovacao_inexistente']]);
  assert.deepEqual(reasons(withException({ approval_id: '00000000-0000-4000-8000-0000000000b2' }).result), [['exceptions', 0, 'aprovacao_inexistente']]);
  assert.deepEqual(reasons(withException({ approval_id: undefined }).result), [['exceptions', 0, 'aprovacao_inexistente']]);
  assert.deepEqual(reasons(withException({ approval_id: 7 }).result), [['exceptions', 0, 'aprovacao_inexistente']]);
  // A genuine approval of another job, of another image, with another subject.
  assert.deepEqual(reasons(withException({}, [approvalRow({ job_id: '00000000-0000-4000-8000-000000000002' })]).result), [['exceptions', 0, 'aprovacao_de_outro_job']]);
  assert.deepEqual(reasons(withException({}, [approvalRow({ ref: 'img://job-0001/3' })]).result), [['exceptions', 0, 'aprovacao_de_outra_imagem']]);
  assert.deepEqual(reasons(withException({}, [approvalRow({ subject: 'person_not_patient' })]).result), [['exceptions', 0, 'assunto_divergente']]);
  assert.deepEqual(reasons(withException({ subject: 'person_not_patient' }).result), [['exceptions', 0, 'assunto_divergente']]);
});

test('every mismatch of one approval is reported, in a fixed order', () => {
  const row = approvalRow({ job_id: '00000000-0000-4000-8000-000000000002', ref: 'img://job-0001/9', subject: 'person_not_patient' });
  assert.deepEqual(reasons(withException({}, [row]).result), [
    ['exceptions', 0, 'aprovacao_de_outro_job'], ['exceptions', 0, 'aprovacao_de_outra_imagem'], ['exceptions', 0, 'assunto_divergente'],
  ]);
});

test('the approval is found by id among several rows, and a row with another id is not enough', () => {
  const rows = [approvalRow({ id: '00000000-0000-4000-8000-0000000000b1', ref: 'img://job-0001/7' }), approvalRow(), approvalRow({ id: '00000000-0000-4000-8000-0000000000b3' })];
  assert.deepEqual(reasons(withException({}, rows).result), []);
  assert.deepEqual(reasons(withException({}, [rows[0], rows[2]]).result), [['exceptions', 0, 'aprovacao_inexistente']]);
});

test('the errors say where: list, index and ref, ordered by list and position', () => {
  const data = valid();
  data.images[0].subject = 'exam';
  data.images[1].seal = 'not_applicable';
  data.images[1].attribution = ' ';
  data.exceptions[0].subject = 'patient';
  const result = check(data, [approvalRow({ subject: 'patient' })]);
  assert.deepEqual(result.errors, [
    { list: 'images', index: 0, ref: 'img://job-0001/0', reason: 'assunto_clinico' },
    { list: 'images', index: 1, ref: 'img://job-0001/1', reason: 'atribuicao_vazia' },
    { list: 'exceptions', index: 0, ref: 'img://job-0001/2', reason: 'assunto_clinico' },
  ]);
});

test('missing or malformed input is a TypeError that names the problem, never a quiet pass', () => {
  const ok = valid();
  const bad = (assets, approvals, pattern) => assert.throws(() => checkMedia(assets, approvals), (e) => e instanceof TypeError && pattern.test(e.message));
  bad(ok, undefined, /approvals must be an array/);
  bad(ok, null, /approvals must be an array/);
  bad(ok, {}, /approvals must be an array/);
  bad(null, [], /assets must be an object/);
  bad([], [], /assets must be an object/);
  bad({ ...ok, job_id: 7 }, [], /assets\.job_id must be a string/);
  bad({ ...ok, images: undefined }, [], /assets\.images must be an array/);
  bad({ ...ok, exceptions: 'x' }, [], /assets\.exceptions must be an array/);
  bad({ ...ok, images: [null] }, [], /assets\.images\[0\] must be an object/);
  bad({ ...ok, images: [{ ...ok.images[0], subject: 5 }] }, [], /assets\.images\[0\]\.subject must be a string/);
  bad({ ...ok, images: [{ ...ok.images[0], alt_text: undefined }] }, [], /assets\.images\[0\]\.alt_text must be a string/);
  bad({ ...ok, exceptions: [[]] }, [], /assets\.exceptions\[0\] must be an object/);
  bad({ ...ok, exceptions: [{ ...ok.exceptions[0], subject: 5 }] }, [], /assets\.exceptions\[0\]\.subject must be a string/);
  bad(ok, [null], /approvals\[0\] must be an object/);
  bad(ok, [{ ...approvalRow(), subject: undefined }], /approvals\[0\]\.subject must be a string/);
  bad(ok, [{ ...approvalRow(), id: 7 }], /approvals\[0\]\.id must be a string/);
  bad(ok, [approvalRow(), { ...approvalRow(), job_id: null }], /approvals\[1\]\.job_id must be a string/);
});

test('the validator does not mutate its input', () => {
  const assets = valid();
  const approvals = [approvalRow()];
  const before = JSON.stringify([assets, approvals]);
  check(assets, approvals);
  check({ ...assets, images: [{ ...assets.images[0], subject: 'patient' }] }, approvals);
  assert.equal(JSON.stringify([assets, approvals]), before);
});

test('a "human_approved" flag in the payload buys nothing: there is no such field to read', () => {
  const { result } = withException({ subject: 'patient', human_approved: true, justification: 'Foto do paciente autorizada pelo próprio.' }, []);
  assert.deepEqual(reasons(result), [['exceptions', 0, 'assunto_clinico'], ['exceptions', 0, 'aprovacao_inexistente']]);
});

test('media.js is dependency-free (n8n Cloud Code node): no require, no import, no I/O', () => {
  const source = readFileSync(join(__dirname, 'media.js'), 'utf8');
  assert.equal(/\brequire\s*\(/.test(source), false);
  assert.equal(/\bimport\b/.test(source.replace(/\/\/.*$/gm, '')), false);
  assert.equal(/\b(fs|process|fetch|eval|Function)\b/.test(source.replace(/\/\/.*$/gm, '')), false);
});

test('the fixtures are synthetic and in NFC', () => {
  for (const name of ['valid-01', 'valid-02', 'invalid-01-owned_photo-in-images', 'invalid-02-exception-without-approval_id']) {
    const text = readFileSync(join(ROOT, 'fixtures', 'synthetic', 'contracts', 'image_assets', `${name}.json`), 'utf8');
    assert.equal(text, text.normalize('NFC'), name);
    assert.match(text, /"job_id": "00000000-0000-4000-8000-0000000000\d\d"/, name);
  }
});
