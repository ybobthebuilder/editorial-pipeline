-- 002_jobs_and_signatures.sql
--
-- Depende de 001_init_editorial_schema.sql. Schema público `editorial`.
-- Respostas de U11 (docs/visual-layer/schema-contract.md, §12):
--   U11-h  editorial.jobs no schema público: id, status, created_at, updated_at.
--   U11-i  estados de erro voltam ao estado de trabalho de origem, além de NEEDS_REVIEW.
--   U11-j  editorial.signatures; guard_transition recebe job_id e exige assinatura aprovada.
--   U11-k  nenhum estado novo. Os gates usam AWAITING_APPROVAL e HUMAN_APPROVED.
--
-- Fora desta migration, de propósito:
--   - proveniência de CLAUDE.md §7 (stage, execution_id, config_*) em jobs: decisão pendente.
--   - set_status e mark_running: migration própria. Chamam guard_transition(job_id, from, to).

-- U11-h. updated_at não tem trigger: quem muda status (set_status, futuro) grava updated_at.
CREATE TABLE editorial.jobs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  status     text        NOT NULL DEFAULT 'RECEIVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jobs_status_known
    CHECK (status IN (
      'RECEIVED', 'PDF_PARSED', 'EVIDENCE_EXTRACTED', 'EVIDENCE_VERIFIED',
      'INSIGHTS_GENERATED', 'INSIGHTS_RANKED', 'VISUAL_PLANNED', 'COVERS_SPECIFIED',
      'COVERS_RENDERED', 'QA_PASSED', 'AWAITING_APPROVAL', 'HUMAN_APPROVED', 'PUBLISHED',
      'VERIFICATION_FAILED', 'QA_FAILED', 'RENDER_FAILED', 'NEEDS_REVIEW'))
);

-- U11-j. Assinatura humana. Só papel humano grava; n8n_pipeline só lê (grants abaixo).
-- crm_uf: UF do CRM do revisor, uma das 27 unidades federativas. O número do CRM não faz
-- parte do contrato e não é gravado aqui.
-- decision: 'approved' e 'rejected' são proposta (schema-contract.md, §12), a confirmar.
CREATE TABLE editorial.signatures (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        uuid        NOT NULL REFERENCES editorial.jobs (id),
  reviewer_name text        NOT NULL CHECK (length(btrim(reviewer_name)) > 0),
  crm_uf        text        NOT NULL CHECK (crm_uf IN (
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
    'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO')),
  decision      text        NOT NULL CHECK (decision IN ('approved', 'rejected')),
  notes         text,
  signed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX signatures_job_id_idx ON editorial.signatures (job_id);

-- U11-i. Saída de retry: cada estado de erro volta ao estado de trabalho de onde a etapa
-- partiu. NEEDS_REVIEW continua sendo a outra saída. Nenhuma das três exige aprovação.
INSERT INTO editorial.state_transitions (from_status, to_status, is_error_path, requires_gate) VALUES
  ('VERIFICATION_FAILED', 'EVIDENCE_EXTRACTED', false, false),  -- 03_VERIFY
  ('RENDER_FAILED',       'COVERS_SPECIFIED',   false, false),  -- 08_RENDER
  ('QA_FAILED',           'COVERS_RENDERED',    false, false);  -- 09_QA

-- U11-j. A assinatura muda (job_id entra). CREATE OR REPLACE não troca a lista de argumentos,
-- por isso DROP. A versão de dois argumentos não tem outro consumidor nesta base.
DROP FUNCTION editorial.guard_transition(text, text);

-- Recusa, nesta ordem: transição inexistente; job inexistente; job que não está em p_from;
-- transição com requires_gate sem assinatura aprovada para este job. Não escreve nada.
CREATE FUNCTION editorial.guard_transition(p_job_id uuid, p_from text, p_to text)
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

-- Row level security em jobs e signatures, como em todas as tabelas (CLAUDE.md §Segurança).
ALTER TABLE editorial.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE editorial.signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY jobs_read_n8n
  ON editorial.jobs FOR SELECT TO n8n_pipeline USING (true);
CREATE POLICY signatures_read_n8n
  ON editorial.signatures FOR SELECT TO n8n_pipeline USING (true);

-- REVOKE ALL: PUBLIC, e anon e authenticated quando existem (papéis do Supabase).
REVOKE ALL ON editorial.jobs, editorial.signatures FROM PUBLIC;
REVOKE ALL ON FUNCTION editorial.guard_transition(uuid, text, text) FROM PUBLIC;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON editorial.jobs, editorial.signatures FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION editorial.guard_transition(uuid, text, text) FROM %I', r);
    END IF;
  END LOOP;
END
$$;

-- n8n_pipeline lê as duas tabelas e executa o guard. Não grava em signatures (assinatura é
-- humana) e não grava em jobs.status (quem muda status é set_status, em migration própria).
GRANT SELECT ON editorial.jobs, editorial.signatures TO n8n_pipeline;
GRANT EXECUTE ON FUNCTION editorial.guard_transition(uuid, text, text) TO n8n_pipeline;
