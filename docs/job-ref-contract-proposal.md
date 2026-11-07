# Proposta de contrato — `job_ref` (01_INGEST)

> Status: **DECIDIDA** pelo Fonseca em 2026-11-07 (as três recomendações: Q1, Q2 e Q3); o schema `contracts/job_ref.schema.json` segue esta proposta. Não autoriza merge.
> Rótulos: **VERIFIED** (visto em arquivo do repo), **PROPOSED** (desenho nosso), **UNKNOWN** (sem fonte).
> Fontes: `CLAUDE.md` §2, §5, §6, §7, §8 e a estrutura PLANNED; `docs/STAGES.md` (cartão 01_INGEST); `supabase/migrations/003_review_exit_provenance_attempts.sql` (colunas de `jobs`); `contracts/image_assets.schema.json`; `validators/citation.js`.
> **Premissa do Fonseca (2026-11-07):** o contrato H1 de entrada do job é tratado como **inexistente**. Esta proposta parte só do que o repositório sustenta.

## 1. O que fecha

O contrato da linha que o `01_INGEST` grava: o registro do arquivo que entrou no job. Ele diz o que foi ingerido, sem carregar o conteúdo.

## 2. O que o repositório diz sobre `job_ref` (VERIFIED)

- O `01_INGEST` "recebe PDF ou arquivo; salva origem e metadados; gera `job_ref`; atualiza o status para `PDF_PARSED`" (`STAGES.md`). Nada mais define o `job_ref`; o `CLAUDE.md` só lista `contracts/job_ref.schema.json` como planejado.
- O job já guarda `source_origin` (texto não vazio) e `input_context` (objeto), gravados por `create_job()`; o workflow de cada estágio recebe só o `job_id` e lê o resto por `get_job()` (`003`, `STAGES.md`). Esses dois não precisam ser repetidos aqui.
- Toda linha leva os 7 campos de proveniência; idempotência é `delete` + `insert` por `(job_id, stage)` (`CLAUDE.md` §6, §7). `image_assets` já é saída do `01_INGEST` (`stage` = `01_INGEST`): são as imagens que chegam junto com o job.
- O `citation.js` recebe o texto do PDF como lista por página, com `pages[0]` sendo a página 1 (decisão do Fonseca, 2026-11-07). O número de páginas precisa vir de algum registro.
- Nenhum PDF real, saída de LLM ou métrica entra no repositório público (`CLAUDE.md`). O contrato descreve a linha; o conteúdo vive no banco do cliente.

## 3. Duas leituras possíveis (a decisão é a Q1)

- **A (proposta aqui):** `job_ref` é o **registro da ingestão**: fatos do arquivo que não cabem em `jobs` e que os estágios seguintes precisam.
- **B:** `job_ref` é só uma **referência para passar o job entre estágios**. Mas isso já é o `job_id`, então o contrato seria quase vazio e não teria o que o `01_INGEST` "salva".

## 4. Campos propostos, leitura A (PROPOSED)

| Campo | Tipo | Regra | Quem valida |
| --- | --- | --- | --- |
| proveniência | — | os 7 campos; `stage` = `01_INGEST`; `model` = `not_reported` (a etapa não usa LLM) | schema |
| `file_sha256` | string | `^[0-9a-f]{64}$`; hash do arquivo recebido, para provar que dois jobs processaram o mesmo arquivo | schema (formato); o `01_INGEST` calcula |
| `page_count` | integer | `minimum 1`; igual ao tamanho da lista de textos por página que o `citation.js` recebe | schema (faixa), código (igualdade com as páginas gravadas) |
| `media_type` | enum | `application/pdf` (lista fechada; ver Q2) | schema |

`additionalProperties: false`. **Regras de código fora do schema:** uma linha por job; o `job_id` existe; `page_count` bate com as páginas gravadas; o `image_assets` do job, se existir, tem o mesmo `job_id`.

## 5. Fora desta proposta, de propósito

- **Metadados do paper** (título, autores, DOI, ano). Nenhum estágio os lê hoje e não há fonte para o conjunto de campos; ver Q3.
- **Texto do PDF ou das páginas.** Onde ele fica é **UNKNOWN** (a tabela `papers` é do schema privado `editorial_intel`, `PUBLIC_PRIVATE.md`, e o DDL não está neste repositório).
- **`source_origin` e `input_context`.** Já são colunas de `jobs`; duplicá-las criaria dois lugares para divergir.
- **Idioma, tamanho em bytes, nome do arquivo.** Sem fonte que os peça.

## 6. Plano de teste (quando aprovada)

- `contracts/job_ref.schema.json`; 2 fixtures válidas e 2 inválidas (proveniência ausente; `file_sha256` malformado) em `fixtures/synthetic/contracts/job_ref/`.
- `validators/contracts.test.js` ganha o contrato (mesmo padrão de `evidence`, `verification` e `insight`); mutação do schema.
- Validação: `node --test 'validators/*.test.js'`. Aceite: tudo verde e todos os mutantes detectados.

## 7. Perguntas (respondidas pelo Fonseca, 2026-11-07: as três recomendações)

- **Q1 → sim.** A leitura A é a certa? **Recomendo sim:** a B não tem conteúdo, e A dá ao `01_INGEST` o que o `STAGES.md` diz que ele salva, além de fechar a origem do número de páginas do `citation.js`.
- **Q2 → só PDF.** O MVP aceita só PDF? O `STAGES.md` diz "PDF ou arquivo". **Recomendo só `application/pdf` por ora:** outro tipo exige decidir como extrair texto por página, e isso não tem fonte.
- **Q3 → não por ora.** Os metadados do paper entram no `job_ref`? **Recomendo não por ora:** nenhum estágio os usa. Quando um usar, o campo entra com o conjunto exato que ele pedir.
