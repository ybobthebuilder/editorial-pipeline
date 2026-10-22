# Proposta de contratos — `visual_spec`, `cover_spec`, `qa_result` (VL-3, passo 1)

> Status: **PROPOSED**, para revisão por digest (`reviewed_commit_sha = null`). Não autoriza merge e **não cria nenhum arquivo em `contracts/`**: os schemas só são escritos depois da aprovação (U2, CP-VL3.1).
> Rótulos: **VERIFIED** (visto em arquivo do repo), **PROPOSED** (desenho nosso), **UNKNOWN** (sem fonte; vira pergunta na §7).
> Companheiros: `contexto.md`, `roadmap.md`, `checkpoints.md`, `validators.md`, e `skills/` (rascunhos dos manuais dos estágios).

## 1. O que esta proposta fecha

Os três contratos que `STAGES.md` §6 manda gerar: `visual_spec` (06_VISUAL), `cover_spec` (07_COVERS), `qa_result` (09_QA). O 08_RENDER não gera contrato de LLM: é código.

## 2. O que o `schema.js` consegue validar (VERIFIED, `validators.md` §2)

`type` com um nome só, `enum`, `const`, `required`, `properties`, `additionalProperties` booleano, `items` com um schema, `minItems`, `maxItems`, `minLength`, `maxLength`, `pattern`, `minimum`, `maximum`. Recusa `$ref`, `oneOf`, `anyOf`, `format`, `uniqueItems`.

Consequências para os contratos, todas **PROPOSED**:
- Sem "string ou null". Ausência é a string `"not_reported"` dentro de um enum (`CLAUDE.md` §8).
- Sem mapa de chaves livres. `slots` é um **array** de objetos com `slot_id`.
- Unicidade (`slot_id`, `gate_id`) e regras entre campos ficam em validador de código, não no schema.

## 3. Bloco de proveniência (comum aos três; `CLAUDE.md` §7, `ALUCINAÇÃO_GUARD.md` §6)

| Campo | Tipo | Regra |
| --- | --- | --- |
| `job_id` | string, uuid | existe em `editorial.jobs` (código) |
| `stage` | string, `const` | `06_VISUAL`, `07_COVERS` ou `09_QA`, conforme o contrato |
| `config_source` | enum | `public` ou `private` |
| `config_version` | string | não vazio |
| `model` | string | nome do modelo, ou `not_reported` se o estágio não usou LLM |
| `execution_id` | string | não vazio |
| `created_at` | string | ISO 8601 em UTC (`pattern`) |

Sem qualquer um destes, o schema reprova (CP-VL3.3). Idempotência: `delete` + `insert` por `(job_id, stage)` (`CLAUDE.md` §6).

## 4. `visual_spec` (06_VISUAL)

| Campo | Tipo | Regra | Origem |
| --- | --- | --- | --- |
| proveniência | — | §3 | código |
| `insight_id` | string | existe e foi ranqueado (código). Formato do id: **UNKNOWN** (tabela `insights` não existe no repo) | código |
| `evidence_ids` | array de string, `minItems 1` | cada id existe em `verification` e está `VERIFIED` (código, `CLAUDE.md` §4) | LLM propõe, código valida |
| `grammar_id` | string | **valor de `visual_library.grammars`** ou `not_reported`. Lista: **UNKNOWN (U3)** | LLM escolhe, código valida |
| `rationale` | string, `maxLength 280` | opcional, só para auditoria; nenhuma etapa lê | LLM |

Se `grammar_id` vale `not_reported`, o código não grava o `visual_spec` e leva o job a `NEEDS_REVIEW`. `STAGES.md`: "não inventa visual se não houver biblioteca permitida".

**Cores, fontes, coordenadas e template não são escolhas do LLM.** O template vem da gramática por mapeamento na config (`visual_library`); os tokens de cor vêm do template. Isso mantém os pares de cor sob `contrast.js` e fora do modelo.

## 5. `cover_spec` (07_COVERS)

| Campo | Tipo | Regra | Origem |
| --- | --- | --- | --- |
| proveniência | — | §3 | código |
| `visual_spec_id` | string | existe e é do mesmo `job_id` (código) | código |
| `template_id` | enum | exatamente os 6 ids de `templates.json` (**VERIFIED**): `post-01-manifesto`, `post-02-metrica`, `carousel-01-capa`, `story-01-convite`, `reel-01-capa`, `reel-02-overlay`; coerente com a gramática (código) | código, a partir da gramática |
| `evidence_ids` | array de string, `minItems 1` | igual ao `visual_spec` | LLM propõe, código valida |
| `slots` | array de `{ slot_id, kind, lines }` | ver abaixo | LLM escreve o texto |
| `alt_text` | string, `minLength 1` | descrição da capa para leitores de tela | LLM |

`slots[]`:
- `slot_id`: string. Os ids existentes **dependem do mapa de slots v0 (CP-VL1.5, ainda não feito)**: hoje nenhum `<text>` dos SVGs tem `id`. **UNKNOWN**.
- `kind`: enum `claim` ou `chrome`. `claim` é texto que afirma algo e passa por `numbers.js`; `chrome` é elemento fixo de layout (contador `01 / 06`, rodapé) e não passa. Quem define o `kind` de cada slot é o **mapa de slots**, não o LLM; o código sobrescreve qualquer `kind` vindo do modelo.
- `lines`: array de string, `minItems 1`. Orçamento por slot (linhas e caracteres) vem do mapa e é conferido por `geometry.js` (**bloqueado por este contrato e pelo mapa**).

**Números.** O conjunto de números permitidos é **montado pelo código** a partir das evidências `VERIFIED` de `evidence_ids` e de `computeDeltas`, e entregue a `checkNumbersAllowed` (`numbers.js`). Nunca sai de campo escrito pelo LLM, senão a checagem se justificaria sozinha.

Exemplo sintético (valores do exemplo de `CLAUDE.md` §3, sem conteúdo real):

```json
{
  "job_id": "00000000-0000-4000-8000-000000000001",
  "stage": "07_COVERS",
  "config_source": "public",
  "config_version": "v1",
  "model": "not_reported",
  "execution_id": "exec-0001",
  "created_at": "2026-10-22T12:00:00Z",
  "visual_spec_id": "vs-0001",
  "template_id": "post-02-metrica",
  "evidence_ids": ["ev-0001"],
  "slots": [
    { "slot_id": "headline", "kind": "claim", "lines": ["De 84% para 92%", "em um ano"] },
    { "slot_id": "counter", "kind": "chrome", "lines": ["01 / 06"] }
  ],
  "alt_text": "Capa escura com a variação de 84% para 92% em destaque."
}
```

`slot_id` `headline` e `counter` são fictícios.

## 6. `qa_result` (09_QA)

| Campo | Tipo | Regra | Origem |
| --- | --- | --- | --- |
| proveniência | — | §3 | código |
| `cover_spec_id` | string | existe e é do mesmo `job_id` | código |
| `gates` | array de `{ gate_id, status, detail }` | ver abaixo | código |
| `semantic` | objeto `{ verdict, reasons }` | só existe se todos os `gates` passaram | LLM |
| `passed` | boolean | **calculado por código**: todos os gates `passed` e `semantic.verdict` igual a `pass` | código |

`gates[]`:
- `gate_id`: enum. Do relatório (referência de design-time, `contexto.md` §3): `QA-DIM`, `QA-OVF`, `QA-SAFE`, `QA-CTR`, `QA-TOK`, `QA-TYPE`, `QA-GRID`. Proponho acrescentar `QA-NUM` (números, `numbers.js`) e `QA-ENUM` (enums e `evidence_ids`). A definição exata de cada um é **UNKNOWN**: o relatório descreve nós Figma; aqui o alvo é SVG e slots.
- `status`: enum `passed`, `failed`, `waived`. Regra entre campos, em código: `waived` exige `detail` e não vale para gates regulatórios (se D-05 for sim).
- `detail`: string curta, o motivo mensurável (ex.: razão de contraste calculada).

`semantic` (o único uso de LLM em 09_QA):
- `verdict`: enum `pass` ou `fail`.
- `reasons`: array de enum. Lista **PROPOSED**: `afirmacao_sem_evidencia`, `exagero_de_forca`, `causalidade_indevida`, `alt_text_inconsistente`, `tom_promocional`. Vazio quando `pass`.

A ordem é fixa e feita pelo código: gates determinísticos primeiro; o juiz semântico só roda se todos passaram. Falha em qualquer um leva a `QA_FAILED`, e o retry é do orquestrador (`attempt_count`, limite 3), nunca um laço entre LLMs.

## 7. Perguntas ao Fonseca (nenhuma é respondida por esta proposta)

| ID | Pergunta | Bloqueia |
| --- | --- | --- |
| U3 | Quais são as gramáticas de `visual_library`, e `grammar` é a mesma coisa que `template`? Aqui as trato como coisas distintas: a gramática escolhe, a config mapeia para o template | `grammar_id`, VL-4 |
| U12 | Mapa de slots v0 (ids, orçamento por linha, `kind`): fazer agora, a partir dos 6 SVGs? | `slots`, `geometry.js` |
| D-05 | As regras do CFM se aplicam a este pipeline? Hoje são `UNKNOWN`. Se sim: chave `cfm_blocklist` na config, gate `QA-CFM`, e o rodapé é um slot `chrome` | gates, copy |
| U13 | `alt_text` obrigatório (como acima) ou opcional? | `cover_spec` |
| U14 | `rationale` do `visual_spec` fica (auditoria) ou sai (menos texto livre do modelo)? | `visual_spec` |
| U15 | Formato dos ids (`insight_id`, `evidence_ids`, `visual_spec_id`): uuid ou outro? As tabelas ainda não existem | todos |
| U16 | Lista de `reasons` do juiz semântico: aceita a lista acima? | `qa_result` |
| U17 | O enum de `grammar_id` entra no schema (e o schema é regenerado a cada mudança de `visual_library`) ou o schema só confere o tipo e um validador compara com a config? Recomendo o segundo: uma só fonte da verdade | CP-VL3.3 |

## 8. Como cada regra é verificada (CP-VL3.2 e CP-VL3.3)

| Regra | Quem verifica |
| --- | --- |
| forma, tipos, campos obrigatórios, enums fixos, proveniência | `schema.js` com `contracts/*.schema.json` |
| `grammar_id` na lista da config; `evidence_ids` existentes e `VERIFIED`; mesmo `job_id` | validador de código, com a config e o banco |
| números dos slots `claim` | `numbers.js`, com o conjunto montado pelo código |
| contraste dos pares do template | `contrast.js` |
| linhas e caracteres, zona segura | `geometry.js` (bloqueado) |
| unicidade de `slot_id` e `gate_id`; `waived` proibido onde cabe | validador de código |

Fixtures: duas válidas e duas inválidas por contrato, sintéticas, em `fixtures/synthetic/`.
