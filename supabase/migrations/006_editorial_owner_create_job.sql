-- 006_editorial_owner_create_job.sql
--
-- Depende de 001 a 005. Schema público `editorial`.
-- Decisões de 2026-10-22:
--   - create_job: única forma de n8n_pipeline criar um job (CLAUDE.md, estágio 01_INGEST).
--   - editorial_owner: papel dedicado, sem LOGIN, dono das funções SECURITY DEFINER. Um erro
--     numa função não herda os poderes de quem roda a migration: só os de editorial_owner,
--     que recebe o mínimo (abaixo). Funções de leitura pura (get_config) continuam INVOKER.
--
-- Privilégios de editorial_owner, e nada além deles:
--   state_transitions  SELECT
--   signatures         SELECT                          (o guard lê; ele não grava assinatura)
--   jobs               SELECT; INSERT só em source_origin, input_context, config_source,
--                      config_version (status nasce RECEIVED e attempt_count nasce 0);
--                      UPDATE só em status, previous_status, status_entered_at, updated_at,
--                      attempt_count, last_stage, last_execution_id. Sem DELETE.
-- Como o dono não é superusuário nem BYPASSRLS, as políticas de RLS abaixo valem para ele.
--
-- Não verificado: se o papel que roda a migration no Supabase pode fazer ALTER FUNCTION ... OWNER
-- TO editorial_owner. No Postgres exige poder assumir o papel; num superusuário é automático.
--
-- create_job não é idempotente: repetir a chamada cria outro job. A chave de idempotência
-- (CLAUDE.md §6) para a criação não está definida.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'editorial_owner') THEN
    CREATE ROLE editorial_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOINHERIT;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA editorial TO editorial_owner;
GRANT SELECT ON editorial.state_transitions, editorial.signatures TO editorial_owner;
GRANT SELECT ON editorial.jobs TO editorial_owner;
GRANT INSERT (source_origin, input_context, config_source, config_version) ON editorial.jobs TO editorial_owner;
GRANT UPDATE (status, previous_status, status_entered_at, updated_at, attempt_count, last_stage, last_execution_id)
  ON editorial.jobs TO editorial_owner;

CREATE POLICY state_transitions_read_owner
  ON editorial.state_transitions FOR SELECT TO editorial_owner USING (true);
CREATE POLICY signatures_read_owner
  ON editorial.signatures FOR SELECT TO editorial_owner USING (true);
CREATE POLICY jobs_read_owner
  ON editorial.jobs FOR SELECT TO editorial_owner USING (true);
CREATE POLICY jobs_insert_owner
  ON editorial.jobs FOR INSERT TO editorial_owner WITH CHECK (status = 'RECEIVED' AND attempt_count = 0);
CREATE POLICY jobs_update_owner
  ON editorial.jobs FOR UPDATE TO editorial_owner USING (true) WITH CHECK (true);

-- create_job devolve o id. A proveniência é obrigatória (CLAUDE.md §7); as constraints de jobs
-- recusam valores vazios, contexto que não seja objeto e config_source fora de public/private.
CREATE FUNCTION editorial.create_job(
  p_source_origin  text,
  p_input_context  jsonb,
  p_config_source  text,
  p_config_version text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, editorial, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO editorial.jobs (source_origin, input_context, config_source, config_version)
  VALUES (p_source_origin, p_input_context, p_config_source, p_config_version)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION editorial.create_job(text, jsonb, text, text) FROM PUBLIC;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION editorial.create_job(text, jsonb, text, text) FROM %I', r);
    END IF;
  END LOOP;
END
$$;

-- Propriedade: as quatro funções SECURITY DEFINER passam a ser de editorial_owner. ALTER OWNER
-- reescreve o ACL (dono e concedente) e preserva o EXECUTE de n8n_pipeline.
ALTER FUNCTION editorial.guard_transition(uuid, text, text) OWNER TO editorial_owner;
ALTER FUNCTION editorial.set_status(uuid, text) OWNER TO editorial_owner;
ALTER FUNCTION editorial.mark_running(uuid, text, text) OWNER TO editorial_owner;
ALTER FUNCTION editorial.create_job(text, jsonb, text, text) OWNER TO editorial_owner;

GRANT EXECUTE ON FUNCTION editorial.create_job(text, jsonb, text, text) TO n8n_pipeline;
