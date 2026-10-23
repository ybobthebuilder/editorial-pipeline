# Proposta da Fase 4: infraestrutura n8n (contrato dos helpers, lacunas e o que falta de fonte)

> Status: **PROPOSED**, para revisão por digest (`reviewed_commit_sha = null`). Não autoriza merge e **não cria nenhum workflow, script nem JSON de n8n**.
> Rótulos: **VERIFIED** (lido nas migrations ou nos documentos do repositório), **PROPOSED** (desenho meu), **UNKNOWN** (sem fonte; vira pergunta na §7).
> Companheiros: `CLAUDE.md` (esqueleto dos workflows, Segurança), `docs/STAGES.md` (§3 template, §5 erros, §8 convenções), `supabase/migrations/001` a `008`, `docs/PUBLIC_PRIVATE.md`.

## 1. Por que esta proposta é só texto

A Fase 4 (`CLAUDE.md`) entrega `90_DB_HELPERS`, `99_ERROR_HANDLER` e `_TEMPLATE_STAGE`, mais as ferramentas de export e sanitização. Tudo isso é JSON de n8n: tipos de nó, nomes de parâmetro, forma do bloco de credenciais, chaves de configuração do workflow.

- **UNKNOWN, e bloqueado nesta sessão:** não há fonte para nenhum desses campos no repositório, e `docs.n8n.io` não é alcançável daqui (o túnel do proxy responde 403 e a resolução de nome falha; testado em 2026-10-23). Pela regra do projeto (nunca inventar campo de nó do n8n), **nenhum JSON de workflow é escrito antes de a fonte chegar** (Q3).
- O que dá para fechar agora, com fonte, é o **contrato do banco** que os workflows consomem (§2) e as **lacunas** entre `STAGES.md` e o que as migrations realmente entregam (§3).

## 2. Contrato do `90_DB_HELPERS` (VERIFIED nas migrations 001 a 008)

O n8n conecta como `n8n_pipeline`, que **não tem privilégio sobre nenhuma tabela**: só `EXECUTE` nestas 8 funções, todas `SECURITY DEFINER`. Um helper é uma consulta de uma função, e só isso.

| Helper | Consulta | Devolve | Erros (SQLSTATE) |
| --- | --- | --- | --- |
| `get_job` | `SELECT * FROM editorial.get_job($1)` | 1 linha, 13 colunas: `id, status, created_at, updated_at, source_origin, input_context, config_source, config_version, last_stage, last_execution_id, attempt_count, previous_status, status_entered_at` | `no_data_found` (job inexistente) |
| `get_job_status` | `SELECT editorial.get_job_status($1)` | `text` | `no_data_found` |
| `get_config` | `SELECT editorial.get_config($1)` | `jsonb` `{ content, source, version, hash }`; `source` é sempre `public` | `no_data_found` (chave ausente, sem valor padrão) |
| `create_job` | `SELECT editorial.create_job($1, $2::jsonb, $3, $4)` | `uuid` | restrições de `jobs` (`check_violation`) |
| `mark_running` | `SELECT editorial.mark_running($1, $2, $3)` | `integer`: `attempt_count` depois de somar 1 | `invalid_parameter_value` (etapa fora de `^[0-9]{2}_[A-Z0-9_]+$` ou `execution_id` vazio), `no_data_found`, `check_violation` (job em `VERIFICATION_FAILED`, `RENDER_FAILED`, `QA_FAILED`, `NEEDS_REVIEW` ou `PUBLISHED`) |
| `set_status` | `SELECT editorial.set_status($1, $2)` | `void` | `check_violation` (transição inválida, job fora do estado de origem ou gate sem assinatura), `no_data_found` |
| `find_jobs_by_execution` | `SELECT * FROM editorial.find_jobs_by_execution($1)` | **zero ou mais** `uuid`, o mais recente primeiro | `invalid_parameter_value` (id vazio) |
| `get_image_approvals` | `SELECT * FROM editorial.get_image_approvals($1)` | zero ou mais linhas `id, job_id, ref, subject, signed_at` | `no_data_found` (job inexistente) |

Regras do contrato (**PROPOSED**, a confirmar):

1. **Parâmetros sempre ligados, nunca concatenados** na string SQL. Como o n8n liga parâmetros é UNKNOWN (Q3); a regra vale para qualquer forma.
2. **Só estas 8 consultas.** Nenhum `SELECT` em tabela, nenhum `UPDATE`, nenhum DDL. O papel nem teria permissão, e uma checagem estática do export (§5) recusa qualquer outra consulta.
3. **Status nunca é escrito direto**: só `set_status`. A tentativa é de `mark_running`, e o limite de 3 é do orquestrador (`CLAUDE.md` §5).
4. **Erro do banco é erro do workflow**: nenhum helper engole exceção. O `99_ERROR_HANDLER` classifica (§4).

## 3. Lacunas entre `STAGES.md` e o repositório (VERIFIED)

| ID | Lacuna | Efeito | Pergunta |
| --- | --- | --- | --- |
| L1 | `STAGES.md` §3 passo 7 manda **persistir** linhas (`evidence`, `verification`, `insights`, `visual_specs`, `cover_specs`, `qa_results`, `llm_calls`) e §5 manda o handler **registrar em `job_events`**. Essas tabelas são do schema **`editorial_intel`** (privado, `CLAUDE.md`), e `n8n_pipeline` não tem privilégio sobre tabela nenhuma. Também **não existe** função de escrita para elas: o DDL delas não está neste repositório | os passos Persist, Log LLM Calls e o registro de erro **não têm como funcionar** hoje, nem para o `_TEMPLATE_STAGE` | Q1 |
| L2 | **Um banco por cliente** (`CLAUDE.md`): `job_id` é único **por banco**, mas o `_TEMPLATE_STAGE` recebe só `job_id` | o orquestrador precisa passar também **qual conexão** usar, senão um `job_id` de um cliente pode ser lido no banco de outro | Q2 |
| L3 | `STAGES.md` §3 passo 2: "config baseline/override". A sobreposição privada **não existe** nesta versão (U11-c) | o texto do template promete um fallback que o banco não tem | ajustar o texto; sem pergunta |
| L4 | `STAGES.md` §5: o handler "localiza o job pela `last_execution_id`", e `find_jobs_by_execution` devolve **zero ou vários** | o handler precisa tratar 0 (execução que não chegou a `mark_running`), 1 e N jobs | Q4 |
| L5 | `mark_running` recusa job em estado de erro ou `PUBLISHED`; o retry de `RENDER_FAILED` e `QA_FAILED` só ocorre depois de `set_status` para o estado de retry | o orquestrador (ou o handler) tem de mover o job de `*_FAILED` para o estado de origem **antes** de chamar a etapa de novo; isso não está escrito em nenhum card | Q4 |
| L6 | `CLAUDE.md` (Segurança) manda `gitleaks` como pre-commit hook e no CI. **Não há** configuração de `gitleaks` no repositório nem passo no CI (`validators.yml` e `migrations.yml` não o têm) | hoje nada varre segredo num export de workflow nem em nenhum arquivo; a sanitização do §5 é a única barreira | Q7 |

## 4. `99_ERROR_HANDLER` e `_TEMPLATE_STAGE`: o que se pode afirmar sem JSON

Só a lógica, em termos de helpers (**PROPOSED**):

- **`_TEMPLATE_STAGE`**: segue os 11 passos de `CLAUDE.md`, em ordem. O Guard compara `get_job_status` (ou `get_job.status`) com `EXPECTED_STATUS` e para com erro se diferir. `mark_running` vem **depois** do Guard. Antes de `set_status`, o contrato da etapa tem de ter passado nos validadores (`schema.js` e os de negócio).
- **`99_ERROR_HANDLER`**: (1) `find_jobs_by_execution(execution_id)`; (2) 0 jobs: encerra e registra que a execução não tocou job algum; (3) N jobs: trata cada um; (4) classifica **retryable** ou **fatal** por regra de código sobre o erro do banco ou do validador (`check_violation` de transição inválida e `invalid_parameter_value` são fatais; falha de rede e `deadlock_detected` são retryable; **PROPOSED**, a confirmar); (5) fatal: `set_status(job_id, 'NEEDS_REVIEW')`, permitido de qualquer estado. O registro em `job_events` depende da L1.
- **Idempotência**: o handler pode rodar duas vezes para a mesma execução e não pode duplicar efeito: `set_status` para `NEEDS_REVIEW` de um job que já está em `NEEDS_REVIEW` precisa ser tratado (a transição existe? **UNKNOWN**: `NEEDS_REVIEW → NEEDS_REVIEW` não está em `CLAUDE.md` §5; Q4).

## 5. Sanitização do export (contrato de intenção; campos **UNKNOWN**)

Regra de `CLAUDE.md` e `STAGES.md` §8: o JSON público não leva credenciais, `pinData`, URLs privadas nem segredos. A **forma** da verificação é desenho meu:

- **Lista de permissão, não de proibição** (falha fechado): o verificador conhece as chaves permitidas em cada nível do export e **recusa** o que não conhece. Uma lista de proibição deixa passar o campo que ninguém previu. Quais são as chaves é UNKNOWN até a Q3.
- **Consultas SQL**: toda string SQL de nó Postgres tem de ser **exatamente** uma das 8 consultas da §2, sem interpolação de expressão dentro do texto da consulta.
- **Nenhum host, URL com credencial, token nem identificador de credencial**: o verificador falha se encontrar um valor que pareça segredo (os padrões do `gitleaks`; ver L6) ou um host que não seja marcador.
- **Determinismo**: a sanitização é idempotente (rodar duas vezes dá o mesmo arquivo) e `--check` falha se o arquivo mudaria.
- **Ferramentas planejadas** (`scripts/sanitize-workflow`, `n8n-pull`, `n8n-push`): `CLAUDE.md` as lista em TypeScript; o repositório não tem toolchain TS e a regra é "sem dependências". Proponho **JS puro com `node:test`**, como `scripts/seed-baseline.js` (Q5). `n8n-push` e `n8n-pull` precisam de chave de API do n8n e de rede, que esta sessão não tem; ficam fora do que eu consigo testar.

## 6. Ordem proposta, uma PR por item (cada uma só depois do item anterior e da fonte da Q3)

1. `docs/STAGES.md`: corrigir L3 e escrever L4/L5 (só texto).
2. Decisão da L1 e da L2 (contrato, antes de qualquer workflow): se a resposta for "funções `SECURITY DEFINER` no `editorial_intel`", o DDL é do repositório privado e **o que eu escrevo aqui é só o contrato** do que o público espera (nome, argumentos e retorno de cada função de escrita).
3. `scripts/sanitize-workflow.js` e seus testes, com **amostras sintéticas montadas a partir da fonte da Q3**.
4. `n8n/workflows/90_DB_HELPERS.json` (as 8 consultas), com um teste estático que confere as consultas contra a §2.
5. `n8n/workflows/_TEMPLATE_STAGE.json` e `99_ERROR_HANDLER.json`.
6. Só então os workflows das etapas (VL-6).

**Validação de cada item de 3 a 5:** `node --test` sobre o verificador estático e o `sanitize-workflow --check` no CI. **O que nenhum teste daqui prova:** que o workflow **executa** no n8n Cloud. Isso exige uma instância e é revisão humana, ou um ambiente de teste que o Fonseca indique.

## 7. Perguntas abertas

| ID | Pergunta | Recomendação |
| --- | --- | --- |
| Q1 | Como o n8n persiste linhas e registra eventos (L1) se `n8n_pipeline` não lê nem grava tabela e o DDL de `editorial_intel` é privado? Funções `SECURITY DEFINER` no `editorial_intel`, uma por tabela, no mesmo padrão da 007 e da 008? | sim, uma função de escrita por tabela, idempotente por `(job_id, stage)`; o público documenta o contrato, o privado implementa |
| Q2 | Como o orquestrador diz qual banco usar ao disparar uma etapa (L2)? | `job_id` mais um identificador de cliente no payload do disparo; o n8n resolve a conexão pelo identificador. Preciso do nome do campo |
| Q3 | **A fonte dos campos de n8n.** Um export JSON **sintético e sanitizado** de um workflow pequeno que tenha: o gatilho "When Executed by Another Workflow", um nó Postgres com consulta e parâmetros, um Error Trigger, o nó que chama outro workflow, e as configurações de workflow (workflow de erro, fuso, salvar execuções). Ou os trechos da documentação oficial sobre cada um | export de amostra; sem ele, nenhum JSON |
| Q4 | `NEEDS_REVIEW → NEEDS_REVIEW` é permitido? Quem tira o job de `*_FAILED` para o estado de retry, o orquestrador ou o handler? E 0 ou N jobs por execução, como se trata? | o orquestrador move `*_FAILED` para o estado de origem; o handler ignora job já em `NEEDS_REVIEW` (sem erro); 0 jobs só registra |
| Q5 | `sanitize-workflow`, `n8n-push` e `n8n-pull` em TypeScript (como em `CLAUDE.md`) ou em JS puro? | JS puro, sem toolchain nova; `push` e `pull` ficam para quando houver rede e chave de API |
| Q6 | Existe uma instância de n8n (Cloud ou de teste) onde um workflow possa ser importado e executado para validar? | sim, uma de teste, sem dados reais |
| Q7 | Posso acrescentar o passo de `gitleaks` ao CI (e a configuração) antes dos primeiros workflows? | sim, em PR própria, antes de qualquer export de workflow entrar |

## 8. O que esta proposta não faz

Não escreve workflow, nó, parâmetro de nó nem chave de configuração de n8n. Não cria função de escrita para `editorial_intel` (o DDL é privado). Não altera o banco, os validadores nem o render. Não verifica a documentação do n8n: não há acesso a ela nesta sessão.
