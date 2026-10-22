-- 007_n8n_least_privilege.down.sql
--
-- Desfaz 007: devolve a n8n_pipeline o SELECT e as quatro políticas de leitura, remove as três
-- funções de leitura, põe get_config de volta como SECURITY INVOKER e dona dela o papel que roda o
-- rollback (o mesmo que rodou a migration), e tira de editorial_owner a leitura de config_baseline.
-- Rode antes de desfazer 006.

GRANT SELECT ON editorial.state_transitions, editorial.config_baseline,
                editorial.jobs, editorial.signatures TO n8n_pipeline;

CREATE POLICY state_transitions_read_n8n
  ON editorial.state_transitions FOR SELECT TO n8n_pipeline USING (true);
CREATE POLICY config_baseline_read_n8n
  ON editorial.config_baseline FOR SELECT TO n8n_pipeline USING (true);
CREATE POLICY jobs_read_n8n
  ON editorial.jobs FOR SELECT TO n8n_pipeline USING (true);
CREATE POLICY signatures_read_n8n
  ON editorial.signatures FOR SELECT TO n8n_pipeline USING (true);

DROP FUNCTION editorial.find_jobs_by_execution(text);
DROP FUNCTION editorial.get_job_status(uuid);
DROP FUNCTION editorial.get_job(uuid);

-- get_config como na 001: SECURITY INVOKER, sem editorial_owner.
CREATE OR REPLACE FUNCTION editorial.get_config(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
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

ALTER FUNCTION editorial.get_config(text) OWNER TO CURRENT_USER;
GRANT EXECUTE ON FUNCTION editorial.get_config(text) TO n8n_pipeline;

DROP POLICY config_baseline_read_owner ON editorial.config_baseline;
REVOKE SELECT ON editorial.config_baseline FROM editorial_owner;
