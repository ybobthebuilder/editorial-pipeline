-- 008_image_approvals.down.sql
--
-- Desfaz 008: remove get_image_approvals e a tabela image_approvals, com as políticas e os grants
-- dela. ATENÇÃO: apaga as aprovações humanas de imagem já gravadas. Um payload image_assets que
-- referencie um approval_id deixa de poder ser validado. Rode antes de desfazer 007.

DROP FUNCTION editorial.get_image_approvals(uuid);
DROP TABLE editorial.image_approvals;
