-- 007_n8n_least_privilege.sql
--
-- Depende de 001 a 006. Schema público `editorial`.
-- Decisões do Fonseca, 2026-10-22 (docs/visual-layer/schema-contract.md, §15):
--   - Um banco por cliente. O schema continua genérico e sem coluna de tenant.
--   - Menor privilégio estrito para n8n_pipeline: nenhum privilégio de tabela. O papel só executa
--     funções SECURITY DEFINER e, se precisa ler um job, lê por uma função.
--
-- O que muda:
--   - n8n_pipeline perde o SELECT em state_transitions, config_baseline, jobs e signatures, e as
--     quatro políticas de leitura dele saem. Fica o USAGE no schema, que é preciso para chamar função.
--   - get_config passa a SECURITY DEFINER e a pertencer a editorial_owner, que ganha SELECT (e uma
--     política) em config_baseline. Antes ela rodava com os privilégios de quem chamava.
--   - Três funções de leitura, cada uma com um consumidor documentado:
--       get_job(job_id)                  Load Context do _TEMPLATE_STAGE (docs/STAGES.md, passo 2)
--       get_job_status(job_id)           Guard e orquestrador: o status atual do job
--       find_jobs_by_execution(exec_id)  99_ERROR_HANDLER: localizar o job pela last_execution_id
--     Cada uma recebe uma chave e devolve o que ela aponta: n8n_pipeline não consegue listar jobs.
--     get_job devolve uma lista explícita de colunas, e não o tipo da tabela, para que uma coluna
--     futura de jobs não seja exposta por acidente.
--   - n8n_pipeline deixa de ler signatures. O gate continua dentro de guard_transition.
--
-- Não há função para listar jobs por status: nenhum workflow documentado a usa (o _TEMPLATE_STAGE
-- recebe o job_id). Se o orquestrador passar a descobrir trabalho por status, a função nasce junto
-- com esse consumidor.
--
-- Efeito em scripts/verify-baseline.js: ele lê config_baseline pela tabela e deixa de funcionar
-- com o papel n8n_pipeline. É uma ferramenta de operação, e roda com o papel de deploy.
--
-- Não verificado: se o papel que roda a migration no Supabase pode fazer ALTER FUNCTION ... OWNER
-- TO editorial_owner (a mesma ressalva da 006).

-- 1. editorial_owner lê a configuração, para que get_config possa ser SECURITY DEFINER.
GRANT SELECT ON editorial.config_baseline TO editorial_owner;
CREATE POLICY config_baseline_read_owner
  ON editorial.config_baseline FOR SELECT TO editorial_owner USING (true);

-- 2. get_config: SECURITY DEFINER. O corpo é o da 001, sem mudança.
CREATE OR REPLACE FUNCTION editorial.get_config(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, editorial, pg_temp
AS $$
DECLARE
  v_row editorial.config_baseline%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM editorial.config_baseline WHERE key = p_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'configuração ausente: %', p_key
      USING ERRCODE = 'no_data_found';
  END IF;
  RETURN jsonb_build_object(
    'content', v_row.content,
    'source', 'public',
    'version', v_row.version,
    'hash', v_row.hash
  );
END;
$$;

-- 3. Funções de leitura. Recusam job inexistente em vez de devolver vazio: um job_id que não existe
-- é erro do workflow, e o Guard do _TEMPLATE_STAGE precisa parar.
CREATE FUNCTION editorial.get_job(p_job_id uuid)
RETURNS TABLE (
  id                uuid,
  status            text,
  created_at        timestamptz,
  updated_at        timestamptz,
  source_origin     text,
  input_context     jsonb,
  config_source     text,
  config_version    text,
  last_stage        text,
  last_execution_id text,
  attempt_count     integer,
  previous_status   text,
  status_entered_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, editorial, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT j.id, j.status, j.created_at, j.updated_at, j.source_origin, j.input_context,
         j.config_source, j.config_version, j.last_stage, j.last_execution_id,
         j.attempt_count, j.previous_status, j.status_entered_at
    FROM editorial.jobs j
   WHERE j.id = p_job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'job inexistente: %', p_job_id
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

CREATE FUNCTION editorial.get_job_status(p_job_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, editorial, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT j.status INTO v_status FROM editorial.jobs j WHERE j.id = p_job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'job inexistente: %', p_job_id
      USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v_status;
END;
$$;

-- Devolve todos os jobs cuja última execução é a informada: zero linhas se nenhum, mais de uma se
-- uma execução tocou mais de um job. O banco não escolhe entre eles; quem chama decide.
CREATE FUNCTION editorial.find_jobs_by_execution(p_execution_id text)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, editorial, pg_temp
AS $$
BEGIN
  IF p_execution_id IS NULL OR length(btrim(p_execution_id)) = 0 THEN
    RAISE EXCEPTION 'execution_id é obrigatório'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN QUERY
  SELECT j.id
    FROM editorial.jobs j
   WHERE j.last_execution_id = p_execution_id
   ORDER BY j.updated_at DESC, j.id;
END;
$$;

REVOKE ALL ON FUNCTION editorial.get_job(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION editorial.get_job_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION editorial.find_jobs_by_execution(text) FROM PUBLIC;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION editorial.get_job(uuid) FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION editorial.get_job_status(uuid) FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION editorial.find_jobs_by_execution(text) FROM %I', r);
    END IF;
  END LOOP;
END
$$;

-- Propriedade: as quatro funções passam a ser de editorial_owner (que não é superusuário nem
-- BYPASSRLS, e recebe só o que elas precisam). ALTER OWNER reescreve o ACL, então os GRANTs vêm depois.
ALTER FUNCTION editorial.get_config(text) OWNER TO editorial_owner;
ALTER FUNCTION editorial.get_job(uuid) OWNER TO editorial_owner;
ALTER FUNCTION editorial.get_job_status(uuid) OWNER TO editorial_owner;
ALTER FUNCTION editorial.find_jobs_by_execution(text) OWNER TO editorial_owner;

GRANT EXECUTE ON FUNCTION editorial.get_config(text) TO n8n_pipeline;
GRANT EXECUTE ON FUNCTION editorial.get_job(uuid) TO n8n_pipeline;
GRANT EXECUTE ON FUNCTION editorial.get_job_status(uuid) TO n8n_pipeline;
GRANT EXECUTE ON FUNCTION editorial.find_jobs_by_execution(text) TO n8n_pipeline;

-- 4. n8n_pipeline perde as leituras diretas. Por último, depois de as funções existirem.
REVOKE SELECT ON editorial.state_transitions, editorial.config_baseline,
                 editorial.jobs, editorial.signatures FROM n8n_pipeline;

DROP POLICY state_transitions_read_n8n ON editorial.state_transitions;
DROP POLICY config_baseline_read_n8n ON editorial.config_baseline;
DROP POLICY jobs_read_n8n ON editorial.jobs;
DROP POLICY signatures_read_n8n ON editorial.signatures;
