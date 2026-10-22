-- non-transactional
-- 005_jobs_indexes.down.sql
--
-- Desfaz 005. DROP INDEX CONCURRENTLY aceita um índice por comando e não roda em transação.

DROP INDEX CONCURRENTLY IF EXISTS editorial.jobs_last_execution_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS editorial.jobs_status_idx;
