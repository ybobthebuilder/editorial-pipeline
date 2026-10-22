-- 003_review_exit_provenance_attempts.sql
--
-- Depende de 001 e 002. Schema público `editorial`.
-- Decisões de 2026-10-22 (docs/visual-layer/schema-contract.md, §13):
--   U11-l  NEEDS_REVIEW sai para AWAITING_APPROVAL (humano revisa de novo) ou para o estado
--          de trabalho anterior (a IA refaz).
--   U11-m  papel human_reviewer grava assinaturas. approved e rejected confirmados.
--   U11-n  jobs ganha as colunas de proveniência de CLAUDE.md §7.
--   U11-o  jobs.attempt_count registra as tentativas. O limite de 3 é do código, não do banco.
--
-- Padrão expand-contract em jobs: ADD COLUMN nulo -> backfill -> constraints NOT VALID ->
-- VALIDATE -> SET NOT NULL. Sem reescrever a tabela e sem bloquear escrita por varredura longa.
--
-- Regras do guard que são escolha minha, não decisão (a confirmar; cada uma é uma condição):
--   - NEEDS_REVIEW -> AWAITING_APPROVAL só se o job já tinha chegado a QA_PASSED ou além.
--     Sem isso, um job parado em RECEIVED poderia pular direto para o gate.
--   - NEEDS_REVIEW -> estado de trabalho só volta ao estado de onde o job saiu. Depois do
--     gate (HUMAN_APPROVED, PUBLISHED) a IA não refaz: só volta para AWAITING_APPROVAL.
--   - A assinatura só vale se foi gravada depois de o job entrar no estado atual
--     (jobs.status_entered_at). Sem isso, uma aprovação antiga liberaria uma nova revisão.
--
-- Fora desta migration: set_status e mark_running (004) e índices (005).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'human_reviewer') THEN
    -- Sem LOGIN: a credencial é criada fora do repositório. n8n_pipeline NÃO é membro deste papel.
    CREATE ROLE human_reviewer NOLOGIN;
  END IF;
END
$$;

-- EXPAND ---------------------------------------------------------------------------------
-- Proveniência (CLAUDE.md §7): job_id = id. source_origin, input_context, config_source e
-- config_version são exigidos na criação. last_stage e last_execution_id são gravados por
-- mark_running. `model` não entra: é por chamada de LLM, não por job.
ALTER TABLE editorial.jobs
  ADD COLUMN source_origin     text,
  ADD COLUMN input_context     jsonb,
  ADD COLUMN config_source     text,
  ADD COLUMN config_version    text,
  ADD COLUMN last_stage        text,
  ADD COLUMN last_execution_id text,
  ADD COLUMN attempt_count     integer     NOT NULL DEFAULT 0,
  ADD COLUMN previous_status   text,
  ADD COLUMN status_entered_at timestamptz NOT NULL DEFAULT now();

-- BACKFILL: linhas anteriores recebem 'not_reported' (CLAUDE.md §8), nunca um valor inventado.
UPDATE editorial.jobs
   SET source_origin     = 'not_reported',
       input_context     = '{}'::jsonb,
       config_source     = 'public',
       config_version    = 'not_reported',
       status_entered_at = updated_at
 WHERE source_origin IS NULL;

-- CONTRACT -------------------------------------------------------------------------------
ALTER TABLE editorial.jobs
  ADD CONSTRAINT jobs_source_origin_nn CHECK (source_origin IS NOT NULL) NOT VALID,
  ADD CONSTRAINT jobs_input_context_nn CHECK (input_context IS NOT NULL) NOT VALID,
  ADD CONSTRAINT jobs_config_source_nn CHECK (config_source IS NOT NULL) NOT VALID,
  ADD CONSTRAINT jobs_config_version_nn CHECK (config_version IS NOT NULL) NOT VALID,
  ADD CONSTRAINT jobs_source_origin_nonblank CHECK (length(btrim(source_origin)) > 0) NOT VALID,
  ADD CONSTRAINT jobs_input_context_object CHECK (jsonb_typeof(input_context) = 'object') NOT VALID,
  ADD CONSTRAINT jobs_config_source_known CHECK (config_source IN ('public', 'private')) NOT VALID,
  ADD CONSTRAINT jobs_config_version_nonblank CHECK (length(btrim(config_version)) > 0) NOT VALID,
  ADD CONSTRAINT jobs_last_stage_format CHECK (last_stage ~ '^[0-9]{2}_[A-Z0-9_]+$') NOT VALID,
  ADD CONSTRAINT jobs_last_execution_id_nonblank CHECK (length(btrim(last_execution_id)) > 0) NOT VALID,
  ADD CONSTRAINT jobs_attempt_count_nonneg CHECK (attempt_count >= 0) NOT VALID,
  ADD CONSTRAINT jobs_previous_status_known
    CHECK (previous_status IN (
      'RECEIVED', 'PDF_PARSED', 'EVIDENCE_EXTRACTED', 'EVIDENCE_VERIFIED',
      'INSIGHTS_GENERATED', 'INSIGHTS_RANKED', 'VISUAL_PLANNED', 'COVERS_SPECIFIED',
      'COVERS_RENDERED', 'QA_PASSED', 'AWAITING_APPROVAL', 'HUMAN_APPROVED', 'PUBLISHED',
      'VERIFICATION_FAILED', 'QA_FAILED', 'RENDER_FAILED', 'NEEDS_REVIEW')) NOT VALID;

ALTER TABLE editorial.jobs
  VALIDATE CONSTRAINT jobs_source_origin_nn,
  VALIDATE CONSTRAINT jobs_input_context_nn,
  VALIDATE CONSTRAINT jobs_config_source_nn,
  VALIDATE CONSTRAINT jobs_config_version_nn,
  VALIDATE CONSTRAINT jobs_source_origin_nonblank,
  VALIDATE CONSTRAINT jobs_input_context_object,
  VALIDATE CONSTRAINT jobs_config_source_known,
  VALIDATE CONSTRAINT jobs_config_version_nonblank,
  VALIDATE CONSTRAINT jobs_last_stage_format,
  VALIDATE CONSTRAINT jobs_last_execution_id_nonblank,
  VALIDATE CONSTRAINT jobs_attempt_count_nonneg,
  VALIDATE CONSTRAINT jobs_previous_status_known;

-- Com a CHECK validada, SET NOT NULL não varre a tabela. As CHECKs temporárias saem depois.
ALTER TABLE editorial.jobs
  ALTER COLUMN source_origin  SET NOT NULL,
  ALTER COLUMN input_context  SET NOT NULL,
  ALTER COLUMN config_source  SET NOT NULL,
  ALTER COLUMN config_version SET NOT NULL;

ALTER TABLE editorial.jobs
  DROP CONSTRAINT jobs_source_origin_nn,
  DROP CONSTRAINT jobs_input_context_nn,
  DROP CONSTRAINT jobs_config_source_nn,
  DROP CONSTRAINT jobs_config_version_nn;

-- U11-l. Saídas de NEEDS_REVIEW: 10 estados de trabalho (RECEIVED a QA_PASSED) e o gate.
-- Quais destinos valem para cada job é decidido pelo guard, a partir de jobs.previous_status.
INSERT INTO editorial.state_transitions (from_status, to_status, is_error_path, requires_gate) VALUES
  ('NEEDS_REVIEW', 'RECEIVED',           false, false),
  ('NEEDS_REVIEW', 'PDF_PARSED',         false, false),
  ('NEEDS_REVIEW', 'EVIDENCE_EXTRACTED', false, false),
  ('NEEDS_REVIEW', 'EVIDENCE_VERIFIED',  false, false),
  ('NEEDS_REVIEW', 'INSIGHTS_GENERATED', false, false),
  ('NEEDS_REVIEW', 'INSIGHTS_RANKED',    false, false),
  ('NEEDS_REVIEW', 'VISUAL_PLANNED',     false, false),
  ('NEEDS_REVIEW', 'COVERS_SPECIFIED',   false, false),
  ('NEEDS_REVIEW', 'COVERS_RENDERED',    false, false),
  ('NEEDS_REVIEW', 'QA_PASSED',          false, false),
  ('NEEDS_REVIEW', 'AWAITING_APPROVAL',  false, false);

-- guard_transition: SECURITY DEFINER com search_path fixo (pg_temp por último). A assinatura
-- não muda, então CREATE OR REPLACE preserva o ACL de 002.
CREATE OR REPLACE FUNCTION editorial.guard_transition(p_job_id uuid, p_from text, p_to text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, editorial, pg_temp
AS $$
DECLARE
  v_requires_gate boolean;
  v_job           editorial.jobs%ROWTYPE;
  v_resume        text;
BEGIN
  SELECT t.requires_gate
    INTO v_requires_gate
    FROM editorial.state_transitions t
   WHERE t.from_status = p_from
     AND t.to_status = p_to;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transição inválida: % -> %', p_from, p_to
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT j.*
    INTO v_job
    FROM editorial.jobs j
   WHERE j.id = p_job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'job inexistente: %', p_job_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_job.status <> p_from THEN
    RAISE EXCEPTION 'job % está em %, não em %', p_job_id, v_job.status, p_from
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_from = 'NEEDS_REVIEW' THEN
    -- Estado de trabalho de onde o job saiu. Se saiu de um estado de erro, é o estado de
    -- onde a etapa que falhou partiu (única saída que não é de erro, 002).
    v_resume := v_job.previous_status;
    IF v_resume IN ('VERIFICATION_FAILED', 'RENDER_FAILED', 'QA_FAILED') THEN
      SELECT t.to_status
        INTO v_resume
        FROM editorial.state_transitions t
       WHERE t.from_status = v_job.previous_status
         AND NOT t.is_error_path;
    END IF;
    IF v_resume IS NULL THEN
      RAISE EXCEPTION 'job % em NEEDS_REVIEW sem estado anterior registrado', p_job_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_to = 'AWAITING_APPROVAL' THEN
      IF v_resume NOT IN ('QA_PASSED', 'AWAITING_APPROVAL', 'HUMAN_APPROVED', 'PUBLISHED') THEN
        RAISE EXCEPTION 'job % não chegou à aprovação humana: estado anterior %', p_job_id, v_resume
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF p_to <> v_resume THEN
      RAISE EXCEPTION 'job % em NEEDS_REVIEW só volta a %, não a %', p_job_id, v_resume, p_to
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF v_requires_gate AND NOT EXISTS (
    SELECT 1
      FROM editorial.signatures s
     WHERE s.job_id = p_job_id
       AND s.decision = 'approved'
       AND s.signed_at >= v_job.status_entered_at
  ) THEN
    RAISE EXCEPTION 'transição exige aprovação humana registrada: % -> %', p_from, p_to
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- U11-m. human_reviewer lê jobs e signatures e insere assinaturas. Não atualiza nem apaga.
-- INSERT só nas colunas que o humano informa: id e signed_at vêm do banco, para que ninguém
-- grave uma assinatura com data inventada. A política só deixa assinar job em AWAITING_APPROVAL.
GRANT USAGE ON SCHEMA editorial TO human_reviewer;
GRANT SELECT ON editorial.jobs, editorial.signatures TO human_reviewer;
GRANT INSERT (job_id, reviewer_name, crm_uf, decision, notes) ON editorial.signatures TO human_reviewer;

CREATE POLICY jobs_read_human
  ON editorial.jobs FOR SELECT TO human_reviewer USING (true);
CREATE POLICY signatures_read_human
  ON editorial.signatures FOR SELECT TO human_reviewer USING (true);
CREATE POLICY signatures_insert_human
  ON editorial.signatures FOR INSERT TO human_reviewer
  WITH CHECK (EXISTS (
    SELECT 1
      FROM editorial.jobs j
     WHERE j.id = signatures.job_id
       AND j.status = 'AWAITING_APPROVAL'));
