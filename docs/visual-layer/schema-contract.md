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
