# Proposta de atualização do `CLAUDE.md` (v1.1 para v1.2)

> **Status atual (2026-11-07): APLICADA.** O Fonseca aprovou todos os itens (A1 a A6, B1, C1 a C4), com o equivalente por REST no B1 e o mapa em nível de diretório no A4, e o texto entrou em `main` pela PR #57 (merge `17bcaf2`). O `CLAUDE.md` em `main` tem o SHA-256 `77658cfdd42294ae8d66ad56637c8b7672515aac87a2a85e9b7caccda3822d9c`, idêntico ao candidato descrito aqui. A pergunta Q4 (quais sugestões S1 a S10 viram PR) foi respondida com a ordem S4, S3, S5, S7, S6; as sugestões seguem como PRs próprias.
> A versão revisada por digest deste documento é a do commit `d269a8f`, mesclada pela PR #58 (SHA-256 `203bb12cda7c3f908533462c65d7f9b1af2031886f2172bdf3b177cd8af13554`); esta versão só troca o status. O texto abaixo é o registro da proposta como foi revisada.
> Status original: **PROPOSED**, para revisão por digest (`reviewed_commit_sha = null`). Não autorizava merge e não alterava o `CLAUDE.md`.
> Rótulos: **VERIFIED** (conferido no repositório nesta sessão), **PROPOSED** (desenho nosso), **UNKNOWN** (sem fonte).
> Base conferida: `main` em `0281786` (2026-11-07). `CLAUDE.md` atual: 302 linhas, SHA-256 `4002b0722067dfdb09b36c0db65ab79ea82cd9bb62f7cfc90b14a9958aaad110`, sem alteração desde 2026-10-22.
> Todo bloco "Antes" abaixo foi **extraído do arquivo real** (aparece nele exatamente uma vez), e todo bloco "Depois" foi aplicado numa cópia para verificação; nada foi digitado à mão nos dois lados.

## 1. Em uma página

**O que encontrei.** O `CLAUDE.md` parou em 2026-10-22. Desde então entraram 55 commits em `main` (26 são merges de PR) e o repositório tem 171 arquivos rastreados. O arquivo cobre bem o que é princípio (a seção do banco, por exemplo, está correta: 9 funções, 5 tabelas, 3 papéis e 17 estados conferidos contra as migrations). Está errado ou defasado em seis pontos, tem uma regra de processo que não consegue ser executada, e não registra as convenções que passaram a governar contratos e validadores.

| ID | O que muda | Tipo | Minha recomendação |
| --- | --- | --- | --- |
| **A1** | §4: `verified = true` não existe | Correção factual | Aprovar |
| **A2** | §7: faltam `created_at` e o `not_reported` de `model` | Correção factual | Aprovar |
| **A3** | §8: aponta a definição exata e corrige o "null" | Esclarecimento | Aprovar |
| **A4** | Estrutura: a nota está desatualizada e o mapa omite o que existe | Correção factual | Aprovar |
| **A5** | Segurança: a lista do CI está incompleta | Correção factual | Aprovar |
| **A6** | Rodapé: versão e data | Correção factual | Aprovar |
| **B1** | §2: o comando exigido não roda nas sessões na nuvem | Regra com defeito | Decidir (recomendo aprovar) |
| **C1** | Nova §10 "Contratos e Validadores" | Acréscimo | Aprovar bullet a bullet (recomendo todos; o 7 é o mais discutível) |
| **C2** | Onde ler as decisões citadas (D-nn, U-nn) | Orientação | Aprovar |
| **C3** | Segurança: credencial exposta e configuração do GitHub | Acréscimo | Aprovar (a segunda linha pede uma ação sua em Settings) |
| **C4** | Fases: uma linha de estado por fase | Orientação | Aprovar em forma enxuta |

**Recomendação geral:** aprovar tudo. Os três pontos que mais merecem a sua atenção são **B1** (muda uma regra de segurança, ainda que só o transporte), o **bullet 7 de C1** (convenção minha, sem decisão prévia) e a **segunda linha de C3** (pede uma ação sua em Settings).

**Verificação do texto proposto** (todos os itens aplicados): 302 para 326 linhas (+24); SHA-256 do resultado `77658cfdd42294ae8d66ad56637c8b7672515aac87a2a85e9b7caccda3822d9c`; as seções §1 a §9 mantêm número e ordem (outros documentos as citam por número); a única seção nova é a §10; o mapa de estrutura tem 74 caminhos e **zero** divergências contra o repositório (sem marca: existe; `(planejado)`: não existe; testei o verificador plantando três erros e ele acusou os três); nenhum código nem teste lê o conteúdo do `CLAUDE.md`, só comentários citam suas seções.

## 2. O que a conferência mostrou (VERIFIED)

| Afirmação do `CLAUDE.md` | Realidade em `main` | Item |
| --- | --- | --- |
| §4: a evidência precisa de `verified = true` | não existe esse campo; `verification.status` é `VERIFIED` ou `FAILED` | A1 |
| §7: seis campos de proveniência | os 9 contratos de linha exigem **sete** (com `created_at`); `docs/ALUCINAÇÃO_GUARD.md` §6 também lista sete | A2 |
| Estrutura: `001_init_editorial_schema.sql` e `job_ref.schema.json` "não existem" | existem e estão implementados (verdade só no commit `7dd6868`) | A4 |
| Estrutura: árvore de 71 caminhos | 52 existem, 19 seguem planejados; faltam no mapa 3 contratos, 8 de 14 validadores, `render/`, `assets/brand/`, `tests/skills/` e 2 workflows de CI | A4 |
| Segurança: o CI roda 4 coisas | roda também `render/`, `tests/skills/`, `verify-baseline` e o autoteste do gitleaks | A5 |
| §2: rodar `gh pr view ... --json state` antes de um push de correção | falha nas sessões na nuvem com HTTP 403 (GraphQL bloqueado); o equivalente por REST funciona | B1 |
| "Dois Repositórios": 9 funções, 5 tabelas, 3 papéis, colunas de `jobs`, 17 estados | **corretos** (conferido nas migrations 001 a 008) | nada a mudar |
| Citações "decisão U11-x" | existem, mas não dizem onde estão registradas | C2 |

## 3. Correções factuais (A1 a A6)

Nenhuma cria regra nova: alinham o arquivo ao que o repositório já faz ou ao que você já decidiu.

### A1. §4: `verified = true` não existe

**Onde:** §4, linha da **Regra**.  
**Por quê:** O contrato `verification` (decidido por você em 2026-11-07) tem `status` com valores `VERIFIED` ou `FAILED`; não há booleano `verified`. O próprio §8 já diz "estar `VERIFIED`". Quem lê só o §4 implementaria um campo que não existe.  
**Minha recomendação:** Aprovar.

**Antes**

````
**Regra**: Se a evidência não tem `verified = true` em `verification.status`, a etapa criativa rejeita.
````

**Depois**

````
**Regra**: Se a evidência não tem `verification.status = 'VERIFIED'`, a etapa criativa rejeita. `status` é um enum de texto (`VERIFIED` ou `FAILED`), não um booleano, e mora na linha de `verification`: a evidência em si não carrega status.
````

### A2. §7: faltam `created_at` e o `not_reported` de `model`

**Onde:** §7, a lista de campos.  
**Por quê:** Os nove contratos de linha em `contracts/` exigem **sete** campos de proveniência (conferido nos schemas), e `docs/ALUCINAÇÃO_GUARD.md` §6 também lista `created_at`. O §7 lista seis. Nos contratos, `model` é obrigatório e vale `not_reported` quando a etapa não usa LLM. A frase "papel pertence a qual job" parece erro de digitação e foi reescrita para o sentido óbvio (a qual job a linha pertence).  
**Minha recomendação:** Aprovar.

**Antes**

````
Toda linha gerada grava:
- `job_id` — papel pertence a qual job
- `stage` — qual etapa gerou
- `config_source` — "public" | "private"
- `config_version` — hash ou versão
- `model` — qual modelo LLM (se aplicável)
- `execution_id` — rastreabilidade de retry
````

**Depois**

````
Toda linha gerada grava os sete campos abaixo. Os contratos de linha (`contracts/*.schema.json`, exceto `visual_library`, que descreve configuração) os exigem, e `validators/contracts.test.js` confere que o bloco é idêntico em todos:
- `job_id` — a qual job a linha pertence
- `stage` — qual etapa gerou
- `config_source` — "public" | "private"
- `config_version` — hash ou versão
- `model` — qual modelo LLM; `not_reported` quando a etapa não usa LLM
- `execution_id` — rastreabilidade de retry
- `created_at` — instante da geração, ISO 8601 em UTC com sufixo `Z`
````

### A3. §8: aponta a definição exata e corrige o "null"

**Onde:** §8, a lista de validações.  
**Por quê:** "Normalizar espaços e hífens" estava ambíguo e foi definido em código (`validators/citation.js`: NFC, hífens e travessões viram `-`, espaços colapsam, sem ignorar maiúsculas). "Na página informada" é o que `docs/ALUCINAÇÃO_GUARD.md` §7 já diz e o contrato `evidence` impõe. Os contratos JSON não usam `null`: o `schema.js` não aceita "string ou null", então a ausência é `"not_reported"` dentro de um enum. Não decide a numeração impressa da página (pendente; ver §6 deste documento).  
**Minha recomendação:** Aprovar.

**Antes**

````
- `source_text` **deve existir literalmente** no PDF (após normalizar espaços, hífens).
- Números da claim **devem aparecer** no trecho citado.
- `evidence_ids` **devem existir** em `verification` e estar `VERIFIED`.
- Enums **fechados** (nenhum valor inventado).
- Para valores desconhecidos: `null` ou `"not_reported"`, não invenção.
````

**Depois**

````
- `source_text` **deve existir literalmente** no PDF, **na página informada** (após normalizar espaços e hífens; a definição exata está em `validators/citation.js`).
- Números da claim **devem aparecer** no trecho citado, com o mesmo valor e a mesma unidade (`validators/verification.js`).
- `evidence_ids` **devem existir** em `verification` e estar `VERIFIED`.
- Enums **fechados** (nenhum valor inventado).
- Para valores desconhecidos: `"not_reported"` (nos contratos JSON, dentro de um enum, porque o `schema.js` não aceita "string ou null") ou `NULL` em coluna do banco, não invenção.
````

### A4. Estrutura: a nota está desatualizada e o mapa omite o que existe

**Onde:** "Estrutura do Repo Público": a nota e a árvore.  
**Por quê:** A nota diz que `001_init_editorial_schema.sql` e `job_ref.schema.json` não existem: era verdade no commit `7dd6868`; hoje existem, implementados. Da árvore, 52 de 71 caminhos existem, 19 seguem planejados e 3 contratos, 8 validadores, `render/`, `assets/brand/`, `tests/skills/` e 2 workflows de CI não aparecem. Em vez de listar cada arquivo (o que envelhece a cada PR), o mapa passa a listar diretórios, marca `(planejado)` no que não existe e deixa o inventário para `git ls-files`.  
**Minha recomendação:** Aprovar.

**Antes:** a nota abaixo e a árvore atual (linhas 168 a 243 do arquivo, 76 linhas, que não repito aqui).

````
**PLANNED — target structure, not an inventory:** paths below that are absent from the inspected repository are planned only. At baseline `7dd6868f26f5969f0ea08a19fa51a3ab5fa778aa`, `supabase/migrations/001_init_editorial_schema.sql` and `contracts/job_ref.schema.json` do not exist. Their filenames imply no implemented content. Verify the repository tree before referencing any path as existing. O DDL de `editorial_intel` fica no repositório privado; este repositório não tem migração desse schema.
````

**Depois:**

````
**PLANNED — mapa-alvo, não inventário.** O que existe em `main` não tem marca; o que ainda não existe leva `(planejado)`. Esta seção lista diretórios e os arquivos que carregam a arquitetura, não cada arquivo (eles mudam a cada PR): para o inventário, use `git ls-files`. Um nome planejado não implica conteúdo implementado; confira a árvore real antes de citar um caminho como existente. Conferido contra `main` em `0281786` (2026-11-07). O DDL de `editorial_intel` fica no repositório privado; este repositório não tem migração desse schema.

```
editorial-pipeline/
├── CLAUDE.md                        # Este arquivo
├── README.md                        # O que é, como auditar, como rodar (hoje só documenta o gitleaks; o resto é planejado)
├── LICENSE
├── docs/
│   ├── STATE_MACHINE.md            # (planejado) Diagrama mermaid + tabela de transições
│   ├── STAGES.md                   # Cartões de etapa (01_INGEST, 02_EXTRACT, ..., 00_ORCHESTRATOR)
│   ├── PUBLIC_PRIVATE.md           # Fronteira de repos e schemas
│   ├── ALUCINAÇÃO_GUARD.md         # Checklist de proibições
│   ├── API_CONTRACTS.md            # (planejado) O que cada stage recebe/devolve
│   ├── SECURITY.md                 # (planejado) RLS, roles, secrets
│   ├── *-contract-proposal.md      # Propostas de contrato já decididas (evidence, verification, insight, job_ref)
│   ├── n8n-infra-proposal.md       # Proposta da infraestrutura n8n (Fase 4), ainda sem decisão
│   └── visual-layer/               # Camada visual: contexto, roadmap, checkpoints, propostas e decisões
├── supabase/migrations/
│   ├── 001_init_editorial_schema.sql
│   ├── 002_jobs_and_signatures.sql
│   ├── 003_review_exit_provenance_attempts.sql
│   ├── 004_set_status_mark_running.sql
│   ├── 005_jobs_indexes.sql        # não transacional (CREATE INDEX CONCURRENTLY)
│   ├── 006_editorial_owner_create_job.sql
│   ├── 007_n8n_least_privilege.sql
│   ├── 008_image_approvals.sql
│   └── ...
├── supabase/rollbacks/             # um NNN_nome.down.sql por migration
├── contracts/                      # *.schema.json: um contrato por tipo de linha gerada, mais visual_library; o 05_SCORE ainda não tem
├── config/baseline/
│   ├── visual_library.json
│   ├── cfm_blocklist.json
│   ├── cfm_footer.json             # (planejado) formato definido (§9); origem de Nome, UF e Número por definir
│   ├── scoring_weights.json        # (planejado)
│   ├── verification_thresholds.json  # (planejado)
│   ├── hook_rules.json             # (planejado)
│   ├── archetypes.json             # (planejado)
│   └── .checksums
├── skills/                         # Fonte única dos prompts: um SKILL.md por nó de LLM
│   ├── README.md
│   ├── art-director/SKILL.md       # prompt.06_visual
│   ├── copywriter-cfm/SKILL.md     # prompt.07_covers
│   ├── qa-validator/SKILL.md       # prompt.09_qa
│   └── .checksums                  # sha256sum dos SKILL.md
├── validators/                     # JS puro, sem require: schema.js e uma validação por regra que o schema não expressa; *.test.js ao lado de cada um
├── render/                         # Núcleo de render do 08_RENDER, em código puro: render.js e seus testes
├── assets/brand/                   # Os 6 templates SVG de marca (owned_brand_asset) e o README de proveniência
├── n8n/workflows/                  # (planejado)
│   ├── _TEMPLATE_STAGE.json
│   ├── 00_ORCHESTRATOR.json
│   ├── 01_INGEST.json
│   ├── 02_EXTRACT.json
│   ├── ...
│   ├── 99_ERROR_HANDLER.json
│   └── README.md
├── scripts/
│   ├── seed-baseline.js            # Carrega config/baseline/* no banco (sem dependências)
│   ├── verify-baseline.js          # Confere arquivos, .checksums e banco
│   ├── lib/baseline.js
│   ├── extract-font-metrics.js     # Ferramenta de design-time: tabela de larguras de geometry.js
│   ├── hooks/pre-commit            # gitleaks no commit (git config core.hooksPath scripts/hooks)
│   ├── n8n-push.ts                 # (planejado) Cria/atualiza workflows via API
│   ├── n8n-pull.ts                 # (planejado) Baixa e sanitiza
│   └── sanitize-workflow.ts        # (planejado) Remove credential IDs, pinData, URLs privadas
├── tests/
│   ├── migrations/                 # Postgres limpo: migrations, rollbacks, papéis
│   ├── scripts/
│   └── skills/                     # Prompts: forma, hashes e amarração com contratos e validadores
├── .github/
│   ├── workflows/                  # migrations.yml (Postgres efêmero: migrations, rollbacks, scripts), validators.yml, gitleaks.yml
│   ├── CODEOWNERS
│   └── pull_request_template.md
├── fixtures/synthetic/
│   ├── contracts/                  # 2 fixtures válidas e 2 inválidas por contrato
│   ├── render/                     # cover_specs sintéticos dos 6 templates
│   ├── papers/                     # (planejado) Papers fictícios
│   └── gabaritos.json              # (planejado) Respostas esperadas
├── .env.example
├── .gitignore
└── .gitleaks.toml
```
````

**O que muda na árvore:** (1) o que existe e faltava entra: `LICENSE`, `render/`, `assets/brand/`, `tests/skills/`, `.github/` (workflows, `CODEOWNERS`, template de PR), `fixtures/synthetic/contracts/` e `render/`, `config/baseline/cfm_blocklist.json`, `scripts/extract-font-metrics.js` e `scripts/hooks/`, `.gitleaks.toml`, e as propostas em `docs/`; (2) `contracts/` e `validators/` deixam de listar arquivo a arquivo (são os dois diretórios que mais crescem); (3) tudo o que ainda não existe leva `(planejado)`: 3 docs, 5 arquivos de `config/baseline/`, `n8n/workflows/`, 3 scripts `.ts` e as fixtures `papers/` e `gabaritos.json`; (4) `supabase/migrations/` e `skills/` ficam como estavam, porque já estavam certos.

**Alternativa:** Manter a lista arquivo a arquivo do original, que é mais fiel a ele. Dá mais manutenção (14 validadores e 10 contratos hoje) e é o que fez este bloco envelhecer.

### A5. Segurança: a lista do CI está incompleta

**Onde:** "Segurança", itens do CI.  
**Por quê:** O CI roda, além dos testes dos validators: os de `render/` e `tests/skills/`, o `verify-baseline` e o autoteste do gitleaks (planta um segredo e exige que o scanner o pegue). Os rollbacks também são testados no Postgres limpo (`migrations.yml`).  
**Minha recomendação:** Aprovar.

**Antes**

````
  - Testes dos validators
  - `sanitize-workflow --check` em n8n/workflows
  - gitleaks
  - Migrations testam em Postgres limpo
````

**Depois**

````
  - Testes dos validators, de `render/` e de `tests/skills/`; `verify-baseline` confere `config/baseline` e `skills/` contra os `.checksums`
  - `sanitize-workflow --check` em n8n/workflows (planejado: ainda não há workflows)
  - gitleaks sobre o histórico e a árvore, com autoteste (planta um segredo e exige que o scanner o pegue)
  - Migrations e rollbacks testados em Postgres limpo
````

### A6. Rodapé: versão e data

**Onde:** Final do arquivo.  
**Por quê:** Acompanha as mudanças aprovadas. Se só parte dos itens for aprovada, a versão continua 1.2.  
**Minha recomendação:** Aprovar.

**Antes**

````
**Última atualização**: 2026-10-22
**Versão**: 1.1
````

**Depois**

````
**Última atualização**: 2026-11-07
**Versão**: 1.2
````

## 4. Regra de processo com defeito (B1)

**Onde:** §2, "Supervised development agents", parágrafo do `gh pr view` (e a mesma frase em `.github/pull_request_template.md`).  
**Por quê:** Testei nesta sessão: `gh pr view 56 --repo ybobthebuilder/editorial-pipeline --json state` falha com HTTP 403 ("GitHub GraphQL is not available from Claude Code sessions"). Pela regra, se a checagem falha o implementer deve parar sem fazer push, então em sessão na nuvem ele ficaria proibido de qualquer push de correção. O equivalente por REST funciona: devolveu `MERGED` para a PR #56 e falhou com 404 (saída diferente de zero) para um número inexistente, que é o que a regra pede. Mantém a intenção (confirmar OPEN, falhar fechado) e só troca o transporte.  
**Minha recomendação:** Decidir (recomendo aprovar).

**Antes**

````
Before any authorized correction push, implementer must run gh pr view <PR_NUMBER> --repo ybobthebuilder/editorial-pipeline --json state and verify that the PR is OPEN. Record the command and result in the handoff. If the PR is CLOSED or MERGED, missing, inaccessible, or the check fails, stop without pushing; do not infer permission from a previous OPEN result.
````

**Depois**

````
Before any authorized correction push, implementer must run gh pr view <PR_NUMBER> --repo ybobthebuilder/editorial-pipeline --json state and verify that the PR is OPEN. Record the command and result in the handoff. If the PR is CLOSED or MERGED, missing, inaccessible, or the check fails, stop without pushing; do not infer permission from a previous OPEN result. In cloud sessions `gh pr view` always fails (it uses GraphQL, which is blocked there: HTTP 403), so it cannot be run as written. The accepted equivalent is `gh api repos/ybobthebuilder/editorial-pipeline/pulls/<PR_NUMBER> --jq 'if .merged then "MERGED" else (.state | ascii_upcase) end'`, which prints OPEN, CLOSED or MERGED and exits non-zero for a missing PR. The same stop conditions and the same recording apply.
````

**A mesma frase no template de PR** (`.github/pull_request_template.md`, para as duas regras não divergirem):

**Antes**

````
Before any authorized correction push, implementer must run gh pr view <PR_NUMBER> --repo ybobthebuilder/editorial-pipeline --json state and confirm OPEN. Record the command and result; if the PR is CLOSED or MERGED, missing, inaccessible, or the check fails, stop without pushing.
````

**Depois**

````
Before any authorized correction push, implementer must run gh pr view <PR_NUMBER> --repo ybobthebuilder/editorial-pipeline --json state and confirm OPEN. Record the command and result; if the PR is CLOSED or MERGED, missing, inaccessible, or the check fails, stop without pushing. In cloud sessions `gh pr view` fails (GraphQL is blocked there); use `gh api repos/ybobthebuilder/editorial-pipeline/pulls/<PR_NUMBER> --jq 'if .merged then "MERGED" else (.state | ascii_upcase) end'`, which prints OPEN, CLOSED or MERGED and exits non-zero for a missing PR.
````

**Meu cumprimento até a decisão.** Sigo usando o equivalente por REST e passo a registrar o comando e o resultado no corpo da PR sempre que houver push depois de aberta. Houve push depois de aberta nas PRs #44 e #45. Na #45 confirmei o estado por leitura da API antes do push, mas não deixei o comando e o resultado registrados na PR; na #44 não consigo reconfirmar o que fiz. Da #47 em diante nunca houve push depois de aberta.

## 5. Acréscimos recomendados (C1 a C4)

Estes **criam texto normativo novo**; por isso cada um indica de onde vem. Aprove um a um.

### C1. Nova §10 "Contratos e Validadores"

**Onde:** Nova seção, depois da §9 (as seções §1 a §9 não mudam de número).  
**Por quê:** Estas convenções governam todo o trabalho recente em `contracts/` e `validators/`, mas só existem espalhadas em `docs/visual-layer/` e nos cabeçalhos dos arquivos. Uma sessão nova que leia só o `CLAUDE.md` não as conhece. Nenhum código lê o `CLAUDE.md` (conferido), e ninguém cita seção acima de §9, então acrescentar a §10 não quebra nada.

| # | Convenção | Estado | De onde vem |
| --- | --- | --- | --- |
| 1 | **Proposta antes do schema (U2).** | DECIDIDO | roadmap.md (VL-3, passo 1) e CP-VL3.1 |
| 2 | **Envelope fechado.** | DECIDIDO | proposta de contratos aprovada (CP-VL3.1); `validators/contracts.test.js` |
| 3 | **Subconjunto do `schema.js`.** | DECIDIDO | validators.md §2 e §3; lista do Code node do n8n Cloud conferida por você |
| 4 | **Ids entre linhas.** | ACEITO NA PRÁTICA | propostas de `evidence` e `insight`; mesclado nas PRs #47, #51 e #54 |
| 5 | **Validadores puros.** | DECIDIDO | D-07 e CP-VL2.4; interface em validators.md §2 |
| 6 | **Falhar fechado.** | ACEITO NA PRÁTICA | escolhas minhas sinalizadas e mescladas nas PRs #50, #53 e #56; o princípio já está em contracts-proposal §6 (`entrada_insuficiente`) e no §8 |
| 7 | **Motivos, não conteúdo.** | PROPOSTO | convenção minha; conferi nos validadores de domínio atuais (citation, numbers, copy, media, geometry, verification, insight, job_ref, qa_result) e todos já a seguem |
| 8 | **Toda regra tem teste que a quebra.** | DECIDIDO | CP-VL2.6; `validators.yml` |
| 9 | **Fixtures só sintéticas** | DECIDIDO | CLAUDE.md ("Fixtures sintéticas") e fixtures/synthetic/contracts/README.md |

"DECIDIDO" = já está em checkpoint, proposta ou documento que você aprovou. "ACEITO NA PRÁTICA" = escolha minha, sinalizada na PR e mesclada por você. "PROPOSTO" = convenção minha sem decisão prévia.

**Depois** (a seção inteira, inserida antes de "Dois Repositórios, Dois Schemas")

````
## 10. Contratos e Validadores

Um contrato (JSON Schema, em `contracts/`) descreve a forma de uma linha; o que o schema não expressa vira validador de código (`validators/`). Um não substitui o outro.

- **Proposta antes do schema (U2).** Nenhum contrato é escrito antes de uma proposta aprovada pelo Fonseca, com cada fato rotulado VERIFIED, PROPOSED ou UNKNOWN. Campo sem fonte não se inventa: vira pergunta.
- **Envelope fechado.** Todo contrato de linha usa `additionalProperties: false`, os sete campos de proveniência (§7) e enums fechados; `stage` é uma `const`.
- **Subconjunto do `schema.js`.** Só se usa o que `validators/schema.js` entende (sem `$ref`, `oneOf`, `anyOf`, `format`, `uniqueItems`; `type` com um único nome). Por isso não existe "string ou null": ausência é `"not_reported"` num enum.
- **Ids entre linhas.** `ev-NNNN` (evidência) e `ins-NNNN` (insight), com quatro dígitos e únicos por job; existência e unicidade são checadas em código.
- **Validadores puros.** JS sem `require` nem `import` (Code node do n8n Cloud), sem relógio, sem aleatoriedade e sem acesso a arquivo; o que precisam entra por parâmetro. Argumento do tipo errado é `TypeError` (erro de programação); dado ruim é um veredito `{ passed, errors }`.
- **Falhar fechado.** Na dúvida o código reprova: job sem evidência ou sem insight falha, `QA-CFM` não pode ser dispensado nem faltar, e um número que o texto-fonte não contém não é autorizado.
- **Motivos, não conteúdo.** Os motivos de reprovação dos validadores de domínio são códigos de uma lista fechada, em português e `snake_case` (valores de enum de contrato mantêm a grafia do contrato, ex.: `passed`); nunca carregam texto do PDF nem da capa.
- **Toda regra tem teste que a quebra.** Cada validador é verificado por mutação (CP-VL2.6), com o resultado registrado na PR, e o CI recusa uma execução de testes vazia ou com falha.
- **Fixtures só sintéticas,** em `fixtures/synthetic/`: `job_id` `00000000-0000-4000-8000-0000000000NN` e `model` `synthetic-model-v0` ou `not_reported`.
````

### C2. Onde ler as decisões citadas (D-nn, U-nn)

**Onde:** Logo abaixo da frase de abertura.  
**Por quê:** O arquivo cita "decisão U11-c", "U11-d", "U11-h" etc. sem dizer onde estão. Elas estão dispersas em quatro documentos, e a tabela principal (`contexto.md` §11) se chama "Decisões pendentes" mas mistura itens já decididos. Este ponteiro resolve o sintoma; o registro único é a sugestão S3.  
**Minha recomendação:** Aprovar.

**Antes**

````
Resumo executivo dos princípios inegociáveis que governam este projeto. Documento de referência rápida para LLMs, arquitetos e engenheiros.
````

**Depois**

````
Resumo executivo dos princípios inegociáveis que governam este projeto. Documento de referência rápida para LLMs, arquitetos e engenheiros.

As decisões citadas aqui e nos docs (`D-nn`, `U-nn`, `U11-x`) estão registradas em `docs/visual-layer/` (principalmente `contexto.md` §11 e `schema-contract.md` §7).
````

### C3. Segurança: credencial exposta e configuração do GitHub

**Onde:** "Segurança", depois da última linha.  
**Por quê:** A primeira linha registra a regra que você mesmo enunciou: tornar o repositório privado ou apagar o commit não basta. A segunda nomeia a configuração do GitHub que fecha a lacuna do CI (ver S1), mas não é verificável pelo repositório: é o que **você** precisa conferir em Settings.  
**Minha recomendação:** Aprovar (a segunda linha pede uma ação sua em Settings).

**Antes**

````
- Nenhum PDF real, output de LLM, linha do banco ou métrica no repo público
````

**Depois**

````
- Nenhum PDF real, output de LLM, linha do banco ou métrica no repo público
- Credencial exposta: revogue e rotacione. Apagar o commit ou tornar o repositório privado não basta, porque ela pode já ter sido copiada.
- Configuração recomendada do GitHub (fora do código, a conferir em Settings): secret scanning com push protection, e proteção da branch `main` que exija os checks `test`, `scan` e `migrations` antes do merge.
````

### C4. Fases: uma linha de estado por fase

**Onde:** "Fases de Construção".  
**Por quê:** Hoje nada no repositório responde "em que fase estamos" de forma geral (o roadmap existente é só da camada visual). É a informação que uma sessão nova mais precisa. É a mais volátil das mudanças, por isso vai em forma enxuta, com a data visível e o gatilho de atualização escrito.  
**Minha recomendação:** Aprovar em forma enxuta.

**Antes**

````
0. **Scaffold** dos repos, docs, CLAUDE.md, gitleaks, .env.example
1. **Banco** — migrations, RLS, roles, funções, seed-baseline, verify-baseline
2. **Validators** — JS puro com testes
3. **Contratos** — JSON Schema + prompts (`skills/`)
4. **Infraestrutura n8n** — 90_DB_HELPERS, 99_ERROR_HANDLER, _TEMPLATE_STAGE
5. **Etapas 01, 02** — ingest, extract
6. **Etapas 03, 04, 05** — verify, insights, score
7. **Etapas 06, 07** — visual, cover specs
8. **Etapas 08, 09, 10** — render, QA, approval
9. **Orquestrador** — 00_ORCHESTRATOR end-to-end
````

**Depois**

````
_Estado em 2026-11-07 (atualizar quando uma fase fechar):_

0. **Scaffold** dos repos, docs, CLAUDE.md, gitleaks, .env.example — ✔
1. **Banco** — migrations, RLS, roles, funções, seed-baseline, verify-baseline — ✔ (migrations 001 a 008)
2. **Validators** — JS puro com testes — ✔
3. **Contratos** — JSON Schema + prompts (`skills/`) — contratos ✔ exceto o do `05_SCORE`; prompts 06, 07 e 09 ✔, 02, 03 e 04 pendentes
4. **Infraestrutura n8n** — 90_DB_HELPERS, 99_ERROR_HANDLER, _TEMPLATE_STAGE — bloqueada: falta a amostra de export do n8n
5. **Etapas 01, 02** — ingest, extract — pendente (contratos prontos)
6. **Etapas 03, 04, 05** — verify, insights, score — pendente (03 e 04 com contrato e validador; 05 sem contrato)
7. **Etapas 06, 07** — visual, cover specs — pendente (contratos, prompts e validadores prontos)
8. **Etapas 08, 09, 10** — render, QA, approval — pendente (núcleo de render, validador do QA e assinatura humana no banco prontos)
9. **Orquestrador** — 00_ORCHESTRATOR end-to-end — pendente
````

## 6. O que deixei de fora de propósito (depende de você)

Cada item abaixo é uma decisão em aberto. **Não escrevi nenhuma delas como regra**, para o `CLAUDE.md` não afirmar o que ninguém decidiu.

| Assunto | Por que não entrou | Quando entra |
| --- | --- | --- |
| `05_SCORE`: o que ele ordena e o contrato | falta saber se ordena papers, insights ou os dois; seus três critérios descrevem o paper | quando houver a proposta; muda §9 (chaves) e a lista de tabelas |
| Numeração da página (impressa × posição no arquivo) | você decidiu a **impressa**, mas o `citation.js` busca por posição; falta saber como o número impresso é obtido | uma frase no §8 (dois textos prontos abaixo) |
| Tabelas de `editorial_intel` para `post_copy`, `image_assets`, `job_ref` e o score | o DDL é do repositório privado; não consigo conferir | quando você confirmar quais tabelas existem |
| Ids `visual_spec_id` e `cover_spec_id` | `visual_spec` e `cover_spec` não têm campo de id próprio, e as fixtures usam `vs-0001` e `cs-0001` sem decisão | uma linha no bullet 4 de C1 |
| Temperatura do texto criativo | o §2 diz "0 em extração (exceto headlines)", mas o copywriter produz headline, subtítulo, `alt_text`, CTA e legenda numa chamada só (S10) | depois da decisão |
| Papel do reviewer na prática | ver S8 | depois da decisão |

**Texto condicional para a numeração de página**, para a aprovação ser rápida quando você decidir. Seria acrescentado ao primeiro bullet do §8:

- Se a página for a **impressa**: _"`page` é o número impresso na própria página (o rótulo), não a posição no arquivo; o `citation.js` recebe, para cada página do arquivo, o rótulo e o texto."_
- Se a página for a **posição no arquivo**: _"`page` é a posição da página no arquivo, a partir de 1."_

## 7. Sugestões fora do `CLAUDE.md`

Em ordem de prioridade. Nenhuma está incluída no texto acima; cada uma vira uma PR própria, se você quiser.

### S1. Exigir os checks antes do merge (prioridade alta)

**Por quê:** nas PRs #53, #55 e #56 confirmei que `scan` (gitleaks) e `migrations` ainda estavam em execução de 7 a 34 segundos antes do merge. O `scan` é o único portão de segredos do repositório; mesclar antes de ele terminar anula o portão (e o mesmo vale para `migrations`).  
**O que eu faria:** Settings, Branches, regra para `main`: exigir os checks `test`, `scan` e `migrations`, e ligar "Allow auto-merge". Assim você clica em "Enable auto-merge" assim que a PR abre e ela entra sozinha quando ficar verde, sem perder velocidade.  
**Esforço:** 2 minutos, e é seu: não vejo nem altero essas configurações.

### S2. Política de mudança de contrato, antes do primeiro job real

**Por quê:** os contratos mudam sem versão (a #54 apertou os formatos de id em três contratos). Sem dados de produção isso é inofensivo; depois do primeiro job real, uma mudança que torne inválida uma linha já gravada exige migração dos dados.  
**O que eu faria:** decidir agora (a) que mudanças são aditivas dentro de uma versão e endurecer exige migração, e (b) se a proveniência passa a registrar a versão do contrato (um oitavo campo; mecânico, mas toca 9 schemas, fixtures, testes e prompts).  
**Esforço:** uma decisão e uma PR mecânica. Adiar custa mais, porque o campo teria de ser preenchido retroativamente.

### S3. Registro único de decisões (`docs/DECISIONS.md`)

**Por quê:** é a resposta a "o projeto usa ADRs?". As decisões D-nn e U-nn já existem, mas vivem em quatro documentos; a tabela principal (`contexto.md` §11) se chama "Decisões pendentes" e mistura decididas; e há linhas defasadas (D-04 ainda descreve os SVGs fora do repositório, sem registrar a autorização que levou `assets/brand/` para dentro dele; D-07 pede "confirmar" algo que já é regra).  
**O que eu faria:** um arquivo só de acréscimo, com colunas fixas (ID, data, decisão, quem decidiu, fonte, estado, substitui ou é substituída por); eu extraio as decisões dos documentos atuais e você confere. Os templates de issue passam a ter um `decisao.md` que acrescenta uma linha ao registro, em vez de uma pasta de ADRs.  
**Esforço:** uma PR de documentação. Se aprovado, o ponteiro de C2 passa a apontar para ele.

### S4. README de verdade

**Por quê:** o `README.md` tem 10 linhas e só fala de gitleaks, num repositório que se apresenta como "auditável, reproduzível". Faltam o mínimo: o que é, a fronteira público/privado, como rodar os testes (`node --test 'validators/*.test.js'`), como conferir os `.checksums` e por onde começar a ler.  
**Esforço:** rascunho meu, conferência sua.

### S5. `docs/SECURITY.md`

**Por quê:** está planejado no próprio `CLAUDE.md` e não existe. Conteúdo: o que nunca entra no repositório; o procedimento de credencial exposta (revogar e rotacionar); o registro da auditoria de 2026-11-07 (método e resultado, sem dado sensível); a configuração exigida do GitHub (S1, secret scanning, push protection); e o canal de reporte, usando o "Private vulnerability reporting" do GitHub, que dispensa publicar um e-mail.

### S6. Fixar as Actions por SHA e ligar o Dependabot

**Por quê:** `actions/checkout@v4`, `actions/setup-node@v4` e `actions/setup-go@v7` são tags móveis, e `validators.md` já registrava que fixar em SHA "é uma decisão de governança". Como o CI é o portão de segredos e executa código do repositório, o custo-benefício é bom.  
**O que eu faria:** fixar por SHA e acrescentar `.github/dependabot.yml` (ecossistema `github-actions`) para as atualizações chegarem como PR.

### S7. Um teste que impeça o `CLAUDE.md` de envelhecer de novo

**Por quê:** é exatamente o que aconteceu: 55 commits sem que o mapa acompanhasse. O verificador que usei aqui (mapa contra `git ls-files`, com as marcas `(planejado)`) vira `tests/docs/claude-md.test.js`, e a próxima divergência derruba o CI na PR que a causou. Só faz sentido depois do A4.

### S8. O papel do reviewer, na prática

**Por quê:** o `CLAUDE.md` descreve master, researcher, implementer, reviewer e Fonseca. Nas PRs recentes o "Review record" ficou "sem veredito" e o merge foi seu: o CodeRabbit não revisa este repositório (menos de 10 estrelas) e o check "Claude Approvals" não existe aqui. Isso não viola a política, porque PASS nunca autoriza merge, mas a política descreve um passo que não está acontecendo.  
**Duas saídas:** (a) registrar no `CLAUDE.md` que, nesta fase, a revisão é a sua; ou (b) rodar uma revisão independente na SHA candidata antes de cada merge, o que posso fazer com `/code-review` e registrar no "Review record". Recomendo (b) para PRs de contrato e de validador, onde uma regra errada passa em silêncio.

### S9. O e-mail nos commits

**Por quê:** 54 commits trazem `imbobthebuilder@proton.me` como autor e 4 como committer. Não é segredo, mas é contato público. Tirar exigiria reescrever o histórico, o que **não recomendo**.  
**O que eu faria:** daqui para frente, ativar "Keep my email addresses private" no GitHub e usar o e-mail `noreply` no `git config user.email` (um commit já usa).

### S10. A temperatura do texto criativo

**Por quê:** o `copywriter-cfm` produz, numa só chamada, headline, subtítulo, `alt_text`, CTA e legenda, e todos passam por números, termos proibidos e QA. Um nó de LLM tem uma temperatura: se a headline precisar de variação, o resto vai junto.  
**Duas saídas:** (a) temperatura 0 em tudo e a variação vem do prompt; (b) separar a headline num nó próprio, com temperatura maior, e manter o resto em 0. Recomendo (a) até haver evidência de que a headline sai pobre, porque (b) dobra a superfície de QA. Decisão sua; o CP-VL3.4 já a listava como UNKNOWN.

**O que não recomendo:** tornar o repositório privado (a auditoria não achou nada sensível e a separação público/privado já é o desenho do projeto); reescrever o histórico por causa do e-mail; e voltar a listar arquivos individuais no `CLAUDE.md`.

## 8. Como aplicar depois da aprovação

1. Você responde com os IDs aprovados (ex.: "A1 a A6, B1, C1 sem o bullet 7, C2, C3, C4"). Itens não citados ficam de fora.
2. Eu regenero o texto a partir deste documento. O gerador confere que cada bloco "Antes" ainda aparece **exatamente uma vez** no `CLAUDE.md` (se o arquivo mudou, ele para), reconfere o mapa contra o `main` do momento e atualiza o SHA de conferência da nota.
3. Abro uma PR que altera **só** o `CLAUDE.md` (e o template de PR, se B1 for aprovado). O diff é idêntico aos blocos aprovados, e o `CODEOWNERS` exige a sua revisão.
4. Validação: testes, gitleaks, o verificador do mapa e a conferência de que as seções §1 a §9 mantêm número e ordem.
5. Mudança de código ou de configuração dos itens S1 a S10 é sempre outra PR, nunca esta.

## 9. Perguntas

- **Q1.** Quais itens aprova? (Recomendo todos.)
- **Q2.** B1: aceita o equivalente por REST no lugar do `gh pr view`?
- **Q3.** A4: mapa em nível de diretório com `(planejado)` (recomendado) ou a lista arquivo a arquivo do original, com a manutenção que isso pede?
- **Q4.** Das sugestões S1 a S10, quais viram PR e em que ordem? (Minha ordem: S1 é configuração sua, depois S4, S3, S5, S7, S6.)
