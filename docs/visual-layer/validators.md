# Validadores — interface, estado e proposta de CI (VL-2)

> Status: **PROPOSED**, para revisão. Descreve o que está implementado em branches sem PR e o que não está. Não autoriza merge.
> Ambiente verificado: Node 22.22.0. Comando único de teste: `node --test 'validators/*.test.js'`. Passar só o diretório falha no Node 22.
> Rótulos: **VERIFIED** (checado nesta sessão), **PROPOSED** (desenho nosso), **UNKNOWN** (sem fonte).

## 1. Estado por validador

| Validador | Branch | Commit | Testes | Mutantes detectados | Dependências | Fonte da regra |
| --- | --- | --- | --- | --- | --- | --- |
| `math.js` | `claude/validators-math` | `da1083e9dc2e4ccb765a1e7ba126743bc829ffb4` | 11 | 5 de 5 | nenhuma | `CLAUDE.md` §3 (exemplo 84 → 92) |
| `contrast.js` | `claude/validators-contrast` | `dcb572140146af36505d5a1350c9bcfcbec6c664` | 17 | 10 de 11 (o 11º é equivalente) | nenhuma | W3C `w3c/wcag`, `terms/20`, lido pelo GitHub |
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
- **Lacuna:** `math.js` e `contrast.js` também não importam nada, verificado por leitura, mas só `schema.test.js` tem o teste que garante isso.

## 4. Não construído, e por quê

| Item | Bloqueio | Destrava com |
| --- | --- | --- |
| `numbers.js` | U10: formato numérico (`9,52` ou `9.52`) | decisão de locale |
| `geometry.js` | U2: forma de `cover_spec` e mapa de slots | aprovação de `schema-contract.md` (U11) e mapa de slots (CP-VL1.5) |
| `citation.js` | estágio 03_VERIFY, fora do escopo visual | — |

## 5. Proposta de CI (PROPOSED, não commitada)

Fica aqui e não em `.github/`, porque essa pasta pertence ao CODEOWNERS (`@ybobthebuilder`). O Fonseca decide se entra.

O passo de teste tem uma guarda. Sem ela, o `main` ficaria verde com zero testes, porque o glob não casa nenhum arquivo e o Node sai com código 0.

Verificado localmente com `bash -eo pipefail`, que é o shell padrão dos passos `run` no GitHub Actions:
- no branch `claude/validators-schema`, código 0;
- no `main`, código 1, sem testes.
- O YAML foi lido com PyYAML 6.0.3.

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

Nada novo a executar até as respostas de D-08, U10 e U11-a a U11-g. O que depende de você é: revisar este documento, decidir se o workflow entra e em qual ordem, e revisar `schema-contract.md`.
