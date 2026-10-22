-- 004_set_status_mark_running.down.sql
--
-- Desfaz 004: remove as duas funções. Não toca em dados: jobs mantém status e attempt_count.
-- Depois disto, n8n_pipeline não tem mais caminho de escrita em jobs.

DROP FUNCTION editorial.mark_running(uuid, text, text);
DROP FUNCTION editorial.set_status(uuid, text);
