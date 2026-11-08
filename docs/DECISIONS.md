# Registro de decisões

Este arquivo reúne num só lugar as decisões que o `CLAUDE.md` e os documentos chamam por ID (`D-nn`, `U-nn`, `U11-x`). Até aqui elas viviam em quatro documentos, e a tabela principal (`docs/visual-layer/contexto.md` §11) se chama "Decisões pendentes" mas mistura itens já decididos.

> **Status: PROPOSED até a conferência do Fonseca.** Extraído em 2026-11-07 dos documentos citados na coluna *Fonte*. Nada aqui é decisão nova: cada linha resume o que a fonte diz. Onde a fonte não registra decisão, a linha diz isso. Em caso de divergência entre este arquivo e a fonte, vale a fonte, até o Fonseca conferir.

## Como usar

- **Só acréscimo.** Decisão nova entra como linha nova, no fim da tabela, com o próximo `D-nn`. Para mudar uma decisão, acrescente a nova e preencha *Relação* nas duas linhas; na linha antiga, só *Estado* (para `substituída`) e *Relação* mudam. Nunca se apaga linha.
- **Estado** é um destes: `decidida` (a fonte registra quem decidiu), `proposta` (a fonte traz só a recomendação), `aberta` (pergunta sem resposta registrada), `substituída` (outra linha a troca).
- **Quem** e **Data** são os da fonte. `—` quer dizer que a fonte não diz.
- **Fonte** é o arquivo e a seção, e não a linha: o número de linha envelhece. Procure o ID na tabela da seção.
- `CLAUDE.md` pode citar uma decisão por ID; o ID leva a esta tabela.

## Registro

### Série D (contexto.md §11)

| ID | Data | Decisão | Quem | Estado | Fonte | Relação e observações |
| --- | --- | --- | --- | --- | --- | --- |
| D-01 | — | Os documentos da camada visual ficam em `docs/visual-layer/`. | — | proposta | `contexto.md` §11 | A fonte traz só a recomendação. |
| D-02 | 2026-10-22 | O baseline fica em `editorial.config_baseline`. | usuário | decidida | `contexto.md` §11 | Mesma decisão de U1. |
| D-03 | — | O `08_RENDER` produz SVG no MVP; PNG só depois de verificar uma engine compatível com n8n Cloud. | — | proposta | `contexto.md` §11 | Ver U4. |
| D-04 | — | Os SVGs de marca ficam fora do repositório público; entrada só com autorização explícita do Fonseca, em fase a nomear. | Fonseca | substituída | `contexto.md` §11 | Fase nomeada em D-10. A decisão de 2026-10-22 em `assets/brand/README.md` ("Rights and provenance") autoriza os SVGs no repositório público. Direitos: U7. |
| D-05 | 2026-10-22 | O CFM se aplica: conformidade é objetivo do sistema. Efeitos: gate `QA-CFM` (`waived` proibido), slot de rodapé `chrome`, configs `cfm_blocklist` e `cfm_footer`. | Fonseca | decidida | `contexto.md` §11; `contracts-proposal.md` §7 | Resposta de U6. Conteúdo: U22 e U18. |
| D-06 | — | Um patch corrige os SVGs (XML, ids de slot), proposto no VL-1 e aprovado antes de entrar no repositório. | — | proposta | `contexto.md` §11 | D-16 (2) registra a posição dos blocos movidos. |
| D-07 | — | Módulos em CommonJS puro, sem dependências. | — | proposta | `contexto.md` §11 | A fonte pede "confirmar". Regra equivalente em `CLAUDE.md` §10 ("Validadores puros"). |
| D-08 | 2026-10-22 | A margem externa (chrome) é de 64 px. | Fonseca | decidida | `contexto.md` §11; `schema-contract.md` §13 | Ajustada por U19 (a zona segura de conteúdo é o espaço restante, e não mais 90 px) e por U23 (faixas de 260 px e 340 px nos formatos 9:16). A linha de `schema-contract.md` §13 ("90 px de zona segura") é anterior ao ajuste. |
| D-09 | — | O mapeamento estágio → status de saída (`contexto.md` §4) é inferido. | — | proposta | `contexto.md` §11 | A fonte pede "confirmar a inferência". |
| D-10 | 2026-10-22 | Os SVGs só entram no repositório no VL-4 (Fase 3), com a nota de direitos (U7, VL-1) antes. | Fonseca | decidida | `contexto.md` §11 | Responde a pendência de D-04. O Fonseca falou em "Fase 5", que em `CLAUDE.md` é outra coisa; a entrada liga-se ao VL-4. |
| D-11 | 2026-10-22 | O `CLAUDE.md` prevalece: sem subagentes autônomos em runtime; os `SKILL.md` são prompts de sistema de nós de LLM do n8n, sem ferramentas; só se rascunha o que o escopo determinístico permite (06, 07 e 09). | Fonseca | decidida | `contexto.md` §11 | `CLAUDE.md` §2. |
| D-12 | 2026-10-22 | `skills/` é a fonte única dos prompts; o `seed-baseline` leva o texto para a configuração. O formato do `content` é proposta nossa. | Fonseca | decidida | `contexto.md` §11 | `CLAUDE.md` §2 e §9. |
| D-13 | 2026-10-22 | A palavra isolada `100%` sai de `cfm_blocklist`: `numbers.js` cuida da matemática e a lista cuida da semântica legal. `100% eficaz` entra como termo no mesmo dia. | Fonseca | decidida | `contexto.md` §11 | U22. Hoje `config/baseline/cfm_blocklist.json` tem 10 termos, com `100% eficaz`. |
| D-14 | 2026-10-22 | A lista de termos proibidos pode ficar no repositório público; o que fica privado no `editorial-intel` é a metodologia da pesquisa e os casos reais. | Fonseca | decidida | `contexto.md` §11 | Que a lista seja regra pública do CFM e da LGPD é afirmação do Fonseca, não verificada. |
| D-15 | 2026-10-22 | O bloqueio de mídia clínica na v1 é imposto: sem upload de fotos clínicas, antes/depois ou exames; só ilustrações geradas (com selo) ou imagens de banco com crédito. | Fonseca | decidida | `contexto.md` §11 | Desenho em U24. |
| D-16 | 2026-10-23 | (1) Os textos de exemplo dos SVGs saem e entram marcadores neutros (`{{slot_id}}`). (2) O implementer decide onde ficam os blocos movidos, mantendo o espaçamento original; as posições foram aprovadas depois (`assets/brand/README.md`). (3) A automação de legenda e CTA foi retirada. | Fonseca | decidida | `contexto.md` §11 | (3) vira D-17. D-06. |
| D-17 | 2026-10-23 | O CTA é texto inerte na arte, sem automação de engajamento nesta versão. `cta`: campo opcional do `cover_spec`, de 1 a 40 caracteres, só com o slot `cta_label`. `caption`: até 300 caracteres, fora da arte, no contrato `post_copy`. | Fonseca | decidida | `contexto.md` §11; `caption-cta-proposal.md` | Limitação da v0.1: não há template de "slide final". D-16 (3) remete a esta decisão. |
| D-18 | 2026-10-23 | O 380 de `reel-02-overlay` é o topo do overlay do Instagram, e não uma zona própria do texto; os textos do reel-02 respeitam a zona global (260 a 1580). | Fonseca | decidida | `contexto.md` §11 | U23. |

### Série U (contexto.md §10, contracts-proposal.md §7)

| ID | Data | Decisão | Quem | Estado | Fonte | Relação e observações |
| --- | --- | --- | --- | --- | --- | --- |
| U1 | 2026-10-22 | O baseline fica em `editorial.config_baseline`. | usuário | decidida | `contexto.md` §10 | Mesma decisão de D-02. A evidência de schema implantado segue UNKNOWN na fonte. |
| U2 | 2026-10-22 | Campos de `visual_spec`, `cover_spec` e `qa_result`: a proposta de `contracts-proposal.md` foi aprovada (CP-VL3.1, PR #15) e os schemas estão em `contracts/` (PR #20). | Fonseca | decidida | `contracts-proposal.md` (status no topo) | A linha de `contexto.md` §10 ainda mostra o item como aberto. |
| U3 | 2026-10-22 | `grammar_id` é distinto de `template_id`; lista mínima de 5 gramáticas e o mapeamento para templates em `slot-map-v0.md` §5. | Fonseca | decidida | `contracts-proposal.md` §7 | Em `contexto.md` §10, U3 pergunta o conteúdo e o schema de `visual_library` (VL-4): o mesmo ID tem dois sentidos. `visual-library-proposal.md` registra essa parte como implementada; aprovação explícita não está registrada. |
| U4 | — | Resolvido: os módulos permitidos no n8n Cloud, pela lista conferida pelo Fonseca (nota em `contexto.md` §10). Aberto: a engine e o formato do render (SVG × PNG). | Fonseca | aberta | `contexto.md` §10 | Bloqueia VL-5 e VL-6. D-03 propõe SVG no MVP. |
| U5 | — | Schema de `verification_thresholds` e limiares de QA. | — | aberta | `contexto.md` §10 | A chave consta em `CLAUDE.md` §9; o arquivo é planejado. |
| U6 | 2026-10-22 | As regras regulatórias do CFM se aplicam ao domínio: sim. | Fonseca | decidida | `contexto.md` §10 | D-05. A fonte e o conteúdo da regra seguem UNKNOWN (U22). |
| U7 | 2026-10-23 | A declaração de propriedade do markup (22/10/2026, `owned_brand_asset`) vale como registro e fecha o CP-VL1.6 na v0.1; a seção "Proveniência" está em `assets/brand/README.md`. | Fonseca | decidida | `contexto.md` §10 | O assistente não verifica a titularidade. D-04 e D-10. |
| U8 | — | Se a escrita no Figma funciona no seat View. | — | aberta | `contexto.md` §10 | Só design-time. |
| U9 | — | Como semear um job sintético em `INSIGHTS_RANKED` sem violar `guard_transition()`. | — | aberta | `contexto.md` §10 | Bloqueia VL-7. |
| U10 | 2026-10-22 | Formato PT-BR, com vírgula decimal (`9,52`). | Fonseca | decidida | `contexto.md` §10 | — |
| U11 | 2026-10-22 | As perguntas U11-a a U11-o foram respondidas; implementadas nas migrations 001 a 005 (PRs #6, #7 e #8; a 005 sem PR). | Fonseca | decidida | `contexto.md` §10 | Agrupa U11-a a U11-o, abaixo. |
| U12 | 2026-10-22 | Mapa de slots v0 em `slot-map-v0.md`; o orçamento de texto é por largura em pixels, medida por `geometry.js`, e não por contagem de caracteres. | Fonseca | decidida | `contracts-proposal.md` §7 | `contexto.md` §10 agrupa U12 a U17. |
| U13 | 2026-10-22 | `alt_text` é obrigatório. | Fonseca | decidida | `contracts-proposal.md` §7 | — |
| U14 | 2026-10-22 | `rationale` fica, opcional, com no máximo 280 caracteres. | Fonseca | decidida | `contracts-proposal.md` §7 | — |
| U15 | 2026-10-22 | Os ids são uuid em texto, como `editorial.jobs.id`. | Fonseca | decidida | `contracts-proposal.md` §7 | — |
| U16 | 2026-10-22 | A lista de motivos do juiz semântico é a da §6 de `contracts-proposal.md`. | Fonseca | decidida | `contracts-proposal.md` §7 | — |
| U17 | 2026-10-22 | O schema confere o tipo; um validador compara `grammar_id` com a config. Uma só fonte da verdade. | Fonseca | decidida | `contracts-proposal.md` §7 | — |
| U18 | 2026-10-22 | O rodapé do CFM fica na base, com 12 px, branco, centralizado, no formato `[Nome] – MÉDICO – CRM/[UF] [Número]`. Nos 9:16 fica acima da linha de 1580 px (`y = 1540`); nos demais formatos, na base, com margem de 64 px. | Fonseca | decidida | `contexto.md` §10; `contracts-proposal.md` §7 | A posição decidida depois substitui "dentro da faixa de 340 px". Segue UNKNOWN na fonte: a origem de Nome, UF e Número, e se "branco" é `#FFFFFF` ou `--fg`; D-16 (2) registra `#E7E6D9`. A chave `cfm_footer` não existe em `config/baseline/`. |
| U19 | 2026-10-22 | A margem é de 64 px (D-08) e a zona segura é o espaço restante; o erro estava na declaração do template, não nos arquivos. `geometry.js` aplica os 64 px nos quatro lados (PR #19). | Fonseca | decidida | `contexto.md` §10; `contracts-proposal.md` §7 | Ajusta D-08. As faixas dos 9:16 valem por U23. |
| U20 | 2026-10-22 | Em design-time, Arial como fonte de texto e Courier New (monoespaçada) para números e códigos; atualizar no Figma na Fase 5. | Fonseca | decidida | `contexto.md` §10; `contracts-proposal.md` §7 | Arial e Courier New reais nunca foram medidos; as larguras vêm de Liberation Sans e Mono (fonte). |
| U21 | 2026-10-22 | O formato pedido (1:1, 4:5, 9:16) vem do campo `format` do payload do estado `request_received` (contrato H1). | Fonseca | decidida | `contexto.md` §10; `contracts-proposal.md` §7 | Resposta com ressalva: `request_received` não é um dos 17 estados de `CLAUDE.md` §5, e o contrato H1 não está no repositório; o campo não pode ser validado. |
| U22 | 2026-10-22 | A fonte da lista é a planilha privada do Fonseca; lista v0.1 de 10 termos em `config/baseline/cfm_blocklist.json`. | Fonseca | decidida | `contexto.md` §10; `contracts-proposal.md` §7 | D-13 e D-14. A fonte normativa da regra do CFM segue UNKNOWN: o assistente não a verificou. |
| U23 | 2026-10-22 | As faixas de 260 px (topo) e 340 px (base) dos formatos 9:16 continuam valendo, em conjunto com as margens de 64 px; `geometry.js` aplica em cada lado o maior dos dois limites (PR #26). Nada é isento. | Fonseca | decidida | `contexto.md` §10 | Ajusta D-08. Premissas do assistente a confirmar, e a faixa 380 a 1600 do `reel-02-overlay`, na fonte: ver D-18. |
| U24 | 2026-10-22 | O bloqueio de mídia clínica tem duas camadas: o JSON Schema de `image_assets` só aceita `generated_illustration` e `stock_licensed` em `images[]`; `owned_photo` exige o `approval_id` de um registro em `editorial.image_approvals`, que só `human_reviewer` grava. Foto clínica é recusada sempre. | Fonseca | decidida | `contexto.md` §10 | Desenho de D-15. Substitui o flag `human_approved: true` do payload (`image-assets-proposal.md`). Em aberto na fonte: o estágio da aprovação do upload, a revogação e o registro de auditoria das recusas. |

### Subitens de U11 (schema-contract.md)

| ID | Data | Decisão | Quem | Estado | Fonte | Relação e observações |
| --- | --- | --- | --- | --- | --- | --- |
| U11-a | 2026-10-22 | `state_transitions` tem `from_status`, `to_status` e `is_error_path` (booleano). | Fonseca | decidida | `schema-contract.md` §10 | O Fonseca acrescentou `requires_gate` no mesmo dia (`schema-contract.md` §11). |
| U11-b | 2026-10-22 | Os estados de erro têm transições explícitas de entrada e de saída. | Fonseca | decidida | `schema-contract.md` §10 | As saídas foram ampliadas por U11-i. |
| U11-c | 2026-10-22 | `get_config` não lê o schema privado: o público funciona sozinho. | Fonseca | decidida | `schema-contract.md` §10 | `CLAUDE.md` §9. |
| U11-d | 2026-10-22 | `set_status` valida a transição chamando `guard_transition` de forma explícita. | Fonseca | decidida | `schema-contract.md` §10 | `CLAUDE.md` §5: não é trigger. |
| U11-e | 2026-10-22 | O `job_id` é UUID. | Fonseca | decidida | `schema-contract.md` §10 | U15. |
| U11-f | 2026-10-22 | O papel `n8n_pipeline` tem permissões mínimas: EXECUTE nas funções e SELECT nas tabelas. | Fonseca | decidida | `schema-contract.md` §10 | A parte do SELECT foi substituída pela decisão sem ID de `schema-contract.md` §15 (ver abaixo). |
| U11-g | 2026-10-22 | Tudo vive no schema `editorial`. | Fonseca | decidida | `schema-contract.md` §10 | — |
| U11-h | 2026-10-22 | A tabela `jobs` fica no schema `editorial`. | Fonseca | decidida | `schema-contract.md` §12; `contexto.md` §10 | — |
| U11-i | 2026-10-22 | Os estados de erro voltam ao estado de trabalho de origem, além de `NEEDS_REVIEW`. | Fonseca | decidida | `schema-contract.md` §12; `contexto.md` §10 | Amplia U11-b. |
| U11-j | 2026-10-22 | As assinaturas ficam em `editorial.signatures`; `guard_transition` recebe o `job_id` e exige aprovação registrada. | Fonseca | decidida | `schema-contract.md` §12; `contexto.md` §10 | — |
| U11-k | 2026-10-22 | Nenhum estado novo: só `AWAITING_APPROVAL` e `HUMAN_APPROVED` (a máquina fica com 17 estados). | Fonseca | decidida | `schema-contract.md` §12; `contexto.md` §10 | — |
| U11-l | 2026-10-22 | `NEEDS_REVIEW` sai para `AWAITING_APPROVAL` ou para o estado de trabalho de origem. | Fonseca | decidida | `schema-contract.md` §13; `contexto.md` §10 | As condições do guard (job chegou a `QA_PASSED`; depois do gate a IA não refaz; assinatura vale só depois de o job entrar no estado atual) são escolha do assistente, aprovada na mesma data. |
| U11-m | 2026-10-22 | `decision` é `approved` ou `rejected`; quem grava é o papel `human_reviewer`. | Fonseca | decidida | `schema-contract.md` §13; `contexto.md` §10 | Pendente na fonte: a credencial não pode ficar em workflow sem supervisão. |
| U11-n | 2026-10-22 | `jobs` ganha a proveniência de `CLAUDE.md` §7; `model` fica de fora, por ser por chamada de LLM. | Fonseca | decidida | `schema-contract.md` §13; `contexto.md` §10 | — |
| U11-o | 2026-10-22 | `jobs.attempt_count` guarda as tentativas; o limite de 3 é do código. | Fonseca | decidida | `schema-contract.md` §13; `contexto.md` §10 | O reuso de assinatura por `status_entered_at` é escolha do assistente. |

## Decisões registradas sem ID

Estas decisões estão nos documentos, mas sem `D-nn` nem `U-nn`. Não entraram na tabela porque numerá-las é decisão do Fonseca. **PROPOSED:** numerá-las `D-19` em diante, na ordem desta lista.

| Data | Decisão | Quem | Fonte |
| --- | --- | --- | --- |
| 2026-10-22 | O papel `editorial_owner` é dedicado, sem login, e dono das funções `SECURITY DEFINER`. | Fonseca | `schema-contract.md` §14 |
| 2026-10-22 | Jobs nascem por `create_job(source_origin, input_context, config_source, config_version)`. | Fonseca | `schema-contract.md` §14 |
| 2026-10-22 | A senha do `human_reviewer` fica num cofre separado, nunca no n8n que roda o robô. | Fonseca | `schema-contract.md` §14; `CLAUDE.md` Segurança |
| 2026-10-22 | Um banco por cliente. O schema `editorial` não tem coluna de tenant. | Fonseca | `schema-contract.md` §15; `CLAUDE.md` Segurança |
| 2026-10-22 | `n8n_pipeline` não tem `SELECT` direto: só executa funções `SECURITY DEFINER`. Substitui o SELECT de U11-f. | Fonseca | `schema-contract.md` §15 |
| 2026-10-22 | A aprovação de uma foto própria (`owned_photo`) é um registro no banco que só `human_reviewer` grava (`editorial.image_approvals`). Substitui o flag `human_approved`. A escolha entre tabela nova e `signatures` foi do assistente. | Fonseca | `schema-contract.md` §16 |
| 2026-10-22 | `human_reviewer` é papel de banco e o banco não distingue pessoa de workflow; a credencial dele não fica em workflow sem supervisão. | Fonseca | `schema-contract.md` §13 |
| 2026-11-07 | Contratos `evidence`, `verification`, `insight` e `job_ref` decididos (limites 1000 e 300; página a partir de 1; as demais recomendações). | Fonseca | `docs/evidence-contract-proposal.md`, `verification-contract-proposal.md`, `insight-contract-proposal.md`, `job-ref-contract-proposal.md` |
| 2026-11-07 | A página citada é a numeração impressa na página, e não a posição no arquivo. Em aberto: como o número impresso é obtido (`citation.js` usa a posição no arquivo). | Fonseca | `docs/evidence-contract-proposal.md` §6 |
| 2026-11-07 | Itens A1 a A6, B1 e C1 a C4 da atualização do `CLAUDE.md` (v1.2), e a ordem S4, S3, S5, S7, S6 para as sugestões. | Fonseca | `docs/claude-md-update-proposal.md` (status no topo) |
| 2026-11-07 | `page` é a posição da página no arquivo PDF, a partir de 1, "se for mais fácil"; o número impresso na página não entra no contrato. Substitui a linha anterior sobre a numeração impressa, cujo ponto em aberto fica fechado. | Fonseca | `docs/evidence-contract-proposal.md` §6 |

## Divergências encontradas nas fontes

Conferidas em 2026-11-07 contra a árvore de `main`. Este registro não as corrige; cada correção é uma PR própria, a aprovar.

1. **PRs "abertas" que já foram mergeadas.** D-08 e U23 citam a PR #26 (aberta em D-08, mesclada em U23); D-13 e U22 citam a PR #25 como aberta. Pela API do GitHub, #25 e #26 estão `MERGED`, e `config/baseline/cfm_blocklist.json` tem `100% eficaz`.
2. **D-15 e U24 dizem "implementado em PRs abertas, sem veredito; nada no `main` impõe o bloqueio ainda".** `main` tem `contracts/image_assets.schema.json`, `validators/media.js` e a migration `008_image_approvals.sql`.
3. **D-17 diz "em PRs abertas".** `caption-cta-proposal.md` (status no topo) registra a implementação nas PRs #42 a #45.
4. **U2 aparece aberto em `contexto.md` §10**, mas `contracts-proposal.md` (status no topo) registra a aprovação de 2026-10-22 e a implementação.
5. **U1 diz que o `CLAUDE.md` §9 "ainda cita as duas formas".** Hoje o `CLAUDE.md` cita só `editorial.config_baseline`.
6. **U3 tem dois sentidos** (`contexto.md` §10 e `contracts-proposal.md` §7).
7. **D-04 ainda descreve os SVGs fora do repositório**, e `assets/brand/` está nele.
8. **U11-f diz que `n8n_pipeline` tem SELECT nas tabelas.** A decisão de `schema-contract.md` §15 retirou esse privilégio.
9. **`contexto.md` §11 se chama "Decisões pendentes"** e mistura decididas, propostas e abertas. D-01, D-03, D-06, D-07 e D-09 não têm decisão registrada.
