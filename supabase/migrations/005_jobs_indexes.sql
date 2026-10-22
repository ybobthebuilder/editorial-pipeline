-- non-transactional
-- 005_jobs_indexes.sql
--
-- Depende de 001 a 004. Índices de jobs, criados com CONCURRENTLY para não bloquear escrita.
-- CREATE INDEX CONCURRENTLY não roda dentro de transação: aplique este arquivo sem `psql -1`
-- e como único comando de cada execução. A primeira linha acima marca isso para o harness.
-- IF NOT EXISTS torna a reexecução segura. Se uma criação for interrompida, o Postgres deixa um
-- índice INVALID: rode o rollback (005.down) e aplique de novo.
--
-- Já existe índice nas chaves estrangeiras: signatures.job_id (002). jobs não tem FK.
--   jobs_status_idx            o orquestrador lê o status para decidir a etapa.
--   jobs_last_execution_id_idx 99_ERROR_HANDLER acha o job por last_execution_id (CLAUDE.md).

CREATE INDEX CONCURRENTLY IF NOT EXISTS jobs_status_idx
  ON editorial.jobs (status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS jobs_last_execution_id_idx
  ON editorial.jobs (last_execution_id)
  WHERE last_execution_id IS NOT NULL;
