-- 003_review_exit_provenance_attempts.down.sql
--
-- Desfaz 003 e devolve o catálogo ao estado de 002. Apaga as colunas novas de jobs (perde
-- proveniência, attempt_count, previous_status e status_entered_at). Rode depois de desfazer
-- as migrations posteriores.

-- Versão de 002, igual byte a byte no corpo.
CREATE OR REPLACE FUNCTION editorial.guard_transition(p_job_id uuid, p_from text, p_to text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, editorial, pg_temp
AS $$
DECLARE
  v_requires_gate boolean;
  v_status        text;
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

  SELECT j.status
    INTO v_status
    FROM editorial.jobs j
   WHERE j.id = p_job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'job inexistente: %', p_job_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status <> p_from THEN
    RAISE EXCEPTION 'job % está em %, não em %', p_job_id, v_status, p_from
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_requires_gate AND NOT EXISTS (
    SELECT 1
      FROM editorial.signatures s
     WHERE s.job_id = p_job_id
       AND s.decision = 'approved'
  ) THEN
    RAISE EXCEPTION 'transição exige aprovação humana registrada: % -> %', p_from, p_to
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

DROP POLICY signatures_insert_human ON editorial.signatures;
DROP POLICY signatures_read_human ON editorial.signatures;
DROP POLICY jobs_read_human ON editorial.jobs;

DELETE FROM editorial.state_transitions WHERE from_status = 'NEEDS_REVIEW';

-- DROP COLUMN leva junto as constraints de coluna única criadas em 003.
ALTER TABLE editorial.jobs
  DROP COLUMN source_origin,
  DROP COLUMN input_context,
  DROP COLUMN config_source,
  DROP COLUMN config_version,
  DROP COLUMN last_stage,
  DROP COLUMN last_execution_id,
  DROP COLUMN attempt_count,
  DROP COLUMN previous_status,
  DROP COLUMN status_entered_at;

DROP OWNED BY human_reviewer;
DROP ROLE human_reviewer;
