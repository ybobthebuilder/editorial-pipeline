-- 001_init_editorial_schema.sql
--
-- Schema público `editorial` (CLAUDE.md, "Dois Repositórios, Dois Schemas").
-- Respostas de U11 (docs/visual-layer/schema-contract.md, §10):
--   U11-a/b  state_transitions tem from_status, to_status, is_error_path e requires_gate.
--            requires_gate foi acrescentada por decisão de 2026-10-22. Estados de erro têm
--            entrada e saída explícitas.
--   U11-c    get_config NÃO lê o schema privado. O público funciona sozinho.
--   U11-d    set_status chama guard_transition de forma explícita.
--            set_status não está nesta migration (ver abaixo).
--   U11-e    job_id será UUID. Não há tabela de jobs nesta migration.
--   U11-f    role n8n_pipeline: EXECUTE nas funções, SELECT nas tabelas públicas.
--   U11-g    tudo no schema editorial.
--
-- Fora desta migration, de propósito:
--   - set_status e mark_running: dependem de uma tabela de jobs cuja localização
--     está em aberto (CLAUDE.md coloca jobs em editorial_intel; U11-g põe tudo em editorial).
--   - seed do config_baseline: feito por seed-baseline a partir de config/baseline/*.json.
--   - saídas dos estados de erro além de NEEDS_REVIEW, e rewind manual: sem fonte.
--
-- Não referencia editorial_intel. Aplica-se a Postgres limpo: os papéis anon e
-- authenticated (Supabase) só são revogados quando existem.

CREATE SCHEMA IF NOT EXISTS editorial;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'n8n_pipeline') THEN
    -- Sem LOGIN: a credencial é definida fora do repositório (.env é ignorado).
    CREATE ROLE n8n_pipeline NOLOGIN;
  END IF;
END
$$;

-- Máquina de estados (CLAUDE.md §5): 13 estados de caminho feliz e 4 de erro.
CREATE TABLE editorial.state_transitions (
  from_status   text    NOT NULL,
  to_status     text    NOT NULL,
  is_error_path boolean NOT NULL,
  requires_gate boolean NOT NULL,
  PRIMARY KEY (from_status, to_status),
  CONSTRAINT state_transitions_no_self_loop
    CHECK (from_status <> to_status),
  CONSTRAINT state_transitions_from_known
    CHECK (from_status IN (
      'RECEIVED', 'PDF_PARSED', 'EVIDENCE_EXTRACTED', 'EVIDENCE_VERIFIED',
      'INSIGHTS_GENERATED', 'INSIGHTS_RANKED', 'VISUAL_PLANNED', 'COVERS_SPECIFIED',
      'COVERS_RENDERED', 'QA_PASSED', 'AWAITING_APPROVAL', 'HUMAN_APPROVED', 'PUBLISHED',
      'VERIFICATION_FAILED', 'QA_FAILED', 'RENDER_FAILED', 'NEEDS_REVIEW')),
  CONSTRAINT state_transitions_to_known
    CHECK (to_status IN (
      'RECEIVED', 'PDF_PARSED', 'EVIDENCE_EXTRACTED', 'EVIDENCE_VERIFIED',
      'INSIGHTS_GENERATED', 'INSIGHTS_RANKED', 'VISUAL_PLANNED', 'COVERS_SPECIFIED',
      'COVERS_RENDERED', 'QA_PASSED', 'AWAITING_APPROVAL', 'HUMAN_APPROVED', 'PUBLISHED',
      'VERIFICATION_FAILED', 'QA_FAILED', 'RENDER_FAILED', 'NEEDS_REVIEW')),
  -- is_error_path é verdadeiro exatamente quando o destino é um estado de erro.
  CONSTRAINT state_transitions_error_flag
    CHECK (is_error_path = (to_status IN ('VERIFICATION_FAILED', 'QA_FAILED', 'RENDER_FAILED', 'NEEDS_REVIEW')))
);

INSERT INTO editorial.state_transitions (from_status, to_status, is_error_path, requires_gate) VALUES
  -- Caminho feliz (CLAUDE.md §5): 12 transições entre 13 estados.
  ('RECEIVED',            'PDF_PARSED',           false, false),
  ('PDF_PARSED',          'EVIDENCE_EXTRACTED',   false, false),
  ('EVIDENCE_EXTRACTED',  'EVIDENCE_VERIFIED',    false, false),
  ('EVIDENCE_VERIFIED',   'INSIGHTS_GENERATED',   false, false),
  ('INSIGHTS_GENERATED',  'INSIGHTS_RANKED',      false, false),
  ('INSIGHTS_RANKED',     'VISUAL_PLANNED',       false, false),
  ('VISUAL_PLANNED',      'COVERS_SPECIFIED',     false, false),
  ('COVERS_SPECIFIED',    'COVERS_RENDERED',      false, false),
  ('COVERS_RENDERED',     'QA_PASSED',            false, false),
  ('QA_PASSED',           'AWAITING_APPROVAL',    false, false),
  ('AWAITING_APPROVAL',   'HUMAN_APPROVED',       false, true),
  ('HUMAN_APPROVED',      'PUBLISHED',            false, false),
  -- Falhas de etapa (docs/STAGES.md §6): a etapa parte do estado de entrada e grava o erro.
  ('EVIDENCE_EXTRACTED',  'VERIFICATION_FAILED',  true, false),   -- 03_VERIFY
  ('COVERS_SPECIFIED',    'RENDER_FAILED',        true, false),   -- 08_RENDER
  ('COVERS_RENDERED',     'QA_FAILED',            true, false),   -- 09_QA
  -- Qualquer estado -> NEEDS_REVIEW (CLAUDE.md §5), inclusive PUBLISHED e os estados de erro.
  ('RECEIVED',            'NEEDS_REVIEW',         true, false),
  ('PDF_PARSED',          'NEEDS_REVIEW',         true, false),
  ('EVIDENCE_EXTRACTED',  'NEEDS_REVIEW',         true, false),
  ('EVIDENCE_VERIFIED',   'NEEDS_REVIEW',         true, false),
  ('INSIGHTS_GENERATED',  'NEEDS_REVIEW',         true, false),
  ('INSIGHTS_RANKED',     'NEEDS_REVIEW',         true, false),
  ('VISUAL_PLANNED',      'NEEDS_REVIEW',         true, false),
  ('COVERS_SPECIFIED',    'NEEDS_REVIEW',         true, false),
  ('COVERS_RENDERED',     'NEEDS_REVIEW',         true, false),
  ('QA_PASSED',           'NEEDS_REVIEW',         true, false),
  ('AWAITING_APPROVAL',   'NEEDS_REVIEW',         true, false),
  ('HUMAN_APPROVED',      'NEEDS_REVIEW',         true, false),
  ('PUBLISHED',           'NEEDS_REVIEW',         true, false),
  ('VERIFICATION_FAILED', 'NEEDS_REVIEW',         true, false),
  ('QA_FAILED',           'NEEDS_REVIEW',         true, false),
  ('RENDER_FAILED',       'NEEDS_REVIEW',         true, false);

-- Configuração pública em camadas (CLAUDE.md §9). Sem seed: o seed-baseline carrega
-- config/baseline/*.json. `hash` e `version` são guardados como recebidos; o formato
-- do hash ainda é UNKNOWN (ver schema-contract.md §4.2).
CREATE TABLE editorial.config_baseline (
  key     text  PRIMARY KEY CHECK (length(key) > 0),
  content jsonb NOT NULL,
  version text  NOT NULL CHECK (length(version) > 0),
  hash    text  NOT NULL CHECK (length(hash) > 0)
);

-- U11-d: função, não trigger. Chamada explicitamente por set_status (fora desta migration).
-- Levanta erro se a transição não existe, ou se ela exige aprovação humana (requires_gate).
-- Não lê nenhuma tabela de jobs. Enquanto não existir registro de assinatura (U11-j), toda
-- transição com requires_gate é recusada: falha fechada, não aprovação por omissão.
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

-- U11-c: lê somente editorial.config_baseline. Nunca lê o schema privado.
-- `source` é sempre 'public' nesta versão. Chave ausente levanta erro (falha fechada).
CREATE FUNCTION editorial.get_config(p_key text)
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

-- Row level security em todas as tabelas (CLAUDE.md §Segurança). Sem política para
-- anon e authenticated, eles não veem linhas.
ALTER TABLE editorial.state_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE editorial.config_baseline ENABLE ROW LEVEL SECURITY;

CREATE POLICY state_transitions_read_n8n
  ON editorial.state_transitions FOR SELECT TO n8n_pipeline USING (true);
CREATE POLICY config_baseline_read_n8n
  ON editorial.config_baseline FOR SELECT TO n8n_pipeline USING (true);

-- REVOKE ALL: PUBLIC primeiro (funções nascem com EXECUTE para PUBLIC).
REVOKE ALL ON SCHEMA editorial FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA editorial FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA editorial FROM PUBLIC;

-- REVOKE ALL para anon e authenticated, quando existem (papéis do Supabase).
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA editorial FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA editorial FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA editorial FROM %I', r);
    END IF;
  END LOOP;
END
$$;

-- U11-f: mínimo para n8n_pipeline. Só leitura nas tabelas; EXECUTE nas duas funções.
GRANT USAGE ON SCHEMA editorial TO n8n_pipeline;
GRANT SELECT ON editorial.state_transitions, editorial.config_baseline TO n8n_pipeline;
GRANT EXECUTE ON FUNCTION editorial.guard_transition(text, text) TO n8n_pipeline;
GRANT EXECUTE ON FUNCTION editorial.get_config(text) TO n8n_pipeline;
