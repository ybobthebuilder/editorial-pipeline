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
- funções de transição e acesso ao config
- views e contratos públicos

### `editorial_intel` (privado)
Fonte de verdade para:
- jobs, evidences, verification
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

### Ordem de resolução
1. verifica se existe override privado
2. se não existir, usa baseline pública
3. se houver conflito, mantém a sobreposição ativa privada
4. hash precisa bater com o repositório público

## 5. Segurança

- RLS obrigatório em todas as tabelas
- REVOKE ALL para `anon` e `authenticated`
- role `n8n_pipeline` com permissões mínimas
- `n8n_pipeline` pode:
  - EXECUTE nas funções necessárias
  - CRUD nas tabelas de intel
  - SELECT no baseline público
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
