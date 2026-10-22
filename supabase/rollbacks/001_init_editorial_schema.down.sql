-- 001_init_editorial_schema.down.sql
--
-- Desfaz 001. Remove o schema editorial inteiro (CASCADE) e o papel n8n_pipeline.
-- Perde todos os dados do schema. Rode depois de desfazer as migrations posteriores.
-- DROP ROLE falha se n8n_pipeline ainda tiver privilégios ou objetos em outro banco do cluster:
-- nesse caso o erro aparece e nada é escondido.

DROP SCHEMA IF EXISTS editorial CASCADE;
DROP ROLE IF EXISTS n8n_pipeline;
