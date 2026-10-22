-- 008_image_approvals.sql
--
-- Depende de 001 a 007. Schema público `editorial`.
-- Decisão do Fonseca, 2026-10-22 (contrato image_assets, D-15 e U24): a aprovação humana de uma foto
-- própria (`owned_photo`) é um registro no banco que só human_reviewer grava. O JSON da imagem
-- referencia o id desse registro; um flag no payload não prova nada, porque quem escreve o payload
-- é o próprio sistema que a regra vigia.
--
-- Por que tabela própria, e não signatures: signatures é a assinatura do gate AWAITING_APPROVAL ->
-- HUMAN_APPROVED. guard_transition aceita qualquer linha `approved` dela para o job, e a política de
-- INSERT só deixa assinar job em AWAITING_APPROVAL. Aprovar uma imagem ali liberaria o gate sem que
-- ninguém tivesse revisado a capa, e não daria para aprovar a foto no momento do upload.
--
-- O que o registro amarra: o job, a referência da imagem (`ref`) e o assunto que o revisor declarou
-- (`subject`). O CHECK de `subject` só admite `none` e `person_not_patient`: o banco não guarda uma
-- aprovação de foto de paciente, antes/depois ou exame, que o validador recusa sempre. A segunda
-- declaração de `subject`, feita por um humano, é a conferência independente da declaração do
-- produtor do payload (docs/visual-layer/image-assets-proposal.md, §7).
--
-- O que n8n_pipeline faz: nada na tabela. Lê pela função get_image_approvals(job_id), que devolve as
-- aprovações do job sem a justificativa nem o nome do revisor. O validador de negócio (validators/
-- media.js) recebe essas linhas e confere cada `approval_id` do payload contra elas.
--
-- Escolhas minhas, a confirmar:
--   - Sem revogação: human_reviewer não atualiza nem apaga, como em signatures. Uma aprovação dada por
--     engano fica; o remédio é o produtor do payload não referenciá-la. Revogar exige decidir quem
--     pode apagar.
--   - A política de INSERT só exige que o job exista (a chave estrangeira garante o mesmo). Não há
--     restrição de estado do job porque não sei em qual estágio o upload é aprovado (pergunta Q1 da
--     proposta). Uma aprovação sem referência é inerte.
--   - Justificativa com no mínimo 20 caracteres (proposta, Q5): só barra o vazio.
--
-- Não verificado: se o papel que roda a migration no Supabase pode fazer ALTER FUNCTION ... OWNER
-- TO editorial_owner (a mesma ressalva da 006 e da 007).

CREATE TABLE editorial.image_approvals (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        uuid        NOT NULL REFERENCES editorial.jobs (id),
  ref           text        NOT NULL CHECK (ref ~ '^img://[A-Za-z0-9._/-]+$'),
  subject       text        NOT NULL CHECK (subject IN ('none', 'person_not_patient')),
  justification text        NOT NULL CHECK (length(btrim(justification)) >= 20),
  reviewer_name text        NOT NULL CHECK (length(btrim(reviewer_name)) > 0),
  signed_at     timestamptz NOT NULL DEFAULT now(),
  -- Uma aprovação por imagem de um job. A chave também serve de índice da chave estrangeira.
  CONSTRAINT image_approvals_job_ref_key UNIQUE (job_id, ref)
);

ALTER TABLE editorial.image_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY image_approvals_read_human
  ON editorial.image_approvals FOR SELECT TO human_reviewer USING (true);
CREATE POLICY image_approvals_read_owner
  ON editorial.image_approvals FOR SELECT TO editorial_owner USING (true);
CREATE POLICY image_approvals_insert_human
  ON editorial.image_approvals FOR INSERT TO human_reviewer
  WITH CHECK (EXISTS (SELECT 1 FROM editorial.jobs j WHERE j.id = image_approvals.job_id));

REVOKE ALL ON editorial.image_approvals FROM PUBLIC;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON editorial.image_approvals FROM %I', r);
    END IF;
  END LOOP;
END
$$;

-- human_reviewer lê e insere, só nas colunas que o humano informa: id e signed_at vêm do banco,
-- para que ninguém grave uma aprovação com data ou id escolhidos. Não atualiza nem apaga.
GRANT SELECT ON editorial.image_approvals TO human_reviewer;
GRANT INSERT (job_id, ref, subject, justification, reviewer_name) ON editorial.image_approvals TO human_reviewer;
-- editorial_owner lê para que get_image_approvals possa ser SECURITY DEFINER.
GRANT SELECT ON editorial.image_approvals TO editorial_owner;

-- Lê as aprovações de um job. Recusa job inexistente, como get_job: um job_id que não existe é erro
-- do workflow. Job sem aprovação devolve zero linhas. Colunas explícitas, sem a justificativa e sem
-- o revisor, que o validador não usa.
CREATE FUNCTION editorial.get_image_approvals(p_job_id uuid)
RETURNS TABLE (
  id        uuid,
  job_id    uuid,
  ref       text,
  subject   text,
  signed_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, editorial, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM editorial.jobs j WHERE j.id = p_job_id) THEN
    RAISE EXCEPTION 'job inexistente: %', p_job_id
      USING ERRCODE = 'no_data_found';
  END IF;
  RETURN QUERY
  SELECT a.id, a.job_id, a.ref, a.subject, a.signed_at
    FROM editorial.image_approvals a
   WHERE a.job_id = p_job_id
   ORDER BY a.signed_at, a.id;
END;
$$;

REVOKE ALL ON FUNCTION editorial.get_image_approvals(uuid) FROM PUBLIC;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION editorial.get_image_approvals(uuid) FROM %I', r);
    END IF;
  END LOOP;
END
$$;

-- ALTER OWNER reescreve o ACL, então o GRANT vem depois.
ALTER FUNCTION editorial.get_image_approvals(uuid) OWNER TO editorial_owner;
GRANT EXECUTE ON FUNCTION editorial.get_image_approvals(uuid) TO n8n_pipeline;
