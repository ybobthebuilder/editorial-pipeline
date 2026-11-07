# Fontes do n8n para a Fase 4 (Q3 de `n8n-infra-proposal.md`)

> Status: **parcial** (2026-11-07). A documentação oficial do n8n cobre o **envelope** do workflow, as **configurações do workflow** e o **comportamento** de cada nó, mas **não** as chaves JSON do que cada nó guarda em `parameters`. Essas ainda pedem um export real (§4). Nenhum JSON de workflow foi escrito.
> Rótulos: **VERIFIED** (lido na fonte citada, em 2026-11-07), **PROPOSED** (leitura nossa), **UNKNOWN** (sem fonte).
> Como foi lido: `docs.n8n.io` foi liberada na rede do ambiente, e as páginas vieram com `curl` em Markdown (acrescentar `.md` ao endereço; índice em `https://docs.n8n.io/llms.txt`).

## 1. O envelope do workflow (VERIFIED)

Fonte: `https://docs.n8n.io/connect/n8n-api/workflow.md`, que embute a especificação OpenAPI 3.0.0 da API pública do n8n, versão **1.1.1**. É o contrato do que a API aceita e devolve, e não uma descrição do arquivo baixado pela interface (ver §2, item 6).

- **Workflow.** Obrigatórios na criação: `name`, `nodes`, `connections`, `settings`. Também existem `nodeGroups`, `staticData`, `pinData`, `description`, `projectId`, `parentFolderId`, `shared`, `meta` e `tags`; `id`, `active`, `activeVersionId`, `createdAt`, `updatedAt`, `isArchived`, `versionId`, `triggerCount`, `meta`, `tags` e `activeVersion` são só de leitura. `additionalProperties` é `false`.
- **`pinData`** é propriedade do workflow. O sanitizador precisa removê-lo (regra de `CLAUDE.md`: workflows públicos sem `pinData`).
- **Nó** (`nodes[]`, `additionalProperties: false`): `id`, `name`, `webhookId`, `disabled`, `notesInFlow`, `notes`, `type` (string), `typeVersion` (número), `executeOnce`, `alwaysOutputData`, `retryOnFail`, `maxTries`, `waitBetweenTries`, `continueOnFail`, `onError`, `position` (array de números), `parameters` (objeto livre), `credentials` (objeto livre), `customTelemetryTags`, `extendsCredential`.
- **`settings`** (`additionalProperties: false`): `saveExecutionProgress` (boolean), `saveManualExecutions` (boolean), `saveDataErrorExecution` (`all` ou `none`), `saveDataSuccessExecution` (`all` ou `none`), `executionTimeout` (número), `errorWorkflow` (string), `timezone` (string), `executionOrder` (string), `callerPolicy` (`any`, `none`, `workflowsFromAList` ou `workflowsFromSameOwner`), `callerIds` (string), e outras: `binaryMode`, `timeSavedMode`, `timeSavedPerExecution`, `redactionPolicy`, `availableInMCP`, `customTelemetryTags`, `credentialResolverId`.
- **`connections`** é um objeto; a especificação não descreve o formato interno.

## 2. O que a documentação diz de cada nó (VERIFIED), e o que ela não diz

Fonte: `https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflowtrigger.md`, `...errortrigger.md`, `...executeworkflow.md` e `.../app-nodes/n8n-nodes-base.postgres.md`; configurações em `https://docs.n8n.io/build/manage-workflows/configure-workflow-settings.md`.

| Nó | Nome de exibição na documentação | O que ela afirma |
| --- | --- | --- |
| Gatilho de sub-workflow | **Execute Sub-workflow Trigger**, também intitulado **When Executed by Another Workflow** na busca de nós de gatilho | Deve ser o primeiro nó. **Input data mode**: *Define using fields below*, *Define using JSON example* ou *Accept all data*. |
| Gatilho de erro | **Error Trigger** | Cria um workflow de erro; no workflow que falha, o *Error workflow* é escolhido nas configurações. Dados padrão: `execution.id`, `execution.url`, `execution.retryOf`, `execution.error.message`, `execution.error.stack`, `execution.lastNodeExecuted`, `execution.mode`, `workflow.id`, `workflow.name`. **`execution.id` e `execution.url` só existem se a execução foi salva no banco**; `retryOf` só em reexecução. Se o erro vem do gatilho do workflow principal, o formato muda (bloco `trigger` no lugar de parte de `execution`). |
| Chamada de sub-workflow | **Execute Sub-workflow** | **Source**: *Database* (com *From list* ou *Workflow ID*), *Local File*, *Parameter* ou *URL*; **Workflow Inputs** (aparecem só com *Database* e *From list*, e não aparecem se o gatilho usa *Accept all data*); **Mode**: *Run once with all items* ou *Run once for each item*. |
| Postgres | **Postgres**, operação **Execute Query** | **Credential to connect with**, **Operation**, **Query** (aceita `$1`, `$2`, ... para instruções preparadas), e em *Options*: **Query Parameters** (lista separada por vírgulas; o exemplo da documentação é uma expressão `{{ [ 'users', $json.email ] }}`), **Query Batching** (*Single Query*, *Independently* ou *Transaction*), **Connection Timeout**, **Delay Closing Idle Connection**, **Output Large-Format Numbers As** e **Replace Empty Strings with NULL**. A documentação diz que o n8n sanitiza os dados dos parâmetros, o que evita injeção de SQL. O exemplo da documentação usa `$1:name` para o nome da tabela. |

**Configurações do workflow na interface** (rótulos): *Execution order*, *Error Workflow*, *This workflow can be called by*, *Timezone*, *Save failed production executions*, *Save successful production executions*, *Save manual executions*, *Save execution progress*, *Timeout Workflow*. **PROPOSED:** correspondem, nesta ordem, a `executionOrder`, `errorWorkflow`, `callerPolicy`, `timezone`, `saveDataErrorExecution`, `saveDataSuccessExecution`, `saveManualExecutions`, `saveExecutionProgress` e `executionTimeout`; a documentação não faz essa ligação, é só semelhança de nome. Sem fuso configurado, o n8n usa o horário de Nova York.

**UNKNOWN, e é o que um export real resolve:**

1. A grafia exata do `type` de cada nó no JSON. A documentação mostra o tipo só no endereço da página, em minúsculas (`n8n-nodes-base.executeworkflowtrigger`).
2. O `typeVersion` de cada um dos quatro nós.
3. As chaves JSON de `parameters` de cada nó (por exemplo, como *Query*, *Query Parameters* e *Operation* aparecem no Postgres). A especificação trata `parameters` como objeto livre.
4. O formato do bloco `credentials` de um nó Postgres. A especificação trata como objeto livre.
5. O formato de `connections`.
6. Quais chaves o **arquivo baixado pela interface** (*Workflow menu > Download*) traz: a especificação descreve a API, e o arquivo da interface pode incluir ou omitir chaves (a documentação só avisa que o arquivo inclui nomes e IDs de credenciais).
7. Como o valor de *Save failed production executions* aparece no JSON do export (`all`, `none` ou outro).

## 3. Consequências para o que já está proposto

- **`99_ERROR_HANDLER` acha o job por `last_execution_id`.** `execution.id` só existe se a execução foi salva; por isso "salvar execuções com sucesso e com erro" (`CLAUDE.md`, configurações obrigatórias) é pré-condição, e não conforto. O erro do gatilho do workflow principal chega sem `execution.id`: o handler precisa tratar esse formato (**PROPOSED**: classificar como fatal e registrar sem job).
- **Idempotência (`delete` + `insert` na mesma transação).** *Query Batching = Transaction* executa todas as consultas numa transação, com rollback se uma falhar. **PROPOSED:** é o candidato para o passo Persist; falta confirmar com o export como isso aparece no JSON.
- **Parâmetros ligados.** A regra "nunca concatenar na string SQL" tem fonte: *Query Parameters* com `$1`, `$2`.
- **Sanitizador (`sanitize-workflow`).** O que se pode afirmar agora: o envelope tem `pinData` (remover) e `credentials` por nó (remover ou trocar por placeholder). A lista de chaves permitidas por nível (lista de permissão, `n8n-infra-proposal.md` §5) espera os itens 1 a 6 acima.

## 4. O que ainda é preciso: um export (cerca de 10 minutos)

Um export sintético, de workflows com nomes `ZZ_SAMPLE_*`, e sem credenciais reais (a documentação avisa que o export traz os nomes e IDs das credenciais; use o nome `CRED_PLACEHOLDER`):

1. **`ZZ_SAMPLE_SUB`:** o gatilho *Execute Sub-workflow Trigger*, com *Input data mode* em *Accept all data*; um nó **Postgres**, operação *Execute Query*, com uma consulta que use `$1` e, em *Options*, **Query Parameters** com uma expressão (por exemplo `{{ [ $json.job_id ] }}`) e **Query Batching** em *Transaction*.
2. **`ZZ_SAMPLE_ERR`:** o **Error Trigger** como primeiro nó (pode ser só ele).
3. **`ZZ_SAMPLE_MAIN`:** um gatilho manual e o nó **Execute Sub-workflow** chamando o `ZZ_SAMPLE_SUB`. Nas configurações: *Error Workflow* = `ZZ_SAMPLE_ERR`, *Timezone* = `America/Sao_Paulo`, *Save failed production executions* e *Save successful production executions* em *Save*.
4. Em cada um: *Workflow menu > Download* (a documentação descreve esse caminho) e colar o JSON como está.

Com isso saem os itens 1 a 7 da §2, e a Fase 4 destrava sem eu inventar nenhum campo.
