# Guardrails Anti-Alucinação

Este documento define o que NUNCA pode ser inventado ou assumido durante a construção do projeto editorial-pipeline.

## 1. NUNCA inventar parâmetros, endpoints ou campos

- Não inventar parâmetros de nós do n8n
- Não inventar endpoints do Supabase
- Não inventar colunas, views, functions ou triggers que não existam no schema verificado
- Não assumir que uma opção de nó existe sem confirmação na documentação oficial

Fontes de verdade:
- docs.n8n.io
- supabase.com/docs
- migrations do repo público
- schema dump atual do banco

## 2. NUNCA inventar schema sem verificar

- Sempre conferir `supabase/migrations/` antes de escrever SQL
- Sempre conferir o `schema dump` antes de alterar uma tabela
- Sempre validar se colunas e funções existem antes de usar
- Qualquer alteração de schema deve ser feita via migration reprodutível

## 3. NUNCA fazer UPDATE direto do status

- O status é controlado pela máquina de estados
- Workflows devem sempre chamar `mark_running()` e `set_status()`
- Nunca usar `UPDATE ... SET status = ...` em lógica de workflow sem passar pela função autorizada

## 4. NUNCA criar dados privados em repo público

- Não incluir segredos, tokens, URLs privadas, exports reais, PDFs reais, outputs de LLM, dados de produção
- `editorial-intel` é privado e não deve ser importado por `editorial-pipeline`
- Segredos ficam apenas em `.env` (gitignored)

## 5. NUNCA usar AI Agent como controlador

- O LLM pode extrair, resumir, classificar, sugerir headline e gramática visual
- O código controla:
  - cálculo de deltas
  - validações
  - retries
  - status
  - arquivos
  - render
  - transições

**Proibido**:
- Agents autônomos aninhados
- loops de LLM sem supervisão
- decisões de negócio no modelo sem validação em código

## 6. NUNCA deixar ausência de proveniência

Toda linha gerada deve incluir:
- `job_id`
- `stage`
- `config_source`
- `config_version`
- `model`
- `execution_id`
- `created_at`

Se a linha não é rastreável, ela não entra no banco.

## 7. NUNCA permitir alucinação de valor

- Enums fechados
- Valores desconhecidos devem virar `null` ou `"not_reported"`
- Números da claim devem existir no trecho citado
- `source_text` deve existir literalmente no texto da página informada
- `evidence_ids` devem existir e estar `VERIFIED`

## 8. NUNCA assumir que a etapa funciona sem teste

Toda implementação exige:
- um teste ou validação
- script de checagem
- critério de aceitação

## 9. NUNCA perder o equilíbrio público/privado

- `editorial-pipeline` (público): código, configs base, migrates, docs, fixtures sintéticas
- `editorial-intel` (privado): modelos aprendidos, dados reais, notebooks, relatórios

O público deve funcionar sem o privado.

## Checklist obrigatório antes de qualquer resposta

Antes de responder, confirmar:

- [ ] Consultei a documentação oficial relevante?
- [ ] Não inventei parâmetros, campos ou endpoints?
- [ ] Não assumi schema sem verificar?
- [ ] Não toquei em código privado?
- [ ] O output é pequeno, atômico e testável?
- [ ] A resposta inclui validação ou teste?
- [ ] O contexto do projeto foi checado antes de afirmar?
- [ ] O que foi entregue é auditável?

## Regras de saída

Cada resposta deve ser:
- atômica
- pequena
- testável
- auditável
- rastreável

Se algo não for verificável, a resposta deve parar e pedir a fonte correta.

## Política de parada

Se faltar qualquer um destes:
- schema atual
- migration relevante
- template da etapa
- documentação de uma ferramenta
- critério de aceitação

A resposta deve cessar e pedir a informação em vez de supor.

---

# Resumo em uma frase

Nenhuma decisão arquitetural, SQL, workflow, endpoint ou token deve ser criada sem origem verificável, rastreabilidade e teste. 
