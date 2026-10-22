# Proposta do `visual_library.json` (VL-4, contrato do arquivo)

> Status: **PROPOSED**, para revisão por digest (`reviewed_commit_sha = null`). Não autoriza merge e **não cria nenhum arquivo** em `config/baseline/` nem em `contracts/`: o arquivo e o schema só são escritos depois da aprovação, como foi com os contratos (CP-VL3.1).
> Rótulos: **VERIFIED** (visto em arquivo do repo ou nas cópias de trabalho dos SVGs, que ficam fora do repo por D-04), **PROPOSED** (desenho meu), **UNKNOWN** (sem fonte; vira pergunta na §8).
> Companheiros: `slot-map-v0.md` (slots e gramáticas), `contracts-proposal.md` (§4 e §5), `contexto.md` (§7 e decisões D-04, D-08, U19, U23), `geometry.js`, `contrast.js`.
> **Não verificado nesta sessão:** os originais `templates.json` e `tokens.css` não estão acessíveis. Os números abaixo vêm do `slot-map-v0.md` e de `contexto.md` §7, que os transcrevem, e das 6 cópias dos SVGs.

## 1. O que esta proposta fecha

`CLAUDE.md` §9 lista `visual_library` como chave de configuração ("gramática visual fechada"), e o roadmap pede `config/baseline/visual_library.json` (VL-4). Nenhum documento define o conteúdo desse arquivo. Esta proposta define **a forma**, **quem lê cada campo** e **como cada regra é verificada**. Não define o texto de nenhum template.

## 2. Quem lê o quê

| Campo do arquivo | Quem lê | Para quê |
| --- | --- | --- |
| `tokens` | `contrast.js`, render (VL-5) | valores de cor por nome |
| `color_pairs` | gate `QA-CTR` (VL-5/09_QA) | pares permitidos e limiar por tamanho de texto |
| `grammars[]` | entrada do `art-director` (`grammars: [{ grammar_id, description }]`), validador de `visual_spec.grammar_id` (U17) | lista fechada de gramáticas |
| `grammars[].templates` | código de `07_COVERS` | a gramática e o formato escolhem o template, nunca o LLM |
| `templates[].slots[]` | `07_COVERS` (entrada do `copywriter-cfm`), `geometry.js`, render, `QA-OVF`, `QA-SAFE` | geometria, `kind` e estilo de cada slot |

## 3. O que o arquivo **não** guarda, de propósito

| Não guarda | Por quê | Onde está |
| --- | --- | --- |
| margem de 64 px e faixas de 260 e 340 px | uma só fonte da verdade, já decidida (U19, U23) | constantes de `geometry.js` (`DEFAULT_MARGIN`, `PLATFORM_BANDS_9_16`) |
| `max_width_px` e `max_chars_per_line` | derivados do slot e da zona segura | `geometry.availableWidth` e `geometry.charBudget`, calculados na hora |
| texto do rodapé do CFM e sua posição | chave própria (`CLAUDE.md` §9) | `cfm_footer`, ainda não criada |
| termos proibidos | chave própria | `cfm_blocklist` |
| texto de `label_top`, `counter`, `cta_label` | chrome montado pelo código | `07_COVERS` |
| markup SVG dos templates | direitos de marca (D-04) e U7 | **UNKNOWN**, ver Q1 |

Se o Fonseca preferir que o arquivo carregue a zona segura (como `contexto.md` U19 sugeriu), a alternativa é um campo opcional `safe_zone` por template, só quando ele **diferir** do padrão do código, e um teste que prove que o padrão do arquivo e o do código coincidem. Recomendo não duplicar (Q4).

## 4. Forma (PROPOSED)

O arquivo é um objeto JSON com quatro chaves, todas obrigatórias.

```json
{
  "tokens": { "bg": "#0B0B0B", "surface": "#141414", "surface-warm": "#1F1F1F", "fg": "#E7E6D9", "fg-2": "#D3D2C5",
              "muted": "#B0AFA6", "meta": "#82817E", "border": "#42413E", "accent": "#6236F4",
              "accent-hover": "#754EF7", "success": "#37CD8F" },
  "color_pairs": [
    { "text": "fg", "on": "bg", "text_size": "normal" },
    { "text": "muted", "on": "bg", "text_size": "normal" },
    { "text": "accent", "on": "bg", "text_size": "large" }
  ],
  "grammars": [
    { "grammar_id": "metrica", "description": "Um número em destaque com a variação.", "templates": ["post-02-metrica"] }
  ],
  "templates": [
    {
      "template_id": "post-02-metrica",
      "canvas": { "width": 1080, "height": 1350 },
      "format": "4:5",
      "slots": [
        { "slot_id": "label_top", "kind": "chrome", "x": 118, "y": 125, "anchor": "start", "family": "mono", "font_size": 23,
          "weight": 600, "letter_spacing": 2, "max_lines": 1, "token": "muted", "on": "bg" },
        { "slot_id": "headline", "kind": "claim", "x": 86, "y": 425, "anchor": "start", "family": "sans", "font_size": 110,
          "weight": 600, "letter_spacing": -2, "line_height": 112, "max_lines": 3, "token": "fg", "on": "bg" },
        { "slot_id": "subhead", "kind": "claim", "x": 90, "y": 1042, "anchor": "start", "family": "sans", "font_size": 36,
          "weight": 400, "letter_spacing": -1, "max_lines": 1, "token": "muted", "on": "bg" }
      ]
    }
  ]
}
```

O exemplo traz 3 dos 7 slots de `post-02-metrica`; os valores vêm de `slot-map-v0.md` §2.2 e das cópias do SVG (`letter-spacing`, que o mapa não tabelou). Os 6 templates somam **30 slots** (`slot-map-v0.md` §2: 6, 7, 5, 6, 3 e 3).

Campos, todos **PROPOSED** salvo onde dito:

- `tokens`: nome → `#RRGGBB`. Os 11 valores são **VERIFIED** em `contexto.md` §7.1. `contrast.js` aceita só `#RGB` e `#RRGGBB`.
- `color_pairs[]`: `text` e `on` são nomes de `tokens`; `text_size` é `normal` ou `large`. O limiar não fica no arquivo: o código aplica 4,5:1 a `normal` e 3:1 a `large` (WCAG, conforme `DESIGN.md` §9 citado em `contexto.md` §7.3). O par `accent` sobre `bg` (3,14:1) só entra como `large`; os pares `border` sobre `bg` (1,93:1) não entram, porque a régua é decorativa.
- `grammars[]`: `grammar_id` e `description` são os dois campos que o `art-director` recebe. Os 5 ids são os de `slot-map-v0.md` §5 (`metrica`, `manifesto`, `capa`, `convite`, `overlay`), decididos em U3.
- `templates[]`: os 6 ids de `templates.json`. `format` é `1:1`, `4:5` ou `9:16`, derivado do `canvas` e conferido por teste. Os valores que o job traz são **UNKNOWN** (U21, H1).
- `slots[]`: `slot_id` é o `id` do elemento `<text>` no SVG depois do patch (D-06). `kind` é `claim` ou `chrome` (`contracts-proposal.md` §5, quem define é o mapa, nunca o LLM). `family` é `sans` ou `mono`, as duas famílias que `geometry.js` mede. `y` é a linha de base da primeira linha; `line_height` só existe com `max_lines` maior que 1. Slots de várias linhas com corpos e passos diferentes (o título de `reel-01-capa`: 164, 126 e 108 px) usam **arrays** em `font_size` e `y`, como `geometry.checkSlot` já aceita.

## 5. Escolha do template (PROPOSED)

`template = f(grammar_id, format)`, em código: dentre os `templates` da gramática, o que tem o `format` pedido. Exatamente um serve, ou o código leva o job a `NEEDS_REVIEW`:

| `grammar_id` | `1:1` | `4:5` | `9:16` |
| --- | --- | --- | --- |
| `metrica` | — | `post-02-metrica` | — |
| `manifesto` | `post-01-manifesto` | — | — |
| `capa` | `carousel-01-capa` | — | `reel-01-capa` |
| `convite` | — | — | `story-01-convite` |
| `overlay` | — | — | `reel-02-overlay` |

Pedir `metrica` em `1:1` não tem template. Recomendo que isso seja erro de código (job para revisão), e não que o LLM ou o código escolha um parente.

## 6. Como cada regra é verificada

| Regra | Quem verifica | Tipo |
| --- | --- | --- |
| forma, tipos, enums de `kind`, `family`, `anchor`, `text_size`, padrão `#RRGGBB`, campos obrigatórios, `additionalProperties: false` | `schema.js` com `contracts/visual_library.schema.json` (subconjunto: nada de `oneOf`, `$ref`, `uniqueItems`) | schema |
| `slot_id`, `grammar_id`, `template_id` e `token` únicos; `token` e `on` existem em `tokens`; cada par `(token, on)` está em `color_pairs`; toda gramática aponta para templates que existem; todo template aparece em alguma gramática; no máximo um template por `(grammar_id, format)` | validador de código | código |
| cada par de `color_pairs` atinge o limiar do seu `text_size` | `contrast.js` | código |
| `format` bate com `canvas`; os 6 `template_id` são **exatamente** o enum de `cover_spec.schema.json` | validador de código | código |
| cada slot cabe no canvas: `x` dentro da zona segura e, para `claim`, `geometry.checkSlot` passa com uma linha curta de teste | `geometry.js` | código |
| os slots de chrome nas faixas dos 9:16 (`label_top`, `cta_label`) | **não decidido**, Q2 | — |

Fixtures sintéticas, como nos contratos: 2 válidas e 2 inválidas, e mutação do schema e do validador. Mapeamento dos checkpoints: CP-VL4.1 (schema e os 6 ids), CP-VL4.2 (`.checksums`), CP-VL4.3 (pares de cor), CP-VL4.4 (D-04 e varredura).

## 7. O que esta proposta resolve e o que não resolve do VL-4

Resolve: a forma do arquivo (que estava em branco), a divisão entre arquivo e código, a regra de escolha de template. **Não destrava sozinha** o VL-4: o patch dos SVGs (D-06) e a entrada de marca no repo continuam atrás de U7 e da decisão sobre o chrome.

## 8. Perguntas abertas

| ID | Pergunta | Recomendação |
| --- | --- | --- |
| Q1 | Onde mora o markup SVG de cada template, que o render (VL-5) precisa? No repo público (depende de U7 e D-10), em outra camada, ou redesenhado por código a partir dos slots? | decidir junto com U7. Sem isso o `renderCover` não tem o que preencher. O arquivo teria um campo `svg_sha256` por template para amarrar o markup ao mapa |
| Q2 | O chrome dentro das faixas dos 9:16 (`label_top` nos três formatos, `cta_label` do `story-01-convite`) é isento do `QA-SAFE` ou muda de lugar? E o rodapé do CFM, que a U18 põe nos 340 px inferiores? | isentar o chrome por campo explícito no slot (`exempt_from_bands: true`), nunca por omissão, e subir o rodapé do CFM para fora da faixa |
| Q3 | Valores de `format` que o job traz (U21, contrato H1) | usar `1:1`, `4:5` e `9:16` até o H1 dizer outra coisa |
| Q4 | A zona segura fica só no código (recomendado) ou também no arquivo? | só no código |
| Q5 | A zona `380 a 1600` que o `templates.json` declara para `reel-02-overlay` ainda vale, além de 260/340? | tratar como UNKNOWN e, por segurança, aplicar a interseção (380 a 1580) no slot até haver resposta |
| Q6 | Fonte concreta do render por `family`: `sans` = Arial e `mono` = Courier New (U20), mas os SVGs usam a pilha `Arial, sans-serif` e `monospace` | guardar só `family` agora; a pilha de CSS é decisão do VL-5 |
| Q7 | Pedir uma combinação `(gramática, formato)` sem template é erro de código, como em §5? | sim |

## 9. Próximo passo, se aprovada

1. `contracts/visual_library.schema.json` (subconjunto de `schema.js`) e 4 fixtures.
2. `validators/visual_library.js` com os testes e a mutação das regras da §6.
3. `config/baseline/visual_library.json` com os 6 templates, somente depois de Q1 e Q2.
