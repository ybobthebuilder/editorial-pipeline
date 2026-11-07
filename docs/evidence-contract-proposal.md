# Proposta de contrato — `evidence` (02_EXTRACT)

> Status: **DECIDIDA** pelo Fonseca em 2026-11-07 (Q1 = B, limites 1000 e 300, página a partir de 1); o schema `contracts/evidence.schema.json` segue esta proposta. Não autoriza merge.
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
| `measures` | array | pode ser vazio (afirmação sem número); `maxItems 10`; cada item `{ role: before\|after\|single, raw }`, `raw` de 1 a 40 caracteres, escrito como no trecho (PT-BR); o código lê com `numbers.js` e confere que `raw` está em `source_text` | schema (forma), código (conteúdo) |

`additionalProperties: false`. Limites 1000 e 300 confirmados pelo Fonseca (Q2).

## 4. Fora desta proposta, de propósito

- `citation.js` (literalidade por página) é validador, não contrato: implementado em `validators/citation.js`, com as páginas como lista de textos (`pages[0]` é a página 1; decisão do Fonseca, 2026-11-07).
- O pareamento antes/depois para o `computeDeltas` é do código; o contrato só carrega os números crus (`measures`, Q1 = B).
- `kind` ou tipo de afirmação: não há fonte para um enum, então não existe. Enum inventado é o que o `CLAUDE.md` §8 proíbe.

## 5. Plano de teste (quando aprovada)

- `contracts/evidence.schema.json`, 2 fixtures válidas e 2 inválidas em `fixtures/synthetic/contracts/evidence/` (proveniência ausente; `page` 0).
- `validators/contracts.test.js` ganha o contrato; mutação do schema como nos outros três (cada campo, cada limite).
- Validação: `node --test 'validators/*.test.js'`. Aceite: tudo verde e todos os mutantes detectados.

## 6. Perguntas (respondidas pelo Fonseca, 2026-11-07)

Os limites de `maxItems 10` e de 40 caracteres em `raw` são escolha minha, sem fonte, e não foram perguntados: ajustáveis.
Da Q3 só se respondeu "a partir de 1"; **UNKNOWN** continua se é a numeração do PDF ou a impressa na página. O schema só exige inteiro >= 1.


- **Q1 → B.** Quem pareia o "84" e o "92" para o `computeDeltas`? **A:** a evidência não carrega números estruturados; um contrato posterior (insight) pareia. **B (recomendada):** a evidência ganha `measures`, array de `{ "role": "before" | "after" | "single", "raw": "84%" }`, com `raw` escrito como no trecho (PT-BR); o código lê com `numbers.js` e confere que `raw` está em `source_text`. B mantém o LLM só extraindo, como em `CLAUDE.md` §3.
- **Q2 → 1000 e 300 mantidos.** Os limites de `source_text` (1000) e `claim` (300) estão certos, ou há tamanho definido?
- **Q3 → a partir de 1.** A página é contada a partir de 1? É a numeração do PDF ou a impressa na página?
