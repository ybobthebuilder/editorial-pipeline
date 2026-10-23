# Proposta de contrato: `caption` e `cta` (D-17)

> Status: **PROPOSED**, para revisão por digest (`reviewed_commit_sha = null`). Não autoriza merge e **não cria nenhum arquivo** em `contracts/`, `validators/`, `skills/` nem `config/`: o contrato, o validador e o prompt só são escritos depois da aprovação, como foi com `visual_spec`, `image_assets` e `visual_library`.
> Rótulos: **VERIFIED** (decisão do Fonseca ou arquivo do repositório), **PROPOSED** (desenho meu), **UNKNOWN** (sem fonte; vira pergunta na §9).
> Companheiros: `contracts-proposal.md` (§3 proveniência, §5 `cover_spec`, §8 validadores), `slot-map-v0.md`, `skills/copywriter-cfm/SKILL.md`, `validators/blocklist.js`, `validators/numbers.js`, `contexto.md` (D-05, D-16).

## 1. As decisões (VERIFIED, Fonseca, 2026-10-23)

1. **`caption`** é o texto da postagem, o que fica embaixo da imagem no Instagram. **Não aparece na arte.** Pertence ao contrato de payload do job (junto com `alt_text`), e não ao layout.
2. **`cta`** é uma palavra ou frase curta **na arte** (exemplos dados: "Salve este post", "Comente abaixo"). Campo do `cover_spec`, **no máximo 40 caracteres**, sujeito ao `QA-CFM` e à blocklist.
3. **D-17: o CTA é texto inerte na arte, sem automação de engajamento.** Sem ManyChat, sem gatilho, sem entrega de artefato na v0.1. Isso é escopo da v0.2 e exigiria revisão jurídica específica sobre CTA médico e LGPD.

Isso **substitui** a leitura anterior de D-16 ("legenda com CTA de farming de engajamento, ManyChat + artefato"): a parte de automação sai.

## 2. O que o repositório não tem, e uma divergência

- **UNKNOWN:** o "contrato do job" não está no repositório. `job_ref.schema.json` é só planejado (`CLAUDE.md`, estrutura PLANNED), e o contrato H1, o estado `request_received` e `slides_copy` não existem em nenhum arquivo que eu possa ler. Não posso editar o que não vejo, e não vou inventar os campos deles.
- **Divergência:** hoje `alt_text` **não** está num payload de job. Está no `cover_spec` (saída do `07_COVERS`, `contracts/cover_spec.schema.json`) e, por imagem, no `image_assets`. A decisão diz que `caption` fica "junto com `alt_text`" no payload; se o `alt_text` do payload for outro campo, ele não é o que o repositório tem. Q1 pede o texto desse contrato.
- **Quem escreve a legenda:** se for o LLM do `copywriter-cfm` (o que o D-16 sugeria), ela é **saída** do `07_COVERS`, e não entrada do job. Entrada do job só se a legenda vier pronta do pedido. Isso muda onde o campo mora (§3).

## 3. Onde mora a `caption` (PROPOSED, Q1)

| Opção | Como é | A favor | Contra |
| --- | --- | --- | --- |
| A | campo `caption` no `cover_spec`, ao lado de `alt_text` | zero contrato novo; mesma proveniência, mesmo `evidence_ids` | cardinalidade errada: um carrossel tem N capas e **uma** legenda. A decisão também diz que não é layout |
| **B (recomendada)** | contrato novo `post_copy` do `07_COVERS`: proveniência igual à dos outros, `caption` e `evidence_ids` | uma legenda por postagem; independe do contrato H1, que não posso ver; quando o texto do H1 chegar, o campo é referenciado ou movido sem refazer o validador | um contrato a mais |
| C | campo no payload de entrada do job (`request_received` ou `slides_copy`) | é o que a decisão descreve | só serve se a legenda for escrita por humano; e o contrato não está no repositório |

Recomendo **B**. Se a resposta da Q1 for C, esta proposta vale só para o `cta` e o validador da legenda (§6), e o campo entra no contrato que o Fonseca mandar.

## 4. Forma proposta

### 4.1 `post_copy` (opção B)

Proveniência igual à de `contracts-proposal.md` §3 (`job_id`, `stage` = `07_COVERS`, `config_source`, `config_version`, `model`, `execution_id`, `created_at`), depois:

```json
{
  "job_id": "00000000-0000-4000-8000-000000000001",
  "stage": "07_COVERS",
  "config_source": "public",
  "config_version": "v1",
  "model": "synthetic-model-v0",
  "execution_id": "exec-0001",
  "created_at": "2026-10-23T12:00:00Z",
  "evidence_ids": ["ev-0001"],
  "caption": "De 84% para 92% no indicador. O que mudou, em uma frase curta."
}
```

| Campo | Regra no schema | Origem |
| --- | --- | --- |
| `evidence_ids` | array não vazio de strings não vazias; cada id existe e é `VERIFIED` (código) | `CLAUDE.md` §4 e §8: toda afirmação tem evidência |
| `caption` | string, `minLength` 1, `maxLength` **300** (pontos de código) | **PROPOSED**: o Fonseca disse "curta" e não deu número; o limite do Instagram (2.200) não é "curto". Q3 |

Cabe no subconjunto do `schema.js`. `additionalProperties: false`.

### 4.2 `cta` no `cover_spec`

Campo opcional `cta` no `cover_spec`: string, `minLength` 1, `maxLength` **40** (VERIFIED, pontos de código). Opcional porque só 2 dos 6 templates têm um slot de CTA (`cta_label` em `post-01-manifesto` e `story-01-convite`; `slot-map-v0.md` §2). Regras que o schema não expressa, por código (§6):

- o template tem slot `cta_label` **se e só se** o `cover_spec` traz `cta`;
- `slots[cta_label].lines` é exatamente `[cta]` (o campo espelha o slot; o espelho existe para que QA, legenda e métricas leiam um campo só);
- a linha cabe no slot, medida por `geometry.checkSlot` como qualquer outra.

### 4.3 O slot `cta_label` passa a `claim` (PROPOSED, Q5)

Hoje `cta_label` é `chrome` na `visual_library`: texto "fixo de layout", que o `copywriter-cfm` não escreve e que não passa pelo `numbers.js`. Com o D-17 o CTA é **copy escrita pelo modelo**, então chrome está errado: o texto escaparia do prompt e da checagem de números. Proponho trocar o `kind` dele para `claim`, sem tipo novo. O efeito é automático: o slot entra na entrada do `copywriter-cfm` (que lista só slots `claim`) com `max_lines` e `max_chars_per_line`. É uma alteração de dados em `config/baseline/visual_library.json` (e no mapa de slots), a fazer na implementação.

## 5. D-17 na prática: o que "inerte" quer dizer e como se garante

O código não lê intenção. O que dá para impor, em camadas:

| Camada | Regra | Quem verifica | Tipo |
| --- | --- | --- | --- |
| prompt | o CTA não cita palavra-gatilho, não promete entrega ("receba", "baixe", "link", "direct"), não pede dado pessoal; é um pedido de gesto (salvar, comentar, compartilhar) | `skills/copywriter-cfm/SKILL.md` | LLM, sem garantia |
| schema | 1 a 40 caracteres | `schema.js` | código |
| código | sem URL, sem domínio, sem `@`, sem `#`, sem número de telefone: nada que um sistema externo possa capturar ou seguir | `validators/copy.js` (PROPOSED, §6) | código |
| `QA-CFM` | `blocklist.js` sobre o CTA e sobre a legenda | `09_QA` | código |
| `QA-NUM` | `numbers.js` sobre o CTA e a legenda: número fora de `allowed_numbers` reprova | `09_QA` | código |
| `09_QA` semântico | novo motivo `cta_promete_entrega` em `qa_result.semantic.reasons` | `qa-validator` | LLM, sem garantia (Q6) |

**Limite dito antes de tudo:** "Comente abaixo" é CTA permitido e "Comente QUERO e receba" não é, e nenhuma regra de código separa os dois com certeza. As camadas de código eliminam o que é mecânico (link, arroba, gatilho com símbolo); a fronteira semântica fica com o prompt e o `09_QA`, e com a revisão humana do gate `AWAITING_APPROVAL`.

## 6. Validador de negócio `validators/copy.js` (PROPOSED)

Puro, sem `require`, como os outros.

- `checkCta(cta, coverSpec, slotsOfTemplate) → { passed, errors: [{ reason }] }`. Razões: `cta_sem_slot` (há `cta` e o template não tem `cta_label`), `slot_sem_cta` (o inverso), `cta_diferente_do_slot`, `cta_com_url`, `cta_com_arroba`, `cta_com_hashtag`, `cta_com_telefone`, `cta_so_espacos`.
- `checkCaption(caption) → { passed, errors }`. Razões: `legenda_so_espacos`, `legenda_com_hashtag_demais` e similares **só se** o Fonseca definir regra de hashtag e menção na legenda (Q4); sem isso, só a checagem de espaços.
- A blocklist e os números **não** são reimplementados: o `copy.js` não decide o que é proibido, e o `blocklist.js` e o `numbers.js` recebem o texto como já recebem os slots. Só a **fiação** é nova, no estágio.

Teste e mutação como no resto: fixtures sintéticas (2 válidas e 2 inválidas por contrato), uma fixture por razão, mutação do validador e do schema.

## 7. Impacto nos artefatos existentes (só depois da aprovação)

Ordem sequencial, uma PR por item, cada uma com sua validação:

1. `contracts/post_copy.schema.json` + fixtures + entrada em `validators/contracts.test.js` (ou, se a Q1 for C, o contrato que o Fonseca indicar).
2. `contracts/cover_spec.schema.json`: campo opcional `cta` (`maxLength` 40) + 1 fixture válida com `cta` e 1 inválida acima de 40.
3. `validators/copy.js` com testes e mutação.
4. `config/baseline/visual_library.json`: `cta_label` de `chrome` para `claim`; `.checksums`; ajuste do teste do baseline (contagem de `kind`).
5. `skills/copywriter-cfm/SKILL.md`: saída com `cta` e `caption`, regras da §5, `.checksums` dos skills; `skills/qa-validator/SKILL.md` se a Q6 for sim; enum de `semantic.reasons` em `qa_result`.
6. Cartão de etapa do `07_COVERS` e do `09_QA` (`docs/STAGES.md`, quando existir).

O VL-5 (render) preenche os slots do `cover_spec` (PROPOSED, o desenho do VL-5 ainda não existe), então **não deveria depender** de `caption` nem de `post_copy`; o `cta` entra como linha do slot `cta_label`, que o render já preenche. O que o VL-5 espera desta proposta é a decisão sobre o `kind` do `cta_label` (§4.3).

## 8. Critérios de aceite da implementação futura

- `node --test 'validators/*.test.js'` passa, com `post_copy` e `cta` nos testes de contrato.
- Um `cover_spec` com `cta` de 41 caracteres é reprovado pelo schema; de 40, aprovado.
- Um CTA com URL, `@`, `#` ou telefone é reprovado por `copy.js`; "Salve este post" e "Comente abaixo" passam.
- Um CTA da blocklist ("100% eficaz") é reprovado pelo `blocklist.js` quando alimentado como texto.
- Nenhuma menção a ManyChat, gatilho ou entrega em contrato, validador, prompt ou configuração (teste que varre os arquivos).
- Mutação: todos os mutantes do validador e do schema novos detectados, ou o equivalente justificado.

## 9. Perguntas abertas

| ID | Pergunta | Recomendação |
| --- | --- | --- |
| Q1 | Onde mora a `caption`: `post_copy` (B), `cover_spec` (A) ou o payload do job (C)? Se C, qual é o texto do contrato (`request_received` ou `slides_copy`), e o `alt_text` dele é outro campo? | B; mande o texto do H1 quando existir, e o campo é referenciado |
| Q2 | Em quais templates o CTA aparece? Hoje só `post-01-manifesto` e `story-01-convite` têm slot. Num carrossel, o "slide final" não é nenhum dos 6 templates | começar com os 2 existentes; o slide final do carrossel fica para quando houver template |
| Q3 | Limite de `caption`: 300 caracteres serve? | 300, ajustável por constante no schema |
| Q4 | A legenda leva hashtags ou menções? Leva a identificação do médico (CRM) além do rodapé da arte? | sem hashtag e sem menção na v0.1; a identificação do médico não é regra minha: a fonte do CFM não foi verificada |
| Q5 | `cta_label` passa de `chrome` para `claim` (§4.3)? | sim |
| Q6 | Acrescentar `cta_promete_entrega` aos motivos semânticos do `09_QA`? | sim, como rede de segurança; sem garantia, dito na §5 |
| Q7 | A rejeição de URL, `@`, `#` e telefone no CTA (§5) está certa, ou o CTA pode ter alguma dessas coisas? | rejeitar: é o que mantém o CTA inerte |

## 10. O que esta proposta não faz

Não cria arquivo de contrato, validador, prompt nem configuração. Não define gatilho, palavra-chave, automação, artefato nem entrega (D-17: v0.2, com revisão jurídica). Não verifica a regra do CFM para CTA médico nem a LGPD: a fonte normativa não foi lida pelo assistente, e a revisão jurídica é do Fonseca. Não altera o VL-5.
