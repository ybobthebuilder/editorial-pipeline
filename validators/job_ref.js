'use strict';

// Code side of contracts/job_ref.schema.json (stage 01_INGEST). The schema checks the shape of the row;
// this file checks what the schema cannot say. Pure JS with no require, no clock and no file access.
//
// checkJobRef(jobId, rows, pages, imageAssets)
//   jobId        the id of the job being ingested
//   rows         the job_ref rows found for that job, each already valid against the schema
//   pages        the text of the file, one string per PDF page, in file order: pages[0] is the first
//                page of the file (the list that validators/citation.js receives)
//   imageAssets  optional: the image_assets rows found for that job (contracts/image_assets.schema.json)
// Returns { passed, errors }; each error is { reason }. Reasons:
//   job_ref_ausente         no row for the job
//   job_ref_repetido        more than one row for the job (one row per job)
//   job_divergente          a row whose job_id is not the job being ingested
//   paginas_divergentes     page_count is not the number of stored page texts
//   image_assets_de_outro_job   an image_assets row that belongs to another job
// The result never carries the text of a page.
//
// Limits, on purpose: that the job_id exists in editorial.jobs is the database's (a foreign key and
// get_job); file_sha256 is a format here, whether it is the hash of the file is the stage's, which holds
// the bytes; page_count counts the pages of the FILE. The number printed on a page is another matter and
// is not in this contract (see the printed-numbering question in the PR).

function assertObject(value, what) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${what} must be an object`);
}

function assertArray(value, what) {
  if (!Array.isArray(value)) throw new TypeError(`${what} must be an array`);
}

function checkJobRef(jobId, rows, pages, imageAssets = []) {
  if (typeof jobId !== 'string') throw new TypeError('jobId must be a string');
  assertArray(rows, 'rows');
  assertArray(pages, 'pages');
  assertArray(imageAssets, 'imageAssets');
  rows.forEach((r, i) => {
    assertObject(r, `rows[${i}]`);
    if (typeof r.job_id !== 'string') throw new TypeError(`rows[${i}].job_id must be a string`);
  });
  pages.forEach((p, i) => {
    if (typeof p !== 'string') throw new TypeError(`pages[${i}] must be a string`);
  });
  imageAssets.forEach((r, i) => {
    assertObject(r, `imageAssets[${i}]`);
    if (typeof r.job_id !== 'string') throw new TypeError(`imageAssets[${i}].job_id must be a string`);
  });

  const errors = [];
  const add = (reason) => errors.push({ reason });

  if (rows.length === 0) add('job_ref_ausente');
  if (rows.length > 1) add('job_ref_repetido');
  if (rows.some((r) => r.job_id !== jobId)) add('job_divergente');
  for (const row of rows) {
    if (row.job_id === jobId && row.page_count !== pages.length) {
      add('paginas_divergentes');
      break;
    }
  }
  if (imageAssets.some((r) => r.job_id !== jobId)) add('image_assets_de_outro_job');

  return { passed: errors.length === 0, errors };
}

module.exports = { checkJobRef };
