# Proposta de contrato — `verification` (03_VERIFY)

> Status: **DECIDIDA** pelo Fonseca em 2026-11-07 (as três recomendações: Q1, Q2 e Q3); o schema `contracts/verification.schema.json` segue esta proposta. Não autoriza merge.
> Rótulos: **VERIFIED** (visto em arquivo do repo), **PROPOSED** (desenho nosso), **UNKNOWN** (sem fonte).
> Fontes: `CLAUDE.md` §4, §5, §7, §8, §9; `docs/STAGES.md` (cartão 03_VERIFY); `docs/ALUCINAÇÃO_GUARD.md` §7; `docs/evidence-contract-proposal.md`; `validators/citation.js`; `validators/numbers.js`.

## 1. O que fecha

O contrato da linha que o `03_VERIFY` grava: o veredito sobre **uma** evidência, com o resultado de cada checagem de código. É a tabela de onde os contratos criativos (`visual_spec`, `cover_spec`, `post_copy`) leem para exigir `evidence_ids` `VERIFIED`.

## 2. Fatos já decididos (VERIFIED)

- O status `VERIFIED` mora em `verification.status`; etapa criativa rejeita evidência sem ele (`CLAUDE.md` §4). Os `evidence_ids` dos contratos criativos "existem em `verification` e estão `VERIFIED`" (§8).
- O `03_VERIFY` lê `evidence` e `config_baseline`, escreve `verification` e `job_events`; valida citação literal, suporte textual por página e enum fechado; termina em `EVIDENCE_VERIFIED` ou `VERIFICATION_FAILED` (`STAGES.md`).
- Toda linha leva os 7 campos de proveniência; `stage` aqui é a `const` `03_VERIFY`. Idempotência: `delete` + `insert` por `(job_id, stage)` (§6, §7).
- A checagem é de código, nunca da saída crua do LLM (§8). Valor desconhecido é `"not_reported"` dentro de um enum; o `schema.js` não aceita "string ou null", `$ref`, `oneOf`, `anyOf`, `format`, `uniqueItems`.
- Existem os motivos de código: `citation.js` (`pagina_inexistente`, `trecho_vazio`, `trecho_nao_encontrado`) e `numbers.js` (`formato_invalido`, `precisao_excedida`, `numero_nao_autorizado`, `unidade_divergente`).

**Inconsistência no `CLAUDE.md` §4:** o texto diz "`verified = true` em `verification.status`" e, em §8, "estar `VERIFIED`". Esta proposta usa só o segundo: `status` é um enum de texto, sem booleano.

## 3. Campos propostos (PROPOSED)

| Campo | Tipo | Regra | Quem valida |
| --- | --- | --- | --- |
| proveniência | — | os 7 campos; `stage` = `03_VERIFY`; `model` = `not_reported` se a etapa não usa LLM | schema |
| `evidence_id` | string | `^ev-[0-9]{4}$`; existe em `evidence` do mesmo job; **uma** linha por evidência | schema (formato), código (existência, unicidade, cobertura de todas as evidências do job) |
| `status` | enum | `VERIFIED` \| `FAILED` (lista fechada; ver Q1) | schema |
| `checks` | array | `minItems 1`, `maxItems 2`; itens `{ check_id, status, reasons }` | schema (forma) |
| `checks[].check_id` | enum | `CITATION` (`citation.js`) \| `NUMBERS` (`numbers.js` sobre a `claim` e sobre `measures[].raw`) | schema; código (sem repetir) |
| `checks[].status` | enum | `passed` \| `failed` | schema |
| `checks[].reasons` | array de enum, `maxItems 8` (o tamanho do enum; o código tira repetidos) | vazio quando `passed`; os 7 motivos acima mais `medida_fora_do_trecho` (novo: um `measures[].raw` que não está em `source_text`; ainda não existe no código) | schema (enum); código (coerência) |

`additionalProperties: false`. **Regras entre campos, de código e fora do schema:** `status = VERIFIED` se e somente se todos os `checks` estão `passed`; `reasons` vazio se e somente se `passed`; `check_id` sem repetição; coerência dos `reasons` com o `check_id` (os de citação só em `CITATION`).

## 4. Fora desta proposta, de propósito

- **Sem `confidence` nem nota.** `verification_thresholds` ("limites de confiança") não existe em `config/baseline/` e o que ele limita é **UNKNOWN** (U5). Campo de nota sem fonte é invenção.
- **Sem texto do PDF na linha.** Só motivos, como em `citation.js`.
- A regra de negócio "uma evidência `FAILED` derruba o job" é do estágio, não do contrato: ver Q3.
- O `medida_fora_do_trecho` e a conferência de `measures` precisam de código novo (`numbers.js` ou função própria); não estão neste contrato.

## 5. Plano de teste (quando aprovada)

- `contracts/verification.schema.json`; 2 fixtures válidas (uma `VERIFIED`, uma `FAILED` com `reasons`) e 2 inválidas (proveniência ausente; `status` fora do enum) em `fixtures/synthetic/contracts/verification/`.
- `validators/contracts.test.js` ganha o contrato (mesmo padrão do `evidence`); mutação do schema (cada campo, enum, limite).
- Validação: `node --test 'validators/*.test.js'`. Aceite: tudo verde e todos os mutantes detectados.

## 6. Perguntas (respondidas pelo Fonseca, 2026-11-07: as três recomendações)

`maxItems 2` em `checks` e `maxItems 8` em `reasons` são escolha minha, sem fonte, e não foram perguntados: ajustáveis.

- **Q1 → sim.** A lista fechada de `status` é só `VERIFIED` e `FAILED`? **Recomendo sim:** o `STAGES.md` só distingue sucesso e `VERIFICATION_FAILED`. Se existir um terceiro valor (por exemplo, "em revisão"), preciso do nome.
- **Q2 → adiar.** `verification_thresholds` participa do `03_VERIFY`? Se sim, preciso do schema dele (U5) antes de qualquer campo de nota. **Recomendo adiar:** o contrato nasce sem nota e ganha o campo quando o schema do limite existir.
- **Q3 → derruba o job.** Uma evidência `FAILED` derruba o job inteiro (`VERIFICATION_FAILED`) ou só fica de fora das etapas criativas? **Recomendo derrubar:** é o que o `STAGES.md` descreve, e o `VERIFICATION_FAILED → EVIDENCE_EXTRACTED` já existe como retry. Isso vai para o estágio, não para o schema.
