-- 004_set_status_mark_running.sql
--
-- Depende de 001 a 003. Schema público `editorial`.
-- CLAUDE.md §5: workflows nunca fazem UPDATE direto no status; chamam mark_running() e
-- set_status(). Estas duas funções são o único caminho de escrita em jobs para n8n_pipeline.
--
-- Ambas são SECURITY DEFINER com search_path fixo (pg_temp por último) e nomes qualificados,
-- porque escrevem em uma tabela onde n8n_pipeline só tem SELECT. EXECUTE só para n8n_pipeline.
-- Limite conhecido: o dono das funções é o papel que roda a migration. Um dono dedicado e sem
-- LOGIN reduziria o alcance de um erro nelas; fica como endurecimento a decidir.
--
-- Regra de attempt_count (U11-o): conta as tentativas desde o último avanço, não as etapas.
--   - mark_running soma 1 e devolve o valor. O limite de 3 é do orquestrador, não do banco.
--   - set_status zera ao avançar. Mantém o valor ao ir para um estado de erro ou NEEDS_REVIEW,
--     e ao sair de um estado de erro (retry), senão o limite nunca seria atingido.
--   - sair de NEEDS_REVIEW zera: houve decisão humana.
--
-- Regras de mark_running que são escolha minha: recusa job em estado de erro, NEEDS_REVIEW ou
-- PUBLISHED, e valida o formato NN_NOME da etapa (docs/STAGES.md §6), sem lista fechada.

CREATE FUNCTION editorial.set_status(p_job_id uuid, p_next_status text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, editorial, pg_temp
AS $$
DECLARE
  v_job      editorial.jobs%ROWTYPE;
  v_attempts integer;
BEGIN
  -- O bloqueio de linha serializa duas chamadas no mesmo job: a segunda lê o status já mudado.
  SELECT j.*
    INTO v_job
    FROM editorial.jobs j
   WHERE j.id = p_job_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'job inexistente: %', p_job_id
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM editorial.guard_transition(p_job_id, v_job.status, p_next_status);

  v_attempts := CASE
    WHEN p_next_status IN ('VERIFICATION_FAILED', 'RENDER_FAILED', 'QA_FAILED', 'NEEDS_REVIEW')
      OR v_job.status IN ('VERIFICATION_FAILED', 'RENDER_FAILED', 'QA_FAILED')
    THEN v_job.attempt_count
    ELSE 0
  END;

  UPDATE editorial.jobs
     SET status            = p_next_status,
         previous_status   = v_job.status,
         status_entered_at = now(),
         updated_at        = now(),
         attempt_count     = v_attempts
   WHERE id = p_job_id;
END;
$$;

CREATE FUNCTION editorial.mark_running(p_job_id uuid, p_stage text, p_execution_id text)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, editorial, pg_temp
AS $$
DECLARE
  v_job      editorial.jobs%ROWTYPE;
  v_attempts integer;
BEGIN
  IF p_stage IS NULL OR p_stage !~ '^[0-9]{2}_[A-Z0-9_]+$' THEN
    RAISE EXCEPTION 'etapa inválida: %', p_stage
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_execution_id IS NULL OR length(btrim(p_execution_id)) = 0 THEN
    RAISE EXCEPTION 'execution_id é obrigatório'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT j.*
    INTO v_job
    FROM editorial.jobs j
   WHERE j.id = p_job_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'job inexistente: %', p_job_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_job.status IN ('VERIFICATION_FAILED', 'RENDER_FAILED', 'QA_FAILED', 'NEEDS_REVIEW', 'PUBLISHED') THEN
    RAISE EXCEPTION 'job % não pode executar etapa em %', p_job_id, v_job.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE editorial.jobs
     SET attempt_count      = attempt_count + 1,
         last_stage         = p_stage,
         last_execution_id  = p_execution_id,
         updated_at         = now()
   WHERE id = p_job_id
  RETURNING attempt_count INTO v_attempts;

  RETURN v_attempts;
END;
$$;

REVOKE ALL ON FUNCTION editorial.set_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION editorial.mark_running(uuid, text, text) FROM PUBLIC;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION editorial.set_status(uuid, text) FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION editorial.mark_running(uuid, text, text) FROM %I', r);
    END IF;
  END LOOP;
END
$$;

GRANT EXECUTE ON FUNCTION editorial.set_status(uuid, text) TO n8n_pipeline;
GRANT EXECUTE ON FUNCTION editorial.mark_running(uuid, text, text) TO n8n_pipeline;
