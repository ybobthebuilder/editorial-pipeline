'use strict';

// Business validator for the image_assets contract (layer (b) of the clinical-media block,
// decisions D-15 and U24, and the decision of 2026-10-22 that a human approval is a database record,
// not a flag in the payload). Pure JS, no dependencies (n8n Cloud compatible). It runs after
// contracts/image_assets.schema.json, which is layer (a): the schema keeps owned_photo out of images[].
//
// Inputs:
//   assets     the image_assets document, already valid against the schema
//   approvals  the rows of editorial.get_image_approvals(job_id): { id, job_id, ref, subject, ... }
//              Always an array; [] when the job has none. A missing array is a TypeError, never "no
//              approvals": the caller must have asked the database.
//
// What it refuses, and why it is code and not schema:
//   - a clinical subject (patient, before_after, exam) in any list, whatever the approval says;
//   - an unknown subject, and any subject that is not one of the two the database can approve;
//   - an owned_photo without a human approval record that names this job, this image and this subject;
//   - a generated illustration without the seal; a blank credit; a blank alt text; a repeated ref.
//
// Limits, on purpose: this code only sees what the producer declares. A clinical photo declared as
// "none" passes. The second declaration of the subject is the human's, in the approval record, and a
// disagreement between the two is refused (assunto_divergente); the first declaration is still the
// producer's. No pixel is inspected.

const CLINICAL_SUBJECTS = ['patient', 'before_after', 'exam'];
const APPROVABLE_SUBJECTS = ['none', 'person_not_patient'];
const IMAGE_PROVENANCES = ['generated_illustration', 'stock_licensed'];
const EXCEPTION_PROVENANCE = 'owned_photo';
const ALT_TEXT_MIN = 10;

function assertObject(value, what) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${what} must be an object`);
}

function assertString(value, what) {
  if (typeof value !== 'string') throw new TypeError(`${what} must be a string`);
}

function assertItem(item, where) {
  assertObject(item, where);
  for (const key of ['ref', 'provenance', 'subject', 'attribution', 'seal', 'alt_text']) assertString(item[key], `${where}.${key}`);
}

function assertApproval(row, where) {
  assertObject(row, where);
  for (const key of ['id', 'job_id', 'ref', 'subject']) assertString(row[key], `${where}.${key}`);
}

// Returns { passed, errors }; each error is { list, index, ref, reason }:
//   list     'images' or 'exceptions'
//   reasons  proveniencia_nao_permitida, assunto_clinico, assunto_desconhecido, selo_ausente,
//            atribuicao_vazia, alt_text_vazio, ref_duplicado, aprovacao_inexistente,
//            aprovacao_de_outro_job, aprovacao_de_outra_imagem, assunto_divergente
// One image can raise several reasons; the order is fixed: by list (images, then exceptions), by
// position, then by the order above.
function checkMedia(assets, approvals) {
  assertObject(assets, 'assets');
  assertString(assets.job_id, 'assets.job_id');
  if (!Array.isArray(assets.images)) throw new TypeError('assets.images must be an array');
  if (!Array.isArray(assets.exceptions)) throw new TypeError('assets.exceptions must be an array');
  if (!Array.isArray(approvals)) throw new TypeError('approvals must be an array (the rows of get_image_approvals)');
  approvals.forEach((row, i) => assertApproval(row, `approvals[${i}]`));

  const errors = [];
  const seen = new Set();
  const add = (list, index, item, reason) => errors.push({ list, index, ref: item.ref, reason });

  const common = (list, index, item) => {
    if (CLINICAL_SUBJECTS.includes(item.subject)) add(list, index, item, 'assunto_clinico');
    else if (!APPROVABLE_SUBJECTS.includes(item.subject)) add(list, index, item, 'assunto_desconhecido');
    if (item.provenance === 'generated_illustration' && item.seal !== 'applied') add(list, index, item, 'selo_ausente');
    if (item.attribution.trim().length === 0) add(list, index, item, 'atribuicao_vazia');
    if (item.alt_text.trim().length < ALT_TEXT_MIN) add(list, index, item, 'alt_text_vazio');
    if (seen.has(item.ref)) add(list, index, item, 'ref_duplicado');
    seen.add(item.ref);
  };

  assets.images.forEach((item, index) => {
    assertItem(item, `assets.images[${index}]`);
    if (!IMAGE_PROVENANCES.includes(item.provenance)) add('images', index, item, 'proveniencia_nao_permitida');
    common('images', index, item);
  });

  assets.exceptions.forEach((item, index) => {
    assertItem(item, `assets.exceptions[${index}]`);
    if (item.provenance !== EXCEPTION_PROVENANCE) add('exceptions', index, item, 'proveniencia_nao_permitida');
    common('exceptions', index, item);
    const row = typeof item.approval_id === 'string' ? approvals.find((a) => a.id === item.approval_id) : undefined;
    if (row === undefined) {
      add('exceptions', index, item, 'aprovacao_inexistente');
      return;
    }
    if (row.job_id !== assets.job_id) add('exceptions', index, item, 'aprovacao_de_outro_job');
    if (row.ref !== item.ref) add('exceptions', index, item, 'aprovacao_de_outra_imagem');
    if (row.subject !== item.subject) add('exceptions', index, item, 'assunto_divergente');
  });

  return { passed: errors.length === 0, errors };
}

module.exports = { checkMedia, CLINICAL_SUBJECTS, APPROVABLE_SUBJECTS };
