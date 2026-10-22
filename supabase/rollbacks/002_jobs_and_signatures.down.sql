-- 002_jobs_and_signatures.down.sql
--
-- Desfaz 002 e devolve o catálogo ao estado de 001. Apaga os dados de jobs e signatures
-- (DROP TABLE). Rode depois de desfazer as migrations posteriores.

DROP FUNCTION editorial.guard_transition(uuid, text, text);
DROP TABLE editorial.signatures;
DROP TABLE editorial.jobs;

DELETE FROM editorial.state_transitions
 WHERE (from_status, to_status) IN (
   ('VERIFICATION_FAILED', 'EVIDENCE_EXTRACTED'),
   ('RENDER_FAILED', 'COVERS_SPECIFIED'),
   ('QA_FAILED', 'COVERS_RENDERED'));

-- Versão de 001, igual byte a byte no corpo.
CREATE FUNCTION editorial.guard_transition(p_from text, p_to text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, editorial, pg_temp
AS $$
DECLARE
  v_requires_gate boolean;
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
  IF v_requires_gate THEN
    RAISE EXCEPTION 'transição exige aprovação humana registrada: % -> %', p_from, p_to
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION editorial.guard_transition(text, text) FROM PUBLIC;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION editorial.guard_transition(text, text) FROM %I', r);
    END IF;
  END LOOP;
END
$$;

GRANT EXECUTE ON FUNCTION editorial.guard_transition(text, text) TO n8n_pipeline;
