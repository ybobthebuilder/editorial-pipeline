# Proposta de contrato — `insight` (04_INSIGHTS)

> Status: **PROPOSED**, para revisão por digest (`reviewed_commit_sha = null`). Não autoriza merge e **não cria arquivo em `contracts/`**: o schema só é escrito depois da aprovação (U2).
> Rótulos: **VERIFIED** (visto em arquivo do repo), **PROPOSED** (desenho nosso), **UNKNOWN** (sem fonte).
> Fontes: `CLAUDE.md` §1, §3, §4, §6, §7, §8, §9; `docs/STAGES.md` (cartões 04_INSIGHTS e 05_SCORE); `docs/visual-layer/contracts-proposal.md` §4; `skills/art-director/SKILL.md`; `docs/evidence-contract-proposal.md`; `docs/verification-contract-proposal.md`.

## 1. O que fecha

O contrato da linha que o `04_INSIGHTS` grava: **um** insight, com o texto e as evidências que o sustentam. O score e o ranking (`05_SCORE`) ficam de fora: ver §4 e a Q1.

## 2. Fatos já decididos (VERIFIED)

- O `04_INSIGHTS` "identifica afirmativas, conclusões e achados relevantes", com "uso controlado do LLM", "apenas sobre evidências verificadas" (`STAGES.md`). Identificar insight é tarefa do LLM; calcular é do código (`CLAUDE.md` §1, §3).
- Etapa criativa só lê evidência `VERIFIED` (`CLAUDE.md` §4); `evidence_ids` existem em `verification` e estão `VERIFIED` (§8).
- O `05_SCORE` "calcula pontuações, deltas e conflitos, usa regras em código, gera scores e rankings"; o estado `INSIGHTS_RANKED` é o dele (`STAGES.md`, `CLAUDE.md` §5). Os estados são `INSIGHTS_GENERATED` (04) e `INSIGHTS_RANKED` (05).
- O `visual_spec` exige um `insight_id` que "existe e foi ranqueado" (`contracts-proposal.md` §4). O `art-director` recebe `{insight_id, text}` e "as evidências verificadas que o sustentam".
- Os exemplos já usam `ins-0001`, `ins-0002` (fixtures de `visual_spec`); o formato do id estava **UNKNOWN** (`contracts-proposal.md` §4) e passa a PROPOSED.
- Toda linha leva os 7 campos de proveniência; idempotência é `delete` + `insert` por `(job_id, stage)` (`CLAUDE.md` §6, §7). Valor desconhecido é `"not_reported"` dentro de um enum; o `schema.js` não aceita "string ou null", `$ref`, `oneOf`, `anyOf`, `format`, `uniqueItems`.

**Consequência que decide o desenho:** como a idempotência e a proveniência são por `(job_id, stage)`, o `05_SCORE` **não pode atualizar** a linha que o `04_INSIGHTS` gravou: reescrever o estágio 04 apagaria o ranking, e atualizar o 04 pelo 05 mentiria sobre `stage`. O ranking precisa ser linha do próprio `05_SCORE`.

## 3. Campos propostos (PROPOSED)

| Campo | Tipo | Regra | Quem valida |
| --- | --- | --- | --- |
| proveniência | — | os 7 campos; `stage` = `04_INSIGHTS` | schema |
| `insight_id` | string | `^ins-[0-9]{4}$`; único no job | schema (formato), código (unicidade) |
| `text` | string | `minLength 1`, `maxLength 300` (ver Q2); o texto do insight, em linguagem que a evidência sustenta | schema (tamanho); código (números); QA semântico (força da linguagem) |
| `evidence_ids` | array de string | `minItems 1`; cada id existe em `verification` do mesmo job e está `VERIFIED` | schema (forma), código (existência, `VERIFIED`, mesmo job) |

`additionalProperties: false`. **Regras de código fora do schema:** os números de `text` aparecem no conjunto permitido, montado pelo código a partir das evidências citadas (`numbers.js`, como na capa); `evidence_ids` sem repetição; nenhum `evidence_id` fora do job.

## 4. Fora desta proposta, de propósito

- **Score e ranking.** Não há campo `score`, `rank` nem `weight` aqui. `scoring_weights` e `hook_rules` não existem em `config/baseline/` e o que eles definem é **UNKNOWN**. Campo de nota sem fonte é invenção (`CLAUDE.md` §8).
- **Tipo ou categoria do insight.** Nenhum enum tem fonte; `archetypes` classifica o paper, não o insight.
- **Texto do PDF.** O insight lê evidência verificada, não o PDF (`CLAUDE.md` §4).
- O `05_SCORE` precisará do seu próprio contrato (Q1), que também responde ao "foi ranqueado" do `visual_spec`.

## 5. Plano de teste (quando aprovada)

- `contracts/insight.schema.json`; 2 fixtures válidas e 2 inválidas (proveniência ausente; `evidence_ids` vazio) em `fixtures/synthetic/contracts/insight/`.
- `validators/contracts.test.js` ganha o contrato (mesmo padrão de `evidence` e `verification`); mutação do schema.
- Validação: `node --test 'validators/*.test.js'`. Aceite: tudo verde e todos os mutantes detectados.

## 6. Perguntas (uma por vez, com a minha recomendação)

- **Q1 (bloqueante).** Onde mora o score e o ranking? **A (recomendo):** em contrato próprio do `05_SCORE`, uma linha por insight com `stage` = `05_SCORE`, referenciando `insight_id`; o contrato `insight` fica só com a saída do `04`. É o único desenho que respeita `(job_id, stage)`. **B:** campos de score opcionais na própria linha do insight, gravados pelo `05`. Exige abrir uma exceção à regra de `stage`, e eu não recomendo. Em qualquer caso o contrato do `05_SCORE` espera o schema de `scoring_weights` (hoje inexistente).
- **Q2.** `text` ≤ 300 caracteres, como a `claim`? **Recomendo sim.** Se o insight puder ser um parágrafo, preciso do limite.
- **Q3.** Um insight pode combinar várias evidências (`evidence_ids` com mais de um item)? **Recomendo sim:** "insight" é síntese, e o `art-director` já recebe "as evidências" no plural. O cuidado fica na checagem de números e no QA semântico.
