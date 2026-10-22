-- 006_editorial_owner_create_job.down.sql
--
-- Desfaz 006: devolve as funções ao papel que roda o rollback (o mesmo que rodou a migration),
-- remove create_job, as políticas e os privilégios de editorial_owner, e o papel.
-- Rode antes de desfazer 005 e 004: o DROP FUNCTION delas exige ser o dono.

ALTER FUNCTION editorial.guard_transition(uuid, text, text) OWNER TO CURRENT_USER;
ALTER FUNCTION editorial.set_status(uuid, text) OWNER TO CURRENT_USER;
ALTER FUNCTION editorial.mark_running(uuid, text, text) OWNER TO CURRENT_USER;

DROP FUNCTION editorial.create_job(text, jsonb, text, text);

DROP POLICY jobs_update_owner ON editorial.jobs;
DROP POLICY jobs_insert_owner ON editorial.jobs;
DROP POLICY jobs_read_owner ON editorial.jobs;
DROP POLICY signatures_read_owner ON editorial.signatures;
DROP POLICY state_transitions_read_owner ON editorial.state_transitions;

DROP OWNED BY editorial_owner;
DROP ROLE editorial_owner;
