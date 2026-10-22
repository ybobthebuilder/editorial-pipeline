# Contrato de schema — Fase 1 (proposta para revisão)

> Status: **PROPOSED**. Não é SQL e não autoriza migration. Revisão por digest SHA-256 com `reviewed_commit_sha = null`; não autoriza merge.
> Objetivo: fechar U11 com o mínimo necessário para escrever `001_init_editorial_schema.sql`, sem inventar colunas, tipos ou assinaturas.
> Rótulos: **VERIFIED** (citado num arquivo do repo, em qualquer nível de detalhe) · **PROPOSED** (desenho nosso, para aprovação) · **UNKNOWN** (sem fonte; bloqueia até decisão).

## 1. Estado do repo (VERIFIED em `e821de1…` e `claude/docs-visual-layer`)

- Nenhuma migration, nenhum `.sql` e nenhum diretório `supabase/` existem. `CLAUDE.md` marca isso como esperado (planejado, não implantado).
- Os nomes `state_transitions`, `config_baseline`, `guard_transition()`, `mark_running()`, `set_status()` e `get_config()` aparecem apenas em `CLAUDE.md`, `docs/STAGES.md`, `docs/PUBLIC_PRIVATE.md`, `docs/ALUCINAÇÃO_GUARD.md` e nos documentos `visual-layer`. Nenhum deles define colunas, tipos ou corpo de função.

## 2. Objetos citados e o que cada fonte diz

| Objeto | Onde é citado | O que está dito | O que falta |
| --- | --- | --- | --- |
| `state_transitions` | `CLAUDE.md` §5, §9; `PUBLIC_PRIVATE.md` | "define transições válidas"; schema `editorial` | colunas (origem, destino, ?), chave primária, tipo dos estados |
| `config_baseline` | `CLAUDE.md` §9, schema `editorial`; `PUBLIC_PRIVATE.md` | "espelho do repo público" | colunas (chave, conteúdo, versão, hash, ?), chave primária, schema de destino (**U1 decidido**: `editorial`) |
| `guard_transition()` | `CLAUDE.md` §5 | "trigger que rejeita saltos inválidos" | tipo (trigger ou função), tabela de disparo, assinatura, comportamento de erro |
| `mark_running(job_id, stage, execution_id)` | `STAGES.md` §3 e §6 | chamada com três argumentos | tipo de retorno, o que grava, em qual tabela |
| `set_status(job_id, NEXT_STATUS)` | `STAGES.md` §6, `CLAUDE.md` §8 | chamada com dois argumentos | tipo de retorno, leitura de `state_transitions`, erro |
| `get_config(key)` | `CLAUDE.md` §9, `PUBLIC_PRIVATE.md` §4 | retorna `{ content, source, version, hash }` | tipo de retorno (JSON ou tabela?), ordem de resolução implementada, se é `SECURITY DEFINER` |
| `editorial_intel.jobs` | `CLAUDE.md` (schema `editorial_intel`) | tabela de jobs | colunas, status, chave; **mora no schema privado** |

## 3. Restrição que a Fase 1 precisa respeitar (VERIFIED)

`CLAUDE.md` §9 e `ALUCINAÇÃO_GUARD.md` §4: o público funciona sem o privado, e `editorial-intel` não é importado pelo `editorial-pipeline`. Logo, **a máquina de estados não pode depender de `editorial_intel.jobs` para validar transições**. Se `guard_transition()` precisa ler a tabela de jobs, ela cruza a fronteira. Essa é a primeira pergunta de U11, e não há resposta nas fontes.

## 4. Proposta de contrato mínimo (PROPOSED)

Isto é o menor conjunto que permite escrever a migration com testes. Cada item tem a origem da proposta.

### 4.1 `editorial.state_transitions`
- `from_status text not null` — origem: estados de `CLAUDE.md` §5.
- `to_status text not null` — idem.
- `primary key (from_status, to_status)` — proposta; evita duplicar transições.
- Restrição: `from_status` e `to_status` pertencem ao enum de 13 estados + erros + `NEEDS_REVIEW`. Enum fechado (`CLAUDE.md` §8).
- Conteúdo inicial: as transições do caminho feliz de `CLAUDE.md` §5, mais as de erro. **Os erros de origem não estão listados** (ver U11-b).

### 4.2 `editorial.config_baseline`
- `key text primary key` — origem: chaves de `CLAUDE.md` §9.
- `content jsonb not null` — UNKNOWN se é `jsonb` ou `text`; proposta: `jsonb`, porque os arquivos `config/baseline/*.json` são JSON.
- `version text not null`, `hash text not null` — origem: `get_config` retorna `version` e `hash`.
- `checksum` ou `hash` deve bater com `config/baseline/.checksums` (`PUBLIC_PRIVATE.md` §4, passo 4).

### 4.3 Funções (assinaturas propostas, corpo **não** proposto)
- `editorial.get_config(p_key text) returns jsonb` — retorno `{content, source, version, hash}`; `source` é `'public'` ou `'private'`. Corpo depende de U11-c.
- `editorial.mark_running(p_job_id uuid, p_stage text, p_execution_id text) returns void` — **UNKNOWN**: tipo do `job_id` (uuid ou `NX-…`?), tipo de retorno e tabela gravada.
- `editorial.set_status(p_job_id uuid, p_next_status text) returns void` — mesma pendência de tipo; deve chamar `guard_transition` implicitamente ou explicitamente? (U11-d).
- `editorial.guard_transition()` — trigger ou função? **UNKNOWN**. Se trigger, sobre qual tabela e em qual evento?

Enquanto as pendências de tipo não forem respondidas, as assinaturas acima são **proposta, não contrato**. Nenhuma migration pode ser escrita com elas.

## 5. Perguntas que bloqueiam a migration (UNKNOWN)

| ID | Pergunta | Por que bloqueia | Quem responde |
| --- | --- | --- | --- |
| U11-a | `state_transitions` tem colunas além de origem e destino? (ex.: `requires_gate`, `is_error_path`) | define o enum e os testes de transição | Fonseca |
| U11-b | Os erros (`VERIFICATION_FAILED`, `QA_FAILED`, `RENDER_FAILED`, `NEEDS_REVIEW`) têm transições de entrada e de saída explícitas? | sem isso, o `guard` recusa o rewind manual de `CLAUDE.md` §5 | Fonseca |
| U11-c | `get_config` lê `editorial_intel.config_overrides` (privado)? Se sim, o público passa a depender do privado. | viola `CLAUDE.md` §9 se for sim sem camada de fallback documentada | Fonseca |
| U11-d | `set_status` valida a transição sozinho, ou depende de `guard_transition` como trigger? | define se o teste de `CP-VL7.1` é de função ou de trigger | Fonseca |
| U11-e | Tipo do `job_id`: `uuid`, `text` com padrão `NX-AAAA-MM-DD-NNN` (do relatório) ou outro? | assinaturas acima; proposta atual é `uuid`, **sem fonte** | Fonseca |
| U11-f | Qual role executa as funções? `n8n_pipeline` (`CLAUDE.md` §segurança) precisa de `EXECUTE` em quais funções e de `SELECT` em qual schema? | RLS e grants da migration | Fonseca |
| U11-g | Em qual schema vivem as funções: `editorial` ou `public`? `CLAUDE.md` diz `editorial`; `PUBLIC_PRIVATE.md` também. Confirmar. | nome qualificado nas migrations | Fonseca |

## 6. O que sai do bloqueio quando U11 fechar

1. Migration `001_init_editorial_schema.sql` com `state_transitions`, `config_baseline`, funções, trigger e grants, conforme as respostas.
2. Teste em Postgres limpo no CI (`CLAUDE.md` §segurança): aplica a migration, insere transições válidas e espera rejeição das inválidas.
3. Só então `CP-VL6.1` pode ser marcado.

Nenhum item acima autoriza escrever a migration antes de U11-a a U11-g estarem respondidos.

## 7. Decisões pedidas

| ID | Decisão | Recomendação (PROPOSED) |
| --- | --- | --- |
| S-01 | Aprovar a estrutura deste documento como base para U11 | sim, como ponto de partida para as perguntas |
| S-02 | Responder U11-a a U11-g | Fonseca responde a partir do dump do schema real, se existir; caso contrário, a partir de decisão explícita registrada |
| S-03 | Autorizar a migration só depois de U11 fechado | sim; a migration sem resposta vira invenção |

## 8. Desconhecidos que sobrevivem a esta proposta

- Nenhum tipo ou corpo de função foi verificado em banco real. Todas as assinaturas são PROPOSED.
- A relação entre a máquina de 13 estados (`CLAUDE.md`) e a de 16 estados do relatório NATURE.exe **não é tratada aqui**; o relatório é design-time (decisão do usuário, 2026-10-22).

## 9. Revisão

- Digest SHA-256 deste arquivo é registrado no PR de revisão, com `reviewed_commit_sha = null`.
- Revisão de documento não autoriza merge nem migration.

## 10. Respostas do Fonseca (2026-10-22) e o que foi implementado

Este bloco não altera as seções 1 a 9, que continuam como foram revisadas. Ele registra as respostas e o estado de cada uma.

| ID | Resposta | Implementação |
| --- | --- | --- |
| U11-a | `state_transitions` tem `from_status`, `to_status` e `is_error_path` (booleano) | `supabase/migrations/001_init_editorial_schema.sql` (branch `claude/migration-001`). Constraint `state_transitions_error_flag` |
| U11-b | Estados de erro têm entrada e saída explícitas | Entradas: 03_VERIFY, 08_RENDER, 09_QA. Saídas: só `NEEDS_REVIEW`. Ver U11-i |
| U11-c | `get_config` NÃO lê o schema privado. O público funciona sozinho | `get_config` lê só `editorial.config_baseline`; `source` é sempre `public`; chave ausente levanta erro |
| U11-d | `set_status` valida a transição chamando `guard_transition` de forma explícita | `guard_transition(from, to)` é função. `set_status` NÃO está na migration (depende de U11-h) |
| U11-e | `job_id` será UUID | Sem tabela de jobs na migration. Aplica-se quando U11-h fechar |
| U11-f | Role `n8n_pipeline` com permissões mínimas: EXECUTE nas funções, SELECT nas tabelas | Role `NOLOGIN`; SELECT nas duas tabelas; EXECUTE nas duas funções; RLS com política de SELECT |
| U11-g | Tudo no schema `editorial` | Schema `editorial` |

**Verificação:** 16 testes contra Postgres 16.15 limpo, na migration aplicada em uma transação com `ON_ERROR_STOP`. Nove mutantes que alteram comportamento foram detectados. Um mutante é equivalente: um `IF p_from = p_to` que levanta erro não muda nada, porque o guard já recusa auto-laços por não haver linha `X → X`.

### Conflitos com a documentação do projeto (não resolvidos por mim)

1. **`CLAUDE.md` §5 fala em trigger `guard_transition()`.** A decisão U11-d é função chamada explicitamente. `CLAUDE.md` §5 e `STAGES.md` §2 precisam de atualização. Não alterei esses documentos.
2. **`CLAUDE.md` §9 e `PUBLIC_PRIVATE.md` §4 dizem que `get_config` resolve o override privado primeiro.** A decisão U11-c diz o contrário. Esses documentos precisam de atualização, e o fallback documentado ainda não existe.
3. **Exemplo `copy_draft → verification_failed`.** `copy_draft` é nome do relatório NATURE.exe, que é design-time. Em `CLAUDE.md`, `VERIFICATION_FAILED` é gravado pelo 03_VERIFY, a partir de `EVIDENCE_EXTRACTED`. A migration usa os nomes do `CLAUDE.md`.
4. **"Qualquer estado → NEEDS_REVIEW" (`CLAUDE.md` §5)** foi lido literalmente: inclui `PUBLISHED` e os três estados de erro. Se `PUBLISHED` deve ficar de fora, é uma linha a remover.

### Perguntas novas (UNKNOWN)

| ID | Pergunta | Bloqueia | Quem responde |
| --- | --- | --- | --- |
| U11-h | Onde vive a tabela de jobs. `CLAUDE.md` diz `editorial_intel.jobs`; a decisão U11-g diz `editorial`. `set_status` e `mark_running` dependem disso, e o público não pode depender do privado | `set_status`, `mark_running`, VL-6 | Fonseca |
| U11-i | Saídas dos estados de erro e rewind manual. Só `NEEDS_REVIEW` tem saída definida. Uma etapa que falhou (ex.: `VERIFICATION_FAILED`) não tem caminho de retry: o guard recusa voltar a `EVIDENCE_EXTRACTED` | retry de etapa, VL-7 (U9) | Fonseca |

### Migration

- Branch `claude/migration-001`, commit `3276ff2c0b41871348095d683d0d2aae9ffeb570`. Sem PR.
- Teste: `PGHOST=… PGPORT=… PGUSER=postgres node --test tests/migrations/001_init_editorial_schema.test.js`. Se `PGHOST` não estiver definido, o teste falha com mensagem; não pula em silêncio.

## 11. Alteração de 2026-10-22: requires_gate

O Fonseca acrescentou `requires_gate boolean` a `state_transitions`. A seção 10 descrevia só `from_status`, `to_status` e `is_error_path`; esta seção registra a mudança.

**Implementado** (`claude/migration-001`, commit `1a91b7b0a68f7b4122fdbfe290ee67570266b699`):
- `requires_gate` é `NOT NULL` e vale `true` só em `AWAITING_APPROVAL → HUMAN_APPROVED`, o único gate humano em `CLAUDE.md` §5 e `STAGES.md` §10–11.
- `guard_transition` recusa toda transição com `requires_gate = true`, com a mensagem "transição exige aprovação humana registrada". Sem registro de assinatura, isso é falha fechada: a transição fica impossível. Não é aprovação por omissão.
- Testes: 19 de 19. Três mutantes detectados: guard ignorando o gate, coluna anulável e gate deslocado para a transição errada.

**Não implementado, e por quê:**
1. **Verificação de assinatura.** A regra "só passa com assinatura registrada" depende de uma tabela de registros de aprovação. Nenhuma fonte do repositório a define. Criá-la seria inventar a estrutura. O guard recusa em vez de checar.
2. **`brief_approved`, `content_approved` e `design_approved` não são estados.** Não existem em `CLAUDE.md`. Aparecem no relatório NATURE.exe (design-time). Adicioná-los mudaria a máquina de estados de 17 para 20 estados.

**Consequência de interface.** Verificar uma assinatura exige saber qual job está transitando. Hoje `guard_transition(from, to)` não recebe `job_id`. Quando U11-j fechar, a assinatura do guard muda, e o `set_status` (fora desta migration) acompanha.

**`is_error_path`.** Está registrada e consistente com o destino (constraint `state_transitions_error_flag`). Nenhuma função a lê ainda. O rewind a partir de estados de erro depende de U11-i.

| ID | Pergunta | Bloqueia | Quem responde |
| --- | --- | --- | --- |
| U11-j | Onde registrar assinaturas humanas: tabela, colunas, quem grava, e se vive em `editorial` ou `editorial_intel`. Decide também se `guard_transition` passa a receber `job_id` | verificação do gate, `set_status` | Fonseca |
| U11-k | Os gates de brief, conteúdo e design do relatório entram na máquina do banco? Como estados novos (muda `CLAUDE.md`) ou reutilizando `HUMAN_APPROVED` | gates do relatório | Fonseca |


## 12. Migration 002: jobs, assinaturas e rebobinamento (2026-10-22)

Decisões do Fonseca, implementadas em `claude/migration-002` (`0329c4c`, sobre `001`). PR só para a governança (#5).

| ID | Decisão | Implementação |
| --- | --- | --- |
| U11-h | `jobs` no schema `editorial` | `editorial.jobs`: `id uuid`, `status text` (padrão `RECEIVED`, CHECK nos 17 estados), `created_at`, `updated_at` (`timestamptz`, padrão `now()`). Sem trigger em `updated_at`: quem muda o status (`set_status`, futuro) grava |
| U11-i | estados de erro voltam ao estado de trabalho de origem, além de `NEEDS_REVIEW` | `VERIFICATION_FAILED → EVIDENCE_EXTRACTED`, `RENDER_FAILED → COVERS_SPECIFIED`, `QA_FAILED → COVERS_RENDERED`. Nenhuma exige gate. Cada estado de erro tem uma única entrada em `001`, então a saída de retry é a aresta de origem |
| U11-j | tabela de assinaturas; o guard recebe `job_id` | `editorial.signatures` com as colunas pedidas. `guard_transition(job_id uuid, p_from, p_to)` substitui a versão de dois argumentos |
| U11-k | nenhum estado novo | Só `AWAITING_APPROVAL` e `HUMAN_APPROVED`. A máquina continua com 17 estados |
| PUBLISHED → NEEDS_REVIEW | mantido | Já existe em `001`; `002` não muda |

**Ordem de checagem do guard** (não escreve nada):
1. transição inexistente: `transição inválida`
2. job inexistente: `job inexistente`
3. job que não está em `p_from`: `job … está em X, não em Y`. **Escolha minha, não pedida.** O guard recebe o job, então confere o estado dele
4. aresta com `requires_gate` sem assinatura `approved` para este job: `transição exige aprovação humana registrada`

**Assinaturas: o que é decisão e o que é proposta**
- `crm_uf`: uma das 27 UFs (CHECK). PROPOSTA de forma fechada; a confirmar.
- `decision`: `approved` ou `rejected`. PROPOSTA, não definida pelo Fonseca. O guard só aceita `approved`.
- `reviewer_name`: não pode ser vazio.
- Gravação: `n8n_pipeline` não tem INSERT, UPDATE nem DELETE em `signatures`. Quem grava é um papel humano, que ainda não existe.
- Número do CRM: fora do contrato. Só a UF é gravada.

**Perguntas abertas** (U11-l a U11-o em `contexto.md`):
- Saída de `NEEDS_REVIEW`: não definida. O teste `NEEDS_REVIEW has no exit yet` fixa a lacuna para que ela não mude sem teste.
- Valores de `decision`, papel gravador e número do CRM.
- Proveniência de `CLAUDE.md` §7 em `jobs`. Conflito real: `CLAUDE.md` diz que linha sem proveniência não entra no banco.
- Limite de tentativas no retry: o banco permite ciclos ilimitados. Validade de assinatura reusada após rebobinamento: hoje inalcançável, mas precisa de regra antes de existir caminho de volta a `AWAITING_APPROVAL`.

**Governança.** PR #5 (`claude/governance-public-private`, candidato `c41a9eb88`, base `e821de1`) corrige `CLAUDE.md` e `docs/PUBLIC_PRIVATE.md`: trigger vira função, `get_config` lê só o público, `jobs` e `signatures` ficam em `editorial`, 17 estados, rebobinamento, migração 002. Não foi revisada (sem veredito). `docs/STAGES.md` §2 ainda menciona trigger; fica para um passo próprio.

**Testes.** `001`: 19 de 19 (`1a91b7b`). `002`: 17 de 17 (`0329c4c`). As duas suítes juntas: 36 de 36, com `--test-concurrency=1` (ambas criam papéis globais). Oito mutantes da `002` detectados.


## 13. Migrations 003 a 005 (2026-10-22)

Decisões do Fonseca de 2026-10-22, implementadas em `claude/migration-003` (`cc4ca36`), `-004` (`73e91e5`) e `-005` (`51c65df`). PRs #7 (003, base #6) e #8 (004, base #7); 005 sem PR.

| ID | Decisão | Implementação |
| --- | --- | --- |
| U11-l | `NEEDS_REVIEW` sai para `AWAITING_APPROVAL` ou para o estado de trabalho anterior | 11 arestas novas. O guard decide o destino válido por job, a partir de `jobs.previous_status` |
| U11-m | `approved` e `rejected`; gravação por papel `human_reviewer` | Papel sem login, separado de `n8n_pipeline`. INSERT só nas colunas `job_id, reviewer_name, crm_uf, decision, notes`; `id` e `signed_at` vêm do banco. Só assina job em `AWAITING_APPROVAL` (política RLS). Não atualiza nem apaga |
| U11-n | proveniência em `jobs` | `source_origin`, `input_context` (jsonb), `config_source`, `config_version` (obrigatórios); `last_stage`, `last_execution_id` (gravados por `mark_running`). `model` fica de fora: é por chamada de LLM |
| U11-o | `attempt_count` no banco; limite de 3 no código | Conta tentativas desde o último avanço. `mark_running` soma e devolve; `set_status` zera ao avançar, mantém em falha e retry, zera ao sair de `NEEDS_REVIEW` |
| D-08 | 64 px de margem externa; 90 px de zona segura | Só documentação; entra no baseline visual (VL-4) |

**Regras do guard que são escolha minha (aprovadas pelo Fonseca na mesma data, cada uma é uma condição):**
1. `NEEDS_REVIEW → AWAITING_APPROVAL` só se o job chegou a `QA_PASSED` ou além. Sem isso, um job em `RECEIVED` pularia para o gate.
2. Depois do gate (`HUMAN_APPROVED`, `PUBLISHED`), a IA não refaz: o job só volta a `AWAITING_APPROVAL`.
3. A assinatura só vale se gravada depois de o job entrar no estado atual (`jobs.status_entered_at`). Sem isso, uma aprovação antiga liberaria uma nova revisão.

**Funções.** `guard_transition` é `SECURITY DEFINER`. `set_status(job_id, next)` bloqueia a linha, chama o guard e grava `previous_status` e `status_entered_at`. `mark_running(job_id, stage, execution_id)` devolve `attempt_count`. Recusa job em estado de erro, `NEEDS_REVIEW` ou `PUBLISHED`. Todas com `search_path` fixo; EXECUTE só para `n8n_pipeline`.

**Reversibilidade.** `supabase/rollbacks/NNN_….down.sql` para as cinco. A suíte `rollbacks.test.js` descobre as migrations, falha se faltar rollback, e confere que subir, descer e subir restaura o catálogo idêntico (colunas, constraints, índices, funções com segurança e `search_path`, políticas, ACLs, papéis e linhas de `state_transitions`). A 005 é não transacional (`CREATE INDEX CONCURRENTLY`); o harness a aplica sem `psql -1`.

**Risco residual, decisão do Fonseca.** `human_reviewer` é um papel de banco. Se a mesma instância do n8n guarda as credenciais de `n8n_pipeline` e de `human_reviewer`, a automação consegue assinar: o banco não distingue pessoa de workflow. A credencial dele não deve ficar em workflow que roda sem supervisão.

**Limites conhecidos**
- Não há `create_job`; os jobs são criados pelo dono do schema.
- As funções pertencem ao papel que roda a migration. Um dono dedicado e sem login reduz o alcance de um erro nelas.
- `now()` marca o início da transação: uma assinatura gravada numa transação iniciada antes de o job entrar no estado é recusada (falha fechada).
- Não verificado: se o Supabase CLI ignora `supabase/rollbacks/`.

**Testes** (Postgres 16.15 limpo, `--test-concurrency=1`): 003: 22; 004: 13 (inclui concorrência de `set_status`); 005: 5; conjunto: 82 de 82. Mutantes detectados: 11 (003), 11 (004), 4 (005), 3 (rollbacks).


## 14. Migration 006, scripts de baseline e CI (2026-10-22)

**Correção.** Escrevi em §12 e em descrições de PR que `docs/STAGES.md` §2 mencionava trigger. Não mencionava: já dizia "função `guard_transition()`". A lacuna real era outra: o guard agora recebe o job e quem o chama é `set_status`, não o workflow. A PR #12 corrige isso.

**Estado do merge.** O Fonseca mergeou #5, #6, #7 e #8. #6 e #5 foram para o `main`. #7 e #8 tinham como base os branches `claude/migration-002` e `claude/migration-003`, então entraram nesses branches e **não chegaram ao `main`**. A falha foi do empilhamento que eu montei. O conteúdo é o mesmo (diff de árvore vazio). A consolidação é a PR #9; a 005 é a #10. Daqui em diante toda PR tem o `main` como base.

| Item | Decisão | Implementação |
| --- | --- | --- |
| `editorial_owner` | papel dedicado, sem login, dono das funções `SECURITY DEFINER` | Sem superusuário, sem BYPASSRLS. Lê `state_transitions`, `signatures` e `jobs`; insere 4 colunas de proveniência e atualiza 7 colunas de controle de `jobs`; não apaga, não grava assinatura, não lê `config_baseline`. Políticas de RLS próprias. `get_config` continua `SECURITY INVOKER` |
| `create_job` | criação de job pelo n8n | `create_job(source_origin, input_context, config_source, config_version)` devolve o id; status nasce `RECEIVED`. Não é idempotente |
| Senha do `human_reviewer` | cofre separado, nunca no n8n do robô | Registrado em `CLAUDE.md` (PR #12) |
| `seed-baseline`, `verify-baseline` | scripts, não migration | `scripts/*.js`, sem dependências. Formatos PROPOSTOS: chave = nome do arquivo sem `.json`; hash = sha256 dos bytes; `.checksums` no formato do `sha256sum`; versão informada por `--version`. Prompts não são semeados |
| CI | Postgres efêmero a cada push | `.github/workflows/migrations.yml`: `postgres:16` como serviço, suítes de migration, rollback e scripts, recusa execução vazia. Conferido localmente; não rodou no GitHub Actions |

**Limites conhecidos**
- Não verificado: se o papel que roda a migration no Supabase pode fazer `ALTER FUNCTION … OWNER TO editorial_owner`.
- Não verificado: como o Supabase CLI trata a 005 (não transacional) e a pasta `supabase/rollbacks/`.
- Ações do CI fixadas por tag, não por SHA.
- `CLAUDE.md` lista os scripts como `.ts`; ficaram `.js`.

**Testes.** 106 de 106 (migrations e rollbacks 94, scripts 12). Mutantes: 9 da 006 e 1 do rollback, 10 de 11 dos scripts (o 11º é equivalente).

**Fase 1.** O código está completo. Ela só fecha quando #9, #10, #11 e #12 forem mergeadas e o CI passar no GitHub. Não a marquei como concluída antes disso.


## 15. Migration 007: menor privilégio estrito de `n8n_pipeline` (2026-10-22)

**Decisões do Fonseca.** (1) **Um banco por cliente.** O schema `editorial` continua genérico, sem coluna de tenant; o n8n escolhe a string de conexão do cliente ao disparar o job; o direito ao esquecimento da LGPD é apagar o banco do cliente. (2) **`n8n_pipeline` sem `SELECT` direto.** O papel só executa funções `SECURITY DEFINER`, e, se precisa ler um job, lê por uma função.

| Item | Decisão | Implementação |
| --- | --- | --- |
| `n8n_pipeline` | nenhum privilégio de tabela | Perde o `SELECT` em `state_transitions`, `config_baseline`, `jobs` e `signatures`, e as quatro políticas de leitura dele saem. Mantém o `USAGE` no schema |
| `get_config` | passa a `SECURITY DEFINER` | Dona: `editorial_owner`, que ganha `SELECT` e uma política em `config_baseline`. **Substitui** o que §14 diz: "`get_config` continua `SECURITY INVOKER`" e "não lê `config_baseline`" |
| `get_job(job_id)` | `Load Context` do `_TEMPLATE_STAGE` | Devolve as 13 colunas de `jobs` por nome, não o tipo da tabela, para que uma coluna futura não seja exposta por acidente. Job inexistente é erro |
| `get_job_status(job_id)` | `Guard` e orquestrador | Devolve o status. Job inexistente é erro |
| `find_jobs_by_execution(execution_id)` | `99_ERROR_HANDLER` | Devolve zero ou mais ids, o mais recente primeiro. `execution_id` vazio ou nulo é erro. O banco não escolhe entre vários jobs de uma mesma execução |
| Leitura de `signatures` | `n8n_pipeline` não lê | O gate fica dentro de `guard_transition`. O estágio `10_APPROVAL` pode chamar `set_status` e tratar a recusa |

**Limites conhecidos e UNKNOWN**
- Não há função para listar jobs por status: nenhum workflow documentado a usa, porque o `_TEMPLATE_STAGE` recebe o `job_id`. Se o orquestrador passar a descobrir trabalho por status, a função nasce com esse consumidor.
- `scripts/verify-baseline.js` lê a tabela `config_baseline` e deixa de funcionar com `n8n_pipeline`; roda com o papel de deploy.
- `human_reviewer` segue lendo `jobs` e `signatures` pela tabela (a fila de aprovação). A decisão de hoje não mudou isso.
- A string de conexão de cada cliente e a credencial de `human_reviewer` por cliente ficam no n8n e no cofre, fora do repositório.
- Não verificado: se o papel que roda a migration no Supabase pode fazer `ALTER FUNCTION … OWNER TO editorial_owner` (a mesma ressalva de §14).

**Testes** (Postgres 16.15 limpo, `--test-concurrency=1`): migrations, rollbacks e invariantes 126 (14 da 007, 17 nas invariantes, 1 rollback novo); scripts 24; conjunto 150 de 150. Mutação: 105 mutantes dos pontos de segurança das migrations 001 a 007 e do rollback da 007; a suíte inteira detecta 105 de 105. As suítes por migration deixam passar 15 deles, que só o arquivo de invariantes detecta. Dois mutantes (`R05` e `F06`) são equivalentes no estado final, porque a 007 redefine o objeto que eles alteravam, e continuam detectados pelos testes do estado intermediário.

## 16. Migration 008: aprovação humana de imagem como registro (2026-10-22)

**Decisão do Fonseca.** A aprovação de uma foto própria (`owned_photo`) é um registro no banco que só `human_reviewer` grava, e o JSON da imagem referencia o id desse registro. Isso substitui o flag `human_approved: true` e a `justification` no payload da proposta (`image-assets-proposal.md`, §4 e Q3). A escolha entre tabela nova e `signatures` ficou comigo.

| Item | Decisão | Implementação |
| --- | --- | --- |
| Tabela | `editorial.image_approvals`, e não `signatures` | `signatures` é a chave do gate `AWAITING_APPROVAL → HUMAN_APPROVED`: `guard_transition` aceita qualquer linha `approved` dela, e a política de INSERT só deixa assinar job em `AWAITING_APPROVAL`. Aprovar uma imagem ali liberaria o gate sem revisão da capa, e não daria para aprovar no upload. Um teste prova que a aprovação de imagem não libera o gate |
| Colunas | `id`, `job_id` (FK), `ref`, `subject`, `justification`, `reviewer_name`, `signed_at` | `id` e `signed_at` vêm do banco: `human_reviewer` tem `INSERT` só em cinco colunas. Uma aprovação por `(job_id, ref)` |
| `subject` | só `none` ou `person_not_patient` | `CHECK` no banco: o registro de uma aprovação de paciente, antes/depois ou exame não pode existir. É a segunda declaração do assunto, feita por um humano; o validador recusa a divergência |
| Escrita | só `human_reviewer`, sem `UPDATE`, `DELETE` nem `TRUNCATE` | `n8n_pipeline` não tem privilégio na tabela |
| Leitura do n8n | `get_image_approvals(job_id)` | `SECURITY DEFINER`, `STABLE`, `search_path` fixo, dona `editorial_owner`. Devolve `id`, `job_id`, `ref`, `subject`, `signed_at`: sem justificativa nem nome do revisor. Job inexistente é erro; job sem aprovação devolve zero linhas |

**Escolhas minhas, a confirmar**
- Sem revogação: uma aprovação dada por engano fica; o remédio é o produtor do payload não referenciá-la. Revogar exige decidir quem pode apagar.
- A política de INSERT só exige que o job exista. Não sei em qual estágio o upload é aprovado (Q1 da proposta); uma aprovação não referenciada é inerte.
- Justificativa com no mínimo 20 caracteres depois do `btrim` (Q5): só barra o vazio.
- O formato de `ref` (`^img://[A-Za-z0-9._/-]+$`) é o do exemplo do relatório; o contrato v0.1.0 original não existe em arquivo (resposta do Fonseca), e a proposta passa a ser o v0.1.0.

**Limites conhecidos**
- Nada reconhece um paciente no pixel. O banco e o validador recusam o que é declarado; uma foto clínica declarada como `none` pelo produtor **e** pelo revisor passa.
- Quem grava a aprovação é o papel `human_reviewer`, e o banco não distingue pessoa de workflow (como em `signatures`). A garantia depende de a credencial ficar no cofre separado.
- A recusa de mídia clínica não é registrada como evento de auditoria (recomendação 3 da proposta, ainda aberta).

**Testes** (Postgres 16.15 limpo, `--test-concurrency=1`): migrations, rollbacks e invariantes 142 (15 da 008, mais asserções novas nas invariantes), scripts 24, conjunto 166 de 166. Mutação: 53 mutantes de `008_image_approvals.sql` e do rollback; 52 detectados, 1 equivalente (`ORDER BY` removido de `get_image_approvals`: a ordem física de linhas que nunca são atualizadas já é a de `signed_at`). Os dois mutantes que sobreviveram à primeira rodada (âncora `^` de `ref`; mutante de sintaxe inválida) foram corrigidos no teste e no mutante.
