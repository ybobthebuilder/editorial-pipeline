# Fronteira Público/Privado

Este documento define a divisão formal entre o código público e os dados/configuração aprendida privada.

## 1. Repositório público: editorial-pipeline

`editorial-pipeline` é o repositório auditável, reproduzível e funcional sem depender do privado.

### Contém
- código
- migrations
- docs
- contratos
- validators
- config baseline
- prompts baseline
- workflows sanitizados
- fixtures sintéticas

### Não contém
- PDFs reais
- outputs de LLM em produção
- dados privados
- contextos aprendidos
- configuração corporativa sensível
- exports com dados reais

## 2. Repositório privado: editorial-intel

`editorial-intel` concentra tudo que representa aprendizado e sobreposição de configuração.

### Contém
- `config_overrides`
- prompts v2+ e ajustes de prompt
- modelos ajustados
- notebooks
- relatórios e analytics
- exports e queries internas
- fixtures com papers reais

### Regra
- o repositório privado deve acrescentar valor, não quebrar o público
- o público nunca deve depender do privado para funcionar

## 3. Esquema de banco

### `editorial` (público/auditável)
Fonte de verdade para:
- `state_transitions`
- `config_baseline`
- `jobs`, com proveniência e `attempt_count` (decisões U11-h, U11-n, U11-o)
- `signatures`: assinaturas humanas do gate, por job (decisão U11-j)
- funções de transição e acesso ao config
- views e contratos públicos

### `editorial_intel` (privado)
Fonte de verdade para:
- evidences, verification (`jobs` está em `editorial`, decisão U11-h)
- insights, visual specs, cover specs
- analytics and experiments
- config overrides

## 4. Configuração em camadas

`get_config(key)` deve retornar:

```json
{
  "content": "...",
  "source": "public",
  "version": "v1",
  "hash": "sha256"
}
```

Illustrative JSON only: `source` may be `"public"` or `"private"`; the other strings are placeholders. This example does not verify a deployed function, schema, or executable contract.

### Ordem de resolução nesta versão

`get_config` lê só a camada pública (decisão U11-c):
1. lê `editorial.config_baseline`
2. devolve `source: "public"`
3. chave ausente levanta erro, sem valor padrão
4. o hash precisa bater com o repositório público

A ordem com sobreposição privada (override primeiro; baseline se não houver override; sobreposição ativa em caso de conflito) é alvo futuro. Não é executada hoje e exige migração própria, com fallback documentado. Nenhum workflow pode depender de `config_overrides` antes disso.

## 5. Segurança

- RLS obrigatório em todas as tabelas
- REVOKE ALL para `anon` e `authenticated`
- role `n8n_pipeline` com permissões mínimas
- `n8n_pipeline` pode:
  - EXECUTE em `guard_transition`, `set_status`, `mark_running` e `get_config`
  - SELECT em `state_transitions`, `config_baseline`, `jobs` e `signatures`
- `n8n_pipeline` não grava direto em `signatures` nem em `jobs`: o status muda por `set_status`
- `human_reviewer` é um papel separado, sem relação de membro com `n8n_pipeline`: lê `jobs` e `signatures` e insere assinaturas de jobs em AWAITING_APPROVAL. A credencial dele não pode ficar em workflow não supervisionado
- permissões sobre tabelas de `editorial_intel` não existem ainda; serão definidas na migração que criar essas tabelas
- `n8n_pipeline` não deve ter acesso irrestrito a schemas privados

## 6. Regras de exposição

- O schema público e o baseline são auditáveis
- O privado fica atrás do ambiente autenticado
- Os worklows públicos não podem conter credentials privadas
- O público não deve incluir `pinData`, `auth`, URLs internas, segredos

## 7. Regra de ouro

O projeto deve ser construído como um sistema em camadas:

- camada pública: engenharia, schema, baseline, regras, validação, docs
- camada privada: aprendizado, optimização e dados sensíveis

**Essa separação não é opcional.**
