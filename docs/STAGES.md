# STAGES — Cartões de Etapa e Template Padrão

Este documento define a estrutura do pipeline e o boilerplate comum para todas as etapas do n8n.

## 1. Estado da máquina

```
RECEIVED → PDF_PARSED → EVIDENCE_EXTRACTED → EVIDENCE_VERIFIED → INSIGHTS_GENERATED → INSIGHTS_RANKED → VISUAL_PLANNED → COVERS_SPECIFIED → COVERS_RENDERED → QA_PASSED → AWAITING_APPROVAL → HUMAN_APPROVED → PUBLISHED

Erros: VERIFICATION_FAILED, QA_FAILED, RENDER_FAILED, NEEDS_REVIEW
Qualquer estado → NEEDS_REVIEW
``` 

## 2. Regras da transição

- O banco é a única fonte da máquina de estados
- A transição deve passar pela função `guard_transition()`
- Os workflows nunca alteram status diretamente
- Os workflow stage validam status esperado antes de processar
- Erros fatais ativam `NEEDS_REVIEW`

## 3. Template padrão de workflow: _TEMPLATE_STAGE

Cada workflow do n8n deve seguir este template base, com o mesmo fluxo e os mesmos critérios de validação.

```yaml
_template_stage:
  trigger:
    type: "When Executed by Another Workflow"
    input:
      - job_id

  steps:
    1. Stage Config
       - set variables:
           - STAGE
           - EXPECTED_STATUS
           - NEXT_STATUS
           - ERROR_STATUS

    2. Load Context
       - call: 90_DB_HELPERS.get_job(job_id)
       - call: get_config(key)
       - load: job context, config baseline/override

    3. Guard
       - verify current status == EXPECTED_STATUS
       - if false: stop and error

    4. Mark Running
       - call: mark_running(job_id, stage, execution_id)
       - save execution context

    5. WORK
       - one unique logic block per stage
       - no side effects outside stage contract

    6. Validate Contract
       - run validators for outputs
       - reject if schema invalid or evidence missing

    7. Persist
       - idempotent replace_rows by (job_id, stage)
       - save generated artifacts

    8. Log LLM Calls
       - model, prompt hash, latency, token count, execution_id

    9. Transition
       - call: set_status(job_id, NEXT_STATUS)

    10. Return
       - payload:
           job_id
           stage
           status
           counts
           warnings
           execution_id
```

## 4. Contrato de entrada e saída por etapa

Cada etapa deve respeitar:
- **Input**: job_id + dados mínimos do contexto
- **Output**: registros persistidos + status de transição
- **Validar**: schema, presença de campos obrigatórios, nenhuma alucinação
- **Persistir**: idempotente e rastreável

## 5. Regras de erro

### Error workflow
- `99_ERROR_HANDLER` deve estar configurado por workflow
- O handler deve:
  - localizar o job pela `last_execution_id`
  - registrar em `job_events`
  - classificar falha como retryable ou fatal
  - mover para `NEEDS_REVIEW` em caso fatal

### Retry
- LLM and HTTP nodes: retry 3x
- Fases de I/O: retry apenas quando recoverable
- Fases determinísticas: não reprocessar sem necessidade

## 6. Fases do projeto

### 00_ORCHESTRATOR
- lê o estado atual
- decide próxima etapa
- dispara o workflow correto
- repete até final ou espera humana

### 01_INGEST
- recebe PDF ou arquivo
- salva origem e metadados
- gera `job_ref`
- atualiza status para `PDF_PARSED`

### 02_EXTRACT
- separa páginas e trechos
- extrai estrutura textual
- produz entidades e seções
- atualiza `EVIDENCE_EXTRACTED`

### 03_VERIFY
- valida cada evidência
- compare com páginas e números
- confirma citação literal
- status: `EVIDENCE_VERIFIED` ou `VERIFICATION_FAILED`

### 04_INSIGHTS
- identifica afirmativas, conclusões e achados relevantes
- gera insights com uso controlado do LLM
- apenas sobre evidências verificados

### 05_SCORE
- calcula pontuações, deltas e conflitos
- usa regras em código
- gera scores e rankings

### 06_VISUAL
- escolhe gramática visual de lista fechada
- não inventa visual se não houver biblioteca permitida
- gera `visual_spec`

### 07_COVERS
- especifica capas e layouts
- usa parâmetros do baseline
- gera `cover_spec`

### 08_RENDER
- renderiza cover e layout final
- se falhar, status `RENDER_FAILED`

### 09_QA
- valida contrato final
- aplica quality gates
- status `QA_PASSED` ou `QA_FAILED`

### 10_APPROVAL
- aguarda aprovação humana
- status `AWAITING_APPROVAL`

### 11_HUMAN_APPROVED
- após revisão humana
- define publicação ou rebobinar

### 12_PUBLISHED
- estado final de publicação

## 7. Estrutura de cada card de etapa

Cada etapa deve ter:
- nome
- objetivo
- entrada
- saída
- leitura do banco
a - escrita do banco
- validação
- erro esperável
- não faz

Formato sugerido:

```md
# 03_VERIFY

## Objetivo
Validar evidências citadas e rejeitar valores ausentes ou inconsistentes.

## Entrada
- job_id
- evidence extraídas
- páginas do PDF

## Saída
- verification rows
- status atualizado

## Lê
- `jobs`
- `evidence`
- `config_baseline`

## Escreve
- `verification`
- `job_events`

## Validação
- citação literal
- suporte textual por página
- enum fechado

## Erro
- `VERIFICATION_FAILED`

## Não faz
- não gera insights
- não renderiza visual
```

## 8. Convenções de workflow

- timezone: `America/Sao_Paulo`
- banco: Postgres via nó Postgres (nunca via Supabase Data API)
- output sempre estruturado: `{ job_id, stage, status, counts, warnings }`
- credentials em UI do n8n, nunca no JSON público
- export sanitizado: sem secrets, sem URLs privadas, sem `pinData`

## 9. Checklist mínimo antes de validar um workflow

- [ ] Status esperado foi validado?
- [ ] `guard_transition()` foi consultado?
- [ ] `job_id` foi passado corretamente?
- [ ] Output foi persistido idempotente?
- [ ] `job_events` foi preenchido?
- [ ] Validators foram executados?
- [ ] O workflow ficou sanitizado?
- [ ] O erro foi previsto e identificado?
