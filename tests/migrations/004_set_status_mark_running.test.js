'use strict';

// Migration 004 tests: set_status and mark_running, the only write path of n8n_pipeline into jobs.
// Run with --test-concurrency=1 (see _harness.js).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const h = require('./_harness');

const { id, ok, fails } = h;
const N8N = { role: 'n8n_pipeline' };
let db;

const seed = (n, status, extra = '') => `INSERT INTO editorial.jobs
  (id, status, source_origin, input_context, config_source, config_version${extra ? ', ' + extra.cols : ''})
  VALUES ('${id(n)}', '${status}', 'teste sintético', '{}', 'public', 'v-teste'${extra ? ', ' + extra.vals : ''});`;
const setStatus = (n, to) => `SELECT editorial.set_status('${id(n)}', '${to}');`;
const running = (n, stage, exec) => `SELECT editorial.mark_running('${id(n)}', '${stage}', '${exec}');`;
const row = (n, cols) => ok(db, `SELECT ${cols} FROM editorial.jobs WHERE id = '${id(n)}';`);
const lines = (out) => out.split('\n').filter(Boolean);

before(() => {
  db = h.createDatabase('004');
});

after(() => {
  h.dropDatabase(db, ['plain_role_004']);
});

test('set_status moves the job through the guard and records the previous state and the time', () => {
  ok(db, seed(1, 'RECEIVED', { cols: 'updated_at, status_entered_at', vals: `'2000-01-01', '2000-01-01'` }));
  ok(db, setStatus(1, 'PDF_PARSED'), N8N);
  assert.equal(row(1, `status, previous_status, attempt_count, updated_at > '2000-01-02', status_entered_at > '2000-01-02'`),
    'PDF_PARSED|RECEIVED|0|t|t');
});

test('set_status refuses an invalid transition, an unknown job, and leaves the job untouched', () => {
  ok(db, seed(2, 'RECEIVED'));
  fails(db, setStatus(2, 'PUBLISHED'), /transição inválida/, N8N);
  fails(db, setStatus(2, 'RECEIVED'), /transição inválida/, N8N);
  fails(db, setStatus(99, 'PDF_PARSED'), /job inexistente/, N8N);
  assert.equal(row(2, 'status, previous_status IS NULL'), 'RECEIVED|t');
});

test('set_status carries the human gate: it needs a fresh approved signature', () => {
  ok(db, seed(3, 'AWAITING_APPROVAL'));
  fails(db, setStatus(3, 'HUMAN_APPROVED'), /exige aprovação humana registrada/, N8N);
  assert.equal(row(3, 'status'), 'AWAITING_APPROVAL');
  ok(db, `INSERT INTO editorial.signatures (job_id, reviewer_name, crm_uf, decision)
    VALUES ('${id(3)}', 'revisor sintético', 'SP', 'approved');`, { role: 'human_reviewer' });
  ok(db, setStatus(3, 'HUMAN_APPROVED'), N8N);
  assert.equal(row(3, 'status, previous_status'), 'HUMAN_APPROVED|AWAITING_APPROVAL');
});

test('n8n_pipeline has no direct write on jobs, and a shadowing temp table does not hijack the functions', () => {
  ok(db, seed(4, 'RECEIVED'));
  fails(db, `UPDATE editorial.jobs SET status = 'PDF_PARSED' WHERE id = '${id(4)}';`, /permission denied/, N8N);
  ok(db, `CREATE TEMP TABLE jobs (id uuid, status text, attempt_count integer);
    INSERT INTO jobs VALUES ('${id(4)}', 'RECEIVED', 0);
    ${setStatus(4, 'PDF_PARSED')}`, N8N);
  assert.equal(row(4, 'status'), 'PDF_PARSED');
});

test('mark_running counts attempts, records the stage and the execution, and the database does not cap them', () => {
  ok(db, seed(5, 'COVERS_RENDERED'));
  const out = ok(db, [
    running(5, '09_QA', 'e1'), setStatus(5, 'QA_FAILED'), setStatus(5, 'COVERS_RENDERED'),
    running(5, '09_QA', 'e2'), setStatus(5, 'QA_FAILED'), setStatus(5, 'COVERS_RENDERED'),
    running(5, '09_QA', 'e3'), running(5, '09_QA', 'e4'),
  ].join('\n'), N8N);
  assert.deepEqual(lines(out), ['1', '2', '3', '4']);
  assert.equal(row(5, 'attempt_count, last_stage, last_execution_id, status'), '4|09_QA|e4|COVERS_RENDERED');
});

test('moving forward resets attempt_count to zero', () => {
  ok(db, seed(6, 'COVERS_RENDERED'));
  ok(db, `${running(6, '09_QA', 'e1')}\n${running(6, '09_QA', 'e2')}`, N8N);
  assert.equal(row(6, 'attempt_count'), '2');
  ok(db, setStatus(6, 'QA_PASSED'), N8N);
  assert.equal(row(6, 'attempt_count'), '0');
});

test('attempt_count survives a failure and a human decision resets it', () => {
  ok(db, seed(7, 'COVERS_RENDERED'));
  ok(db, `${running(7, '09_QA', 'e1')}\n${setStatus(7, 'QA_FAILED')}\n${setStatus(7, 'NEEDS_REVIEW')}`, N8N);
  assert.equal(row(7, 'status, previous_status, attempt_count'), 'NEEDS_REVIEW|QA_FAILED|1');
  ok(db, setStatus(7, 'COVERS_RENDERED'), N8N); // the AI redoes from where the stage started
  assert.equal(row(7, 'status, attempt_count'), 'COVERS_RENDERED|0');
});

test('mark_running refuses a job in an error state, NEEDS_REVIEW or PUBLISHED', () => {
  const states = ['VERIFICATION_FAILED', 'RENDER_FAILED', 'QA_FAILED', 'NEEDS_REVIEW', 'PUBLISHED'];
  states.forEach((s, i) => ok(db, seed(10 + i, s)));
  states.forEach((s, i) => fails(db, running(10 + i, '09_QA', 'e1'), /não pode executar etapa/, N8N));
  assert.equal(row(10, 'attempt_count'), '0');
});

test('mark_running refuses a malformed stage, an empty execution id and an unknown job', () => {
  ok(db, seed(20, 'RECEIVED'));
  for (const stage of ['x', '9_QA', '09_qa', '09-QA', '']) {
    fails(db, running(20, stage, 'e1'), /etapa inválida/, N8N);
  }
  fails(db, running(20, '01_INGEST', '  '), /execution_id é obrigatório/, N8N);
  fails(db, running(99, '01_INGEST', 'e1'), /job inexistente/, N8N);
  assert.equal(row(20, 'attempt_count, last_stage IS NULL'), '0|t');
});

test('both functions are SECURITY DEFINER with a fixed search_path', () => {
  for (const fn of ['editorial.set_status(uuid,text)', 'editorial.mark_running(uuid,text,text)']) {
    const out = ok(db, `SELECT prosecdef, proconfig::text FROM pg_proc WHERE oid = '${fn}'::regprocedure;`);
    assert.match(out, /^t\|/, fn);
    assert.match(out, /search_path=pg_catalog, editorial, pg_temp/, fn);
  }
});

test('only n8n_pipeline can execute them', () => {
  ok('postgres', `CREATE ROLE plain_role_004 NOLOGIN;`);
  for (const role of ['plain_role_004', 'human_reviewer']) {
    fails(db, setStatus(1, 'EVIDENCE_EXTRACTED'), /permission denied/, { role });
    fails(db, running(1, '01_INGEST', 'e1'), /permission denied/, { role });
  }
  for (const role of h.SUPABASE_ROLES) {
    assert.equal(ok(db, `SELECT has_function_privilege('${role}', 'editorial.set_status(uuid,text)', 'EXECUTE'),
      has_function_privilege('${role}', 'editorial.mark_running(uuid,text,text)', 'EXECUTE');`), 'f|f', role);
  }
});

test('two concurrent set_status calls on the same job: one wins, the other sees the new state and fails', async () => {
  ok(db, seed(30, 'RECEIVED'));
  const run = (sql, delayMs = 0) => new Promise((resolve) => {
    setTimeout(() => {
      const p = spawn('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', db, '-f', '-']);
      let stderr = '';
      p.stderr.on('data', (d) => { stderr += d; });
      p.on('close', (status) => resolve({ status, stderr }));
      p.stdin.end(`SET ROLE n8n_pipeline;\n${sql}`);
    }, delayMs);
  });
  const [first, second] = await Promise.all([
    run(`BEGIN;\n${setStatus(30, 'PDF_PARSED')}\nSELECT pg_sleep(1.5);\nCOMMIT;`),
    run(setStatus(30, 'PDF_PARSED'), 500),
  ]);
  assert.equal(first.status, 0, first.stderr);
  assert.notEqual(second.status, 0, 'a segunda chamada deveria ter falhado');
  assert.match(second.stderr, /transição inválida: PDF_PARSED -> PDF_PARSED/);
  assert.equal(row(30, 'status, previous_status'), 'PDF_PARSED|RECEIVED');
});

test('a job runs the whole pipeline through mark_running and set_status, with a new signature for a new review', () => {
  ok(db, seed(40, 'RECEIVED'));
  const stages = [
    ['01_INGEST', 'PDF_PARSED'], ['02_EXTRACT', 'EVIDENCE_EXTRACTED'], ['03_VERIFY', 'EVIDENCE_VERIFIED'],
    ['04_INSIGHTS', 'INSIGHTS_GENERATED'], ['05_SCORE', 'INSIGHTS_RANKED'], ['06_VISUAL', 'VISUAL_PLANNED'],
    ['07_COVERS', 'COVERS_SPECIFIED'], ['08_RENDER', 'COVERS_RENDERED'], ['09_QA', 'QA_PASSED'],
    ['10_APPROVAL', 'AWAITING_APPROVAL'],
  ];
  ok(db, stages.map(([stage, next], i) => `${running(40, stage, `exec-${i}`)}\n${setStatus(40, next)}`).join('\n'), N8N);
  assert.equal(row(40, 'status, attempt_count, last_stage'), 'AWAITING_APPROVAL|0|10_APPROVAL');

  const sign = `INSERT INTO editorial.signatures (job_id, reviewer_name, crm_uf, decision)
    VALUES ('${id(40)}', 'revisor sintético', 'SP', 'approved');`;
  ok(db, sign, { role: 'human_reviewer' });
  ok(db, `${setStatus(40, 'HUMAN_APPROVED')}\n${setStatus(40, 'PUBLISHED')}\n${setStatus(40, 'NEEDS_REVIEW')}\n${setStatus(40, 'AWAITING_APPROVAL')}`, N8N);
  fails(db, setStatus(40, 'HUMAN_APPROVED'), /exige aprovação humana registrada/, N8N); // the old approval is stale
  ok(db, sign, { role: 'human_reviewer' });
  ok(db, setStatus(40, 'HUMAN_APPROVED'), N8N);
  assert.equal(row(40, 'status'), 'HUMAN_APPROVED');
});
