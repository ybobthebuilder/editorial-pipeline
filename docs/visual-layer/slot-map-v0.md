# Mapa de slots v0 e lista de gramáticas (CP-VL1.5, U3, U12)

> Status: **PROPOSED**, para revisão por digest (`reviewed_commit_sha = null`); não autoriza merge.
> **Direitos (U7, D-04).** Este documento contém geometria (posição, tamanho, token de cor) derivada de SVGs de um pacote que se declara reconstrução não oficial. Nenhum SVG, nenhum texto de exemplo dos templates e nenhum arquivo de marca está aqui. **Revise se geometria derivada pode ficar no repo público antes do merge.**
> Rótulos: **VERIFIED** (atributo lido no SVG), **CALCULATED** (comparação reproduzível entre dois VERIFIED), **PROPOSED** (desenho nosso), **UNKNOWN**.

## 1. Origem dos dados

- Fonte: as 6 cópias dos SVGs com o XML corrigido (a única mudança foi remover o `text-anchor` duplicado em 3 arquivos), lidas por parser XML estrito. Os originais não estão mais acessíveis nesta sessão, então a igualdade de posições entre cópia e original **não foi reconferida**.
- Zonas seguras: `templates.json` (VERIFIED, `contexto.md` §7.2) e a decisão D-08 (64 px de margem externa do chrome; 90 px de zona segura de conteúdo).
- Tokens de cor: `tokens.css`. `#E7E6D9` é `--fg`, `#B0AFA6` é `--muted`, `#6236F4` é `--accent`, `#0B0B0B` é `--bg`.
- Os SVGs têm um `<text>` por linha, sem `id`. **Os `slot_id` abaixo são propostos**, e só existem de verdade depois do patch dos SVGs (D-06).

## 2. Slots por template

`kind`: `claim` passa por `numbers.js`; `chrome` é fixo de layout e não passa. **PROPOSED**: quem define o `kind` é este mapa, nunca o LLM. `y` é a linha de base da primeira linha. `largura útil` = largura da tela menos as margens laterais da zona segura (CALCULATED).

### 2.1 `post-01-manifesto` (1080×1080, largura útil 900)

| `slot_id` | `kind` | x | y | corpo | peso | token | linhas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `label_top` | chrome | 118 | 125 | 23 mono | 600 | muted | 1 |
| `headline` | claim | 90 | 455 | 116 e 114 | 600 | fg | 2 |
| `subhead` | claim | 90 | 635 | 32 | 400 | muted | 1 |
| `cta_label` | claim (D-17) | 130 | 798 | 23 mono | 600 | bg (sobre botão creme) | 1 |
| `footer_left` | chrome | 76 | 991 | 19 mono | 600 | muted | 1 |
| `counter` | chrome | 1004 (fim) | 991 | 19 mono | 600 | muted | 1 |

### 2.2 `post-02-metrica` (1080×1350, largura útil 900)

| `slot_id` | `kind` | x | y | corpo | peso | token | linhas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `label_top` | chrome | 118 | 125 | 23 mono | 600 | muted | 1 |
| `headline` | claim | 86 | 425 | 110 | 600 | fg | 3 (passo 112) |
| `metric_value` | claim | 90 | 907 | 162 | 600 | fg | 1 |
| `metric_label` | claim | 90 | 976 | 23 mono | 600 | muted | 1 |
| `subhead` | claim | 90 | 1042 | 36 | 400 | muted | 1 |
| `footer_left` | chrome | 76 | 1261 | 19 mono | 600 | muted | 1 |
| `counter` | chrome | 1004 (fim) | 1261 | 19 mono | 600 | muted | 1 |

### 2.3 `carousel-01-capa` (1080×1080, largura útil 900)

| `slot_id` | `kind` | x | y | corpo | peso | token | linhas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `label_top` | chrome | 118 | 125 | 23 mono | 600 | muted | 1 |
| `numeral` | chrome | 90 | 450 | 190 | 600 | accent | 1 |
| `headline` | claim | 90 | 610 | 77 | 600 | fg | 3 (passo 88) |
| `footer_left` | chrome | 76 | 991 | 19 mono | 600 | muted | 1 |
| `counter` | chrome | 1004 (fim) | 991 | 19 mono | 600 | muted | 1 |

### 2.4 `story-01-convite` (1080×1920, largura útil 840)

| `slot_id` | `kind` | x | y | corpo | peso | token | linhas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `label_top` | chrome | 118 | 125 | 23 mono | 600 | muted | 1 |
| `headline` | claim | 83 | 730 | 124 | 600 | fg | 2 (passo 125) |
| `subhead` | claim | 90 | 934 | 39 | 400 | muted | 1 |
| `highlight_label` | chrome | 127 | 1197 | 23 mono | 600 | muted | 1 |
| `highlight` | claim | 127 | 1305 | 83 | 600 | fg | 2 (passo 93) |
| `cta_label` | claim (D-17) | 390 | 1657 | 28 mono | 600 | fg | 1 |

### 2.5 `reel-01-capa` (1080×1920, largura útil: **UNKNOWN**, `templates.json` não declara margem lateral)

| `slot_id` | `kind` | x | y | corpo | peso | token | linhas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `label_top` | chrome | 118 | 125 | 23 mono | 600 | muted | 1 |
| `headline` | claim | 82 | 1000 | 164, 126 e 108 | 600 | fg | 3 (corpos e passos diferentes por linha) |
| `tag` | chrome | 122 | 1444 | 21 mono | 600 | fg | 1 |

### 2.6 `reel-02-overlay` (1080×1920, largura útil: **UNKNOWN**)

| `slot_id` | `kind` | x | y | corpo | peso | token | linhas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `label_top` | chrome | 118 | 125 | 23 mono | 600 | muted | 1 |
| `chapter_label` | chrome | 118 | 1390 | 23 mono | 600 | muted | 1 |
| `headline` | claim | 83 | 1510 | 133 | 600 | fg | 2 (passo 130) |

## 3. Achados (CALCULATED: posição lida no SVG contra a zona declarada em `templates.json`)

Medido pela linha de base do texto, não pelo contorno dos glifos. O `QA-SAFE` do `09_QA` falharia hoje nestes casos:

| Template | Slot | Achado |
| --- | --- | --- |
| `story-01-convite` | `headline`, `subhead` | x=83 e x=90, abaixo das laterais de 120 px |
| `story-01-convite` | `cta_label` | linha de base y=1657, dentro dos 340 px inferiores (limite 1580) |
| `reel-02-overlay` | `headline` (2ª linha) | y=1640, fora da faixa 380–1600 |
| `post-02-metrica` | `headline` | x=86, abaixo dos 90 px |
| `reel-01-capa` | `headline` | `templates.json` pede título centralizado; o texto está alinhado à esquerda em x=82 |
| os 6 templates | `label_top` | x=118, enquanto D-08 fixa 64 px de margem para o chrome; nos 3 formatos 9:16, a linha de base y=125 está nos 260 px superiores |
| `post-01-manifesto`, `post-02-metrica`, `carousel-01-capa` | `footer_left` | x=76, também diferente dos 64 px de D-08 |

Leitura: a geometria dos templates e a zona segura declarada não batem. Antes de virar baseline (VL-4), o patch dos SVGs (D-06) tem de decidir se o erro está nos templates ou na declaração, e se o chrome fica isento da zona segura. **Pergunta U19.**

## 4. Orçamento de caracteres (U12)

**Não proponho um número de caracteres por linha.** Ele depende da largura real dos glifos, e a fonte de render ainda não está decidida: os SVGs usam Arial e monospace; `Suisse Intl` não é distribuída; o container tem só DejaVu, que é mais larga que Arial e daria um orçamento errado.

**PROPOSED:** o mapa carrega `max_width_px` (largura útil, CALCULATED acima), `font_size` e `letter_spacing` por slot. O `geometry.js` mede o texto com uma **tabela de larguras de avanço** da fonte escolhida e recusa o que passa de `max_width_px`. Para o prompt do LLM, o código converte isso num limite conservador de caracteres por linha e o repassa em `max_chars_per_line`. Sugiro métricas de uma fonte compatível com Arial; não verifiquei essa compatibilidade. **Pergunta U20: qual fonte, e de onde vêm as métricas.**

## 5. Gramáticas (U3) — recomendação PROPOSED, seguida por decisão do Fonseca em 2026-10-22

`grammar_id` não é o mesmo que `template_id`: o LLM escolhe a gramática e a config a mapeia para os templates permitidos. Com 6 templates não há como derivar uma lista mais rica sem inventar; esta é a lista mínima, derivada dos nomes e categorias de `templates.json` (VERIFIED):

| `grammar_id` | Ideia | Templates permitidos |
| --- | --- | --- |
| `metrica` | um número em destaque com a variação | `post-02-metrica` |
| `manifesto` | uma afirmação central | `post-01-manifesto` |
| `capa` | título de abertura | `carousel-01-capa`, `reel-01-capa` |
| `convite` | chamada para ação com destaque | `story-01-convite` |
| `overlay` | texto sobreposto a vídeo | `reel-02-overlay` |

Quando a gramática permite mais de um template (`capa`), o formato pedido decide: de onde vem esse formato no job é **UNKNOWN** (U21; hipótese: `input_context.format`). Os ids acima são propostos e a descrição que o LLM vê vem da config.

## 6. O que este documento não faz

Não cria `visual_library.json`, `.checksums` nem nenhum arquivo em `config/baseline/`; não corrige os SVGs; não escolhe fonte; não define o rodapé do CFM (ver U18 em `contracts-proposal.md`).
