# Validadores — interface, estado e proposta de CI (VL-2)

> Status: **PROPOSED**, para revisão. Descreve o que está implementado em branches sem PR e o que não está. Não autoriza merge.
> Ambiente verificado: Node 22.22.0. Comando único de teste: `node --test 'validators/*.test.js'`. Passar só o diretório falha no Node 22.
> Rótulos: **VERIFIED** (checado nesta sessão), **PROPOSED** (desenho nosso), **UNKNOWN** (sem fonte).

## 1. Estado por validador

| Validador | Branch | Commit | Testes | Mutantes detectados | Dependências | Fonte da regra |
| --- | --- | --- | --- | --- | --- | --- |
| `math.js` | `claude/validators-math` | `198c75e6dc627b68acaf6669b2da61506362d542` | 12 | 5 de 5 | nenhuma | `CLAUDE.md` §3 (exemplo 84 → 92) |
| `contrast.js` | `claude/validators-contrast` | `d6bf5de1bf751b5cec87a5d46a9019d6f7a34ccf` | 18 | 10 de 11 (o 11º é equivalente) | nenhuma | W3C `w3c/wcag`, `terms/20`, lido pelo GitHub |
| `schema.js` | `claude/validators-schema` | `759df316c9e30066c5de264deaae5a2c5dd65554` | 26 | 11 de 11 | nenhum `require` | lista do Code node conferida pelo Fonseca; subconjunto próprio |
| `numbers.js` | — | — | — | — | — | **bloqueado** por U10 (formato numérico) |
| `geometry.js` | — | — | — | — | — | **bloqueado** por U2 (forma de `cover_spec`) |
| `citation.js` | — | — | — | — | — | fora do escopo visual (estágio 03_VERIFY) |

Nenhum dos três branches tem PR. Nenhum tem veredito de reviewer.

## 2. Interface

### `math.js`
`computeDeltas(before, after) → { delta_absolute, delta_relative }`
- `TypeError` se algum argumento não for número finito.
- `delta_absolute` = `after − before`, arredondado à maior precisão decimal das duas entradas (`0.3 − 0.1` dá `0.2`, não `0.19999…`).
- `delta_relative` = `(after − before) / |before| × 100`, com duas casas. `null` quando `before === 0`.
- `RangeError` quando o delta não cabe num número finito.
- Quem chama declara se a entrada é percentual. Nesse caso `delta_absolute` é em pontos percentuais.

### `contrast.js`
`contrastRatio(colorA, colorB) → number` e `relativeLuminance(color) → number`
- Aceita `#RGB` e `#RRGGBB`. Não aceita alfa nem nome de cor.
- `TypeError` para não-string; `RangeError` para formato inválido.
- A razão **não é arredondada**, para que um limiar seja comparado com o valor bruto.
- Não decide limiares. 4,5:1 e 3:1 ficam para quem consome (VL-4 e `geometry.js`).

### `schema.js`
`validate(schema, data) → { passed, errors: [{ path, message }] }`
- `SchemaError` se o schema for malformado ou usar palavra-chave fora do subconjunto. Vale também para palavra-chave aninhada que o dado nunca alcança.
- `TypeError` se o dado não for JSON: `undefined`, `NaN`, `Infinity`, função, bigint, símbolo ou ciclo.
- Coleta todos os erros numa passada, na ordem de declaração de `properties`.
- Caminhos: `$.a.b[2]` para identificadores e `$["x-y"]` para as demais chaves.

**Subconjunto suportado:** `type` (um nome), `enum`, `const`, `required`, `properties`, `additionalProperties` (booleano), `items` (um schema), `minItems`, `maxItems`, `minLength`, `maxLength` (pontos de código), `pattern` (busca sem âncora, só em strings, flag `u`), `minimum` e `maximum` (inclusivos). Anotações aceitas e ignoradas: `$schema`, `$id`, `title`, `description`.

**Recusado com erro:** `$ref`, `oneOf`, `anyOf`, `not`, `format`, `uniqueItems`, `multipleOf`, `exclusiveMinimum`, `dependentRequired` e schemas booleanos.

**Limite declarado:** regra cruzada entre campos não cabe no schema. O teste de exemplo mostra que o schema aceita `status: "waived"`. A proibição de `waived` em `G-CFM-*` precisa de um validador próprio, que depende de U2.

## 3. Restrição de plataforma

- O código de `schema.js` não tem `require` nem `import`. Um teste verifica o próprio fonte.
- Lista de módulos nativos do Code node do n8n Cloud, conferida pelo Fonseca no trecho oficial: `crypto`, `http`, `https`, `url`, `util`, `querystring`, `stream`, `zlib`, `os`, `buffer`, `timers`, `string_decoder`, `events`, `dns`, `net`, `tls`, `assert`. Pacotes npm externos não são suportados no Cloud.
- **Lacuna fechada:** `math.js` e `contrast.js` têm agora o mesmo teste de ausência de `require` e `import` (commits `198c75e` e `d6bf5de`). Mutante verificado: `require` em `math.js` falha o teste. Um `import` em `contrast.js` falha antes, no carregamento, por erro de sintaxe num arquivo CJS.

## 4. Não construído, e por quê

| Item | Bloqueio | Destrava com |
| --- | --- | --- |
| `numbers.js` | U10 decidido (formato PT-BR, vírgula decimal, `9,52`). Desbloqueado; ainda não construído | decisão do Fonseca, 2026-10-22 |
| `geometry.js` | U2: forma de `cover_spec` e mapa de slots | aprovação de `schema-contract.md` (U11) e mapa de slots (CP-VL1.5) |
| `citation.js` | estágio 03_VERIFY, fora do escopo visual | — |

## 5. CI de validadores (aprovada; preparada, não ativa)

Aprovada pelo Fonseca. Preparada no branch `claude/ci-validators` (commit `90619f6ace61f4e17a736ecb637f2ddc2d4f56c6`), em `.github/workflows/validators.yml`. Não está no `main` e não é ativada até os três branches de validadores serem unificados no `main`.

O passo de teste tem uma guarda. Sem ela, o `main` ficaria verde com zero testes, porque o glob não casa nenhum arquivo e o Node sai com código 0.

Verificado localmente com `bash -eo pipefail`, que é o shell padrão dos passos `run` no GitHub Actions:
- no branch `claude/validators-schema`, código 0;
- no `main`, código 1, sem testes.
- O YAML foi lido com PyYAML 6.0.3.
- Unificação simulada localmente, sem push: os três branches juntos passam o passo exato do CI com 56 de 56 testes e código 0.

```yaml
name: validators

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Run validator tests and refuse an empty run
        run: |
          node --test 'validators/*.test.js' | tee test-output.txt
          grep -qE '^# tests [1-9][0-9]*$' test-output.txt
```

**Ordem de entrada:** o workflow só deve entrar no `main` depois de `claude/validators-math`, `claude/validators-contrast` e `claude/validators-schema`. Antes disso ele falha no `main`, de propósito.

**Não verificado:**
- execução real no GitHub Actions. Simulei o passo localmente, com Node 22.22.0, e o runner real usa a própria imagem;
- actions não fixadas em SHA. `actions/checkout@v4` e `actions/setup-node@v4` são tags móveis. Fixar em SHA é uma decisão de governança.

## 6. Próximo passo

Decisões de D-08, U10 e U11-a a g estão registradas. Pendentes: U11-h e U11-i (`schema-contract.md`, §10). A migration de `state_transitions`, `config_baseline`, `guard_transition` e `get_config` está em `claude/migration-001`, sem PR. Ficam de fora `set_status` e `mark_running` (U11-h). Para revisão: este documento, a migration e o workflow.

## 7. Atualização de 2026-10-22: unificação e `numbers.js`

- Os quatro branches foram unificados sobre o `main` na PR #13 (`claude/validators-unify`, `7953395`), junto com o workflow `validators.yml`, que passa a valer no `main`. 78 de 78 testes.
- `numbers.js` (`extractNumbers`, `checkNumbersAllowed`): formato PT-BR (U10), unidade `%`, `pp` ou nenhuma, valor exato, `9.52` é erro de formato. 22 testes, 14 de 14 mutantes. Os números permitidos são montados pelo código a partir de evidências `VERIFIED` e de `computeDeltas`, nunca a partir de texto do LLM. Os limites conhecidos estão no cabeçalho do arquivo.
- Continua bloqueado: `geometry.js` (U2 e mapa de slots).
