# Proposta do contrato `image_assets` e do bloqueio de mídia clínica (D-15, U24)

> Status: **PROPOSED**, para revisão por digest (`reviewed_commit_sha = null`). Não autoriza merge e **não cria nenhum arquivo** em `contracts/` nem em `validators/`.
> Rótulos: **VERIFIED** (decisão do Fonseca ou arquivo do repo), **PROPOSED** (desenho meu), **UNKNOWN** (sem fonte; vira pergunta na §8).
> **Não verificado:** o contrato `image_assets` v0.1.0 do relatório do Fonseca não está neste repositório. Só estes fragmentos dele chegaram a mim: o nome e a versão, o caminho `payload.images[]`, o exemplo de `ref` (`img://NX-2026-10-13-001/0`) e o enum de `provenance` (`generated_illustration`, `owned_photo`, `stock_licensed`). Esta proposta não o reproduz; ela desenha o mínimo para cumprir a decisão abaixo. Se o v0.1.0 existir à mão, ele substitui o que for conflito.

## 1. A decisão (VERIFIED, Fonseca, 2026-10-22)

1. **Camada (a), schema.** No JSON Schema de `image_assets`, o enum `provenance` fica restrito a `generated_illustration` e `stock_licensed` por padrão.
2. **Camada (b), validador de negócio.** Aceitar `owned_photo` exige aprovação humana explícita (`human_approved: true`) e uma justificativa.
3. **Fotos clínicas** (antes/depois, exames) são recusadas **sempre**, com ou sem o flag.
4. O sistema não aceita upload de imagens de pacientes por padrão. Só ilustrações geradas (com selo) ou imagens de banco com crédito (D-15).

## 2. Limites do desenho, ditos antes de tudo

- **O código só barra o que o produtor declara.** Nenhum validador reconhece um paciente no pixel. O contrato obriga a declaração (`subject`) e recusa as declarações clínicas e a ausência delas; uma foto clínica declarada como `none` passa. Por isso a §7 recomenda uma segunda declaração independente.
- **`human_approved: true` num payload não prova que um humano aprovou.** Quem escreve o payload é o próprio sistema que a regra vigia. No resto do projeto, a aprovação humana é um registro que só `human_reviewer` grava (`editorial.signatures`). A §7 propõe o mesmo padrão. A camada (b) abaixo cumpre a decisão ao pé da letra e deixa a lacuna escrita.

## 3. Onde o contrato entra (UNKNOWN, Q1)

Nenhum dos 6 templates tem espaço para imagem (`slot-map-v0.md` §2: só texto e elementos decorativos). A decisão D-15 fala de **upload**, então o contrato é, antes de tudo, a fronteira de **entrada** do job: o que chega junto com o PDF. **PROPOSED:** o estágio é `01_INGEST`, o contrato é validado antes de qualquer imagem ser guardada, e `07_COVERS` o revalida quando um template usar imagem. O contrato de entrada do job não está no repo (o `job_ref` do `01_INGEST` é só planejado, e o contrato H1 do Fonseca não chegou a mim), então não sei como esse bloco se encaixa nele.

## 4. Forma (PROPOSED)

Proveniência igual à dos outros contratos (`contracts-proposal.md` §3): `job_id`, `stage` (`const`: `01_INGEST`), `config_source`, `config_version`, `model`, `execution_id`, `created_at`. Depois, duas listas:

```json
{
  "job_id": "00000000-0000-4000-8000-000000000001",
  "stage": "01_INGEST",
  "config_source": "public",
  "config_version": "v1",
  "model": "not_reported",
  "execution_id": "exec-0001",
  "created_at": "2026-10-22T12:00:00Z",
  "images": [
    { "ref": "img://job-0001/0", "provenance": "generated_illustration", "subject": "none",
      "attribution": "Gerada por modelo de imagem sintético", "seal": "applied",
      "alt_text": "Ilustração abstrata em tons escuros." },
    { "ref": "img://job-0001/1", "provenance": "stock_licensed", "subject": "person_not_patient",
      "attribution": "Fotógrafo Sintético, banco sintético, licença L-0001", "seal": "not_applicable",
      "alt_text": "Pessoa de jaleco olhando para uma prancheta." }
  ],
  "exceptions": [
    { "ref": "img://job-0001/2", "provenance": "owned_photo", "subject": "none",
      "attribution": "Acervo próprio, sintético", "seal": "not_applicable",
      "alt_text": "Fachada de um consultório, sem pessoas.",
      "human_approved": true,
      "justification": "Foto da fachada do consultório, sem pessoas, autorizada para uso." }
  ]
}
```

Campos de cada item de `images[]` e de `exceptions[]` (todos obrigatórios):

| Campo | Regra no schema | Origem |
| --- | --- | --- |
| `ref` | string, `pattern` `^img://[A-Za-z0-9._/-]+$` | formato do exemplo do relatório (**UNKNOWN** se há outro) |
| `provenance` | em `images[]`: enum `generated_illustration`, `stock_licensed` (**camada a**). Em `exceptions[]`: `const` `owned_photo` | decisão |
| `subject` | enum `none`, `person_not_patient`, `patient`, `before_after`, `exam`, `unknown` | **PROPOSED**; ver §5 |
| `attribution` | string, `minLength 1`. Crédito e licença para banco; ferramenta ou modelo para ilustração gerada; origem para foto própria | "imagens de banco com crédito" |
| `seal` | enum `applied`, `not_applicable` | "ilustrações geradas (com selo)" |
| `alt_text` | string, `minLength 10`, `maxLength 250` | regra I089 do inventário de compliance do Fonseca |
| `human_approved` | só em `exceptions[]`: `const true` | decisão (**camada b**) |
| `justification` | só em `exceptions[]`: string, `minLength 20` | decisão; o **20** é meu e arbitrário (Q5) |

Tudo cabe no subconjunto do `schema.js` (nada de `oneOf`, `if`, `$ref`). `images` e `exceptions` são arrays, possivelmente vazios; `additionalProperties: false`.

**Por que duas listas, e não uma com `owned_photo` no enum:** o schema não tem `if/then`, então um enum de três valores deixaria `owned_photo` passar no schema sem flag e a camada (a) deixaria de ser uma barreira. Com `exceptions[]`, um `owned_photo` dentro de `images[]` é erro de schema, e uma exceção sem `human_approved: true` também.

## 5. `subject` e o que "clínica" significa para o código (PROPOSED)

`patient`, `before_after`, `exam` e `unknown` são **recusados sempre** pelo validador, mesmo em `exceptions[]` com `human_approved: true`. `unknown` é recusado por falhar fechado: quem não sabe dizer o que a imagem mostra não a envia. Os campos que o Fonseca usa no objeto de conteúdo (`contem_paciente`, `categoria` com `antes_depois`, `depoimento`, `resultado_paciente`) **não são adotados**; o mapeamento é: `contem_paciente = true` vira `patient`, `antes_depois` vira `before_after`. `depoimento` e `resultado_paciente` não têm correspondente aqui e, por segurança, o produtor os declara como `patient`.

## 6. Validador de negócio `validators/media.js` (PROPOSED)

`checkMedia(assets) → { passed, errors: [{ ref, reason }] }`, puro e sem `require`, como os outros (Code node do n8n Cloud). Roda depois do schema. Razões:

| `reason` | Quando |
| --- | --- |
| `assunto_clinico` | `subject` é `patient`, `before_after` ou `exam`, em qualquer lista, com ou sem `human_approved` |
| `assunto_desconhecido` | `subject` é `unknown` |
| `selo_ausente` | `provenance` é `generated_illustration` e `seal` não é `applied` |
| `justificativa_vazia` | em `exceptions[]`, `justification` é só espaços (passa o `minLength` do schema, não passa aqui) |
| `aprovacao_ausente` | em `exceptions[]`, `human_approved` não é exatamente `true` (defesa dupla com o schema) |
| `ref_duplicado` | o mesmo `ref` aparece duas vezes, nas duas listas somadas |

Fixtures sintéticas em `fixtures/synthetic/contracts/image_assets/`: 2 válidas (a do exemplo acima, e uma com as listas vazias) e inválidas por camada: `owned_photo` em `images[]` (schema), exceção com `human_approved: false` (schema), `subject: patient` com flag verdadeiro (validador), justificativa de espaços (validador), `ref` repetido (validador), ilustração gerada sem selo (validador). Mutação do schema e do validador, como nos contratos e no `geometry.js`.

## 7. Recomendações de endurecimento (decisão do Fonseca)

1. **Aprovação como registro, não como flag.** Uma tabela `editorial.media_approvals` (`job_id`, `ref`, `justification`, `signed_at`, `reviewer_name`), só com `INSERT` para `human_reviewer`, como `signatures`; a exceção carregaria o `approval_id` em vez de `human_approved`. O `guard` já provou que o padrão funciona. Custo: uma migration e uma decisão sobre onde o upload é aprovado.
2. **Duas declarações de `subject`.** O uploader declara e um nó de classificação (LLM, que pode classificar, `CLAUDE.md` §1) confere. Divergência bloqueia e vai para revisão humana. Isso reduz, mas não elimina, o limite da §2.
3. **Registrar a recusa.** Toda recusa por `assunto_clinico` vira um evento de auditoria do job, com `ref` e `reason`, sem guardar a imagem.

## 8. Perguntas abertas

| ID | Pergunta | Recomendação |
| --- | --- | --- |
| Q1 | Em qual estágio o contrato entra e como ele se encaixa no contrato de entrada do job (H1)? | `01_INGEST` como fronteira; confirmar com o texto do H1 |
| Q2 | Duas listas (proposta) ou uma lista com `owned_photo` no enum e só o validador na camada (b)? | duas listas: mantém a camada (a) como barreira |
| Q3 | `human_approved` como flag no payload (decisão ao pé da letra) ou como registro que só `human_reviewer` grava (§7.1)? | registro, pela razão da §2 |
| Q4 | Quem declara `subject`: o uploader, um classificador, os dois? | os dois (§7.2) |
| Q5 | Tamanho mínimo da justificativa | 20 caracteres, só para barrar o vazio |
| Q6 | Os limites de `alt_text` (10 a 250) da regra I089 valem aqui, ou o `alt_text` da capa (`cover_spec`, `minLength 1`) já basta? | valem para imagens |
| Q7 | Forma do selo: texto, posição e se conta como chrome de template. Hoje nenhum template tem espaço para imagem nem para selo | decidir quando houver o primeiro template com imagem |
| Q8 | O `image_assets` v0.1.0 existe em arquivo? Se sim, mande o texto | esta proposta se reconcilia com ele |

## 9. Próximo passo, se aprovada

1. `contracts/image_assets.schema.json` e as fixtures.
2. `validators/media.js` com os testes e a mutação.
3. Atualizar `CP-VL3.5` e `contexto.md` (U24, D-15): "implementado" só depois de o teste recusar cada categoria bloqueada.
