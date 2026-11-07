# Proposta de contrato — `05_SCORE` (nota do paper e ranking dos insights)

> Status: **PROPOSED** (2026-11-07). Aguarda as respostas da §6. Não autoriza schema, validador nem merge: nenhum contrato é escrito antes de uma proposta aprovada (`CLAUDE.md` §10, U2).
> Rótulos: **VERIFIED** (visto em arquivo do repo ou dito pelo Fonseca), **PROPOSED** (desenho nosso), **UNKNOWN** (sem fonte).
> Fontes: `CLAUDE.md` §1, §3, §4, §5, §6, §7, §8, §9, §10; `docs/STAGES.md` (cartão 05_SCORE); `docs/insight-contract-proposal.md` §2, §4 e Q1; `docs/visual-layer/contracts-proposal.md` §4; respostas do Fonseca de 2026-11-07.

## 1. O que fecha

As linhas que o `05_SCORE` grava e a classificação que as alimenta: `paper_score` (uma por job), `insight_score` (uma por insight) e `paper_profile` (uma por job, gravada antes). Fecha também o schema de duas chaves de configuração: `scoring_weights` e `recognized_sources`.

## 2. Fatos já decididos (VERIFIED)

- **Fonseca, 2026-11-07:** o `05_SCORE` ranqueia **papers e insights**. A nota do paper fica **dentro do job**; comparar papers de jobs diferentes, para escolher qual vira job, fica fora da máquina de estados (no `editorial-intel`, privado). O **LLM classifica em enums fechados e o código calcula**.
- **Critérios da nota do paper (Fonseca):** (1) fonte: instituição ou pesquisador renomado; (2) o paper propõe resolver um gargalo comum a muitas áreas; (3) o paper apresenta a solução. Até esta proposta, só estavam na conversa.
- O `05_SCORE` "calcula pontuações, deltas e conflitos, usa regras em código, gera scores e rankings" (`STAGES.md`). Regras em código: **nenhum LLM no `05_SCORE`**.
- **Q1 = A do contrato `insight` (Fonseca):** o score e o ranking moram em contrato próprio do `05_SCORE`, uma linha por insight com `stage` = `05_SCORE` e o `insight_id`. A idempotência e a proveniência são por `(job_id, stage)`, então o `05_SCORE` não atualiza a linha do `04_INSIGHTS`.
- O `visual_spec` exige um `insight_id` que "existe e foi ranqueado" (`contracts-proposal.md` §4).
- A etapa criativa só lê evidência `VERIFIED` (`CLAUDE.md` §4); o que o LLM afirma precisa de `evidence_ids` `VERIFIED` (§8). Valor desconhecido é `"not_reported"` dentro de um enum; o `schema.js` não aceita "string ou null", `$ref`, `oneOf`, `anyOf`, `format`, `uniqueItems`.
- `scoring_weights` é chave inicial da configuração (`CLAUDE.md` §9) e o arquivo é planejado; o schema dele é **UNKNOWN** (U5 é outro item, o de `verification_thresholds`).
- `archetypes` ("arquétipos de paper", §9) também é chave planejada e não entra aqui.

## 3. Campos propostos (PROPOSED)

Todo contrato de linha: `additionalProperties: false`, os 7 campos de proveniência, `stage` como `const`, enums fechados.

**3.1 `paper_profile`** (`stage` = `04_INSIGHTS`, uma linha por job; ver Q3). É a única saída de LLM desta proposta.

| Campo | Tipo | Regra | Quem valida |
| --- | --- | --- | --- |
| proveniência | — | os 7 campos | schema |
| `source_entities` | array de `{ kind: institution\|researcher, name }` | pode ser vazio; `maxItems 20`; `name` de 1 a 120 caracteres, escrito como na fonte | schema (forma); código (cada `name` aparece literalmente no `source_text` de uma das evidências citadas) |
| `bottleneck` | enum | `sim`, `parcial`, `nao`, `not_reported`: o paper propõe resolver um gargalo comum a muitas áreas | schema |
| `solution` | enum | `sim`, `parcial`, `nao`, `not_reported`: o paper apresenta a solução | schema |
| `evidence_ids` | array de string | `minItems 1`; `^ev-[0-9]{4}$`; existem em `verification` do mesmo job e estão `VERIFIED` | schema (forma); código (existência, `VERIFIED`, mesmo job) |

**3.2 `paper_score`** (`stage` = `05_SCORE`, uma linha por job). Tudo calculado por código.

| Campo | Tipo | Regra | Quem valida |
| --- | --- | --- | --- |
| proveniência | — | os 7 campos | schema |
| `source_score`, `bottleneck_score`, `solution_score` | integer | 0 a 100 | schema (faixa); código (recalcula a partir de `paper_profile` e da configuração) |
| `total` | integer | 0 a 100: soma dos três pontos, ponderada por `scoring_weights`, dividida pela soma dos pesos, arredondada para o inteiro mais próximo (meio sobe) | código (recalcula e compara; divergência reprova) |

**3.3 `insight_score`** (`stage` = `05_SCORE`, uma linha por insight do job).

| Campo | Tipo | Regra | Quem valida |
| --- | --- | --- | --- |
| proveniência | — | os 7 campos | schema |
| `insight_id` | string | `^ins-[0-9]{4}$`; existe em `insight` do mesmo job; um `insight_score` por insight | schema (formato); código (existência, unicidade, cobertura) |
| `rank` | integer | `minimum 1`; os ranks do job são 1..N sem lacuna nem repetição | schema; código |
| `score` | integer | 0 a 100; a fórmula é **UNKNOWN** (Q2) | schema (faixa); código (quando houver fórmula) |

**3.4 Configuração.**
- `scoring_weights` (`config/baseline/scoring_weights.json`, com `.checksums`): `{ "paper": { "source": n, "bottleneck": n, "solution": n }, "enum_points": { "sim": 100, "parcial": 50, "nao": 0, "not_reported": 0 } }`. Os valores dos pesos são do Fonseca. O bloco dos insights espera a Q2.
- `recognized_sources` (nova chave, `config/baseline/recognized_sources.json`): lista de nomes de instituições e pesquisadores reconhecidos, definida pelo Fonseca. `source_score` é 100 se algum `name` de `paper_profile.source_entities` casar com a lista (comparação exata após a normalização de `citation.js`: Unicode NFC, hífens e espaços; maiúsculas e acentos **não** são igualados, então cada grafia usada nos papers entra na lista), e 0 se nenhum casar ou se a lista de entidades for vazia (falha fechado).
- Cada configuração ganha um contrato de configuração em `contracts/`, como `visual_library.schema.json`.

## 4. Fora desta proposta, de propósito

- **Comparar papers de jobs diferentes.** Decidido fora da máquina de estados (§2).
- **Fórmula de `insight_score.score`.** Os três critérios descrevem o paper, e não há fonte para os do insight (Q2).
- **Deltas e conflitos.** O cartão do `05_SCORE` os cita. `computeDeltas` existe em `validators/math.js` e `evidence.measures` carrega os números crus, mas nenhum contrato diz onde o resultado é gravado (Q5).
- **O prompt do LLM do `paper_profile`.** Vem depois do contrato (`skills/`).
- **Valores dos pesos e conteúdo de `recognized_sources`.** São seus.

## 5. Plano de teste (quando aprovada)

- `contracts/{paper_profile,paper_score,insight_score,scoring_weights,recognized_sources}.schema.json`; 2 fixtures válidas e 2 inválidas de cada em `fixtures/synthetic/contracts/` (proveniência ausente; faixa fora de 0 a 100).
- `validators/score.js`, JS puro: recalcula as notas e o `total` a partir de `paper_profile`, dos pesos e dos pontos dos enums; confere ranks 1..N sem lacuna, um `insight_score` por insight do job, `insight_id` existente e cada `name` literal na evidência citada; `not_reported` vale 0. Argumento do tipo errado é `TypeError`; dado ruim é veredito `{ passed, errors }` com motivos em `snake_case`, sem texto do PDF.
- `validators/contracts.test.js` ganha os contratos; mutação do schema e do validador (CP-VL2.6), com o resultado na PR.
- Validação: `node --test 'validators/*.test.js'`. Aceite: tudo verde e todos os mutantes detectados.
- A aprovação desta proposta também atualiza o `CLAUDE.md` (§9 ganha `recognized_sources`; o mapa ganha os contratos novos).

## 6. Perguntas (cada uma com a minha recomendação)

- **Q1. Escala e pontos dos enums.** **Recomendo** 0 a 100, com `sim` = 100, `parcial` = 50, `nao` = 0 e `not_reported` = 0 (o desconhecido nunca sobe a nota). Os pesos são números seus.
- **Q2. Critérios para ranquear insights.** UNKNOWN: seus três critérios descrevem o paper. **Recomendo** que você os defina; não invento. Sem eles, o contrato `insight_score` pode ser escrito (`rank` e `score`), mas o validador do `score` não.
- **Q3. Onde se grava o `paper_profile`.** **Recomendo** no `04_INSIGHTS`: é a primeira etapa criativa e só lê evidência `VERIFIED`. A alternativa é o `02_EXTRACT`, porque a instituição está na primeira página; mas lá ele ainda não tem evidência verificada.
- **Q4. Como se reconhece uma fonte.** **Recomendo** a lista `recognized_sources`, com casamento exato e nota 100 ou 0. O custo: "MIT" e "Massachusetts Institute of Technology" são entradas diferentes. Alternativas: níveis (por exemplo, 100, 60 e 0) ou lista privada no `editorial-intel`; esta última não é consultada nesta versão (U11-c).
- **Q5. Deltas e conflitos.** **Recomendo** deixá-los fora deste contrato e propô-los depois, quando houver a pergunta de onde são gravados. A alternativa é campos em `insight_score`.
- **Q6. Empate.** **Recomendo** `rank` único, com desempate por `insight_id` crescente.
