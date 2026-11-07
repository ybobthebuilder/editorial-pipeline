# Proposta de contrato — `evidence` (02_EXTRACT)

> Status: **PROPOSED**, para revisão por digest (`reviewed_commit_sha = null`). Não autoriza merge e **não cria arquivo em `contracts/`**: o schema só é escrito depois da aprovação (U2).
> Rótulos: **VERIFIED** (visto em arquivo do repo), **PROPOSED** (desenho nosso), **UNKNOWN** (sem fonte).
> Fontes: `CLAUDE.md` §3, §4, §7, §8; `docs/STAGES.md` (cartões 02_EXTRACT e 03_VERIFY); `docs/ALUCINAÇÃO_GUARD.md` §6 e §7; `docs/visual-layer/contracts-proposal.md` §2 e §3.

## 1. O que fecha

O contrato da linha que o `02_EXTRACT` produz: uma afirmação do paper com o trecho que a sustenta. O contrato de `verification` (03_VERIFY) é outro e fica fora desta proposta.

## 2. Fatos já decididos (VERIFIED)

- Toda linha leva os 7 campos de proveniência (`CLAUDE.md` §7). Aqui `stage` é a `const` `02_EXTRACT`.
- `source_text` existe literalmente na página informada, após normalizar espaços e hífens; os números da afirmação aparecem nesse trecho; a checagem é de código, nunca do LLM (`CLAUDE.md` §8).
- O status `VERIFIED` mora em `verification.status`, **não** na evidência (`CLAUDE.md` §4). A evidência não tem campo `verified` nem `status`: um campo escrito pelo LLM se justificaria sozinho.
- Valor desconhecido é `"not_reported"` dentro de um enum, não invenção (`CLAUDE.md` §8). O `schema.js` não aceita "string ou null" nem `$ref`, `oneOf`, `anyOf`, `format`, `uniqueItems`.
- A idempotência é `delete` + `insert` por `(job_id, stage)` (`CLAUDE.md` §6).

## 3. Campos propostos (PROPOSED)

| Campo | Tipo | Regra | Quem valida |
| --- | --- | --- | --- |
| proveniência | — | os 7 campos; `stage` = `02_EXTRACT` | schema |
| `evidence_id` | string | `^ev-[0-9]{4}$` (o formato já aparece nos exemplos dos prompts); único no job | schema (formato), código (unicidade) |
| `page` | integer | `minimum 1`; página do PDF contada a partir de 1 | schema; código confere que a página existe |
| `source_text` | string | `minLength 1`, `maxLength 1000`; literal na página | schema (tamanho), `validators/citation.js` (literalidade) |
| `claim` | string | `minLength 1`, `maxLength 300`; os números dela aparecem em `source_text` | schema (tamanho), `numbers.js` (números) |

`additionalProperties: false`. Os limites 1000 e 300 são palpite meu (sem fonte): ver Q2.

## 4. Fora desta proposta, de propósito

- `citation.js` (literalidade por página) é validador, não contrato; vem depois, com testes.
- Os números para o `computeDeltas` (antes e depois): ver Q1. Sem resposta, o contrato não os carrega.
- `kind` ou tipo de afirmação: não há fonte para um enum, então não existe. Enum inventado é o que o `CLAUDE.md` §8 proíbe.

## 5. Plano de teste (quando aprovada)

- `contracts/evidence.schema.json`, 2 fixtures válidas e 2 inválidas em `fixtures/synthetic/contracts/evidence/` (proveniência ausente; `page` 0).
- `validators/contracts.test.js` ganha o contrato; mutação do schema como nos outros três (cada campo, cada limite).
- Validação: `node --test 'validators/*.test.js'`. Aceite: tudo verde e todos os mutantes detectados.

## 6. Perguntas

- **Q1 (bloqueante para os deltas).** Quem pareia o "84" e o "92" para o `computeDeltas`? **A:** a evidência não carrega números estruturados; um contrato posterior (insight) pareia. **B (recomendada):** a evidência ganha `measures`, array de `{ "role": "before" | "after" | "single", "raw": "84%" }`, com `raw` escrito como no trecho (PT-BR); o código lê com `numbers.js` e confere que `raw` está em `source_text`. B mantém o LLM só extraindo, como em `CLAUDE.md` §3.
- **Q2.** Os limites de `source_text` (1000) e `claim` (300) estão certos, ou há tamanho definido?
- **Q3.** A página é contada a partir de 1? É a numeração do PDF ou a impressa na página?
