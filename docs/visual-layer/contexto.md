# Contexto — Camada visual (estágios 06–09)

> Proposta para revisão. Status: **PROPOSED** até aprovação do Fonseca. Este documento não altera `CLAUDE.md`; em conflito, `CLAUDE.md` e `docs/` prevalecem.
> Rótulos: **VERIFIED** (visto numa fonte citada) · **CALCULATED** (fórmula pública aplicada, reproduzível) · **PROPOSED** (desenho nosso) · **UNKNOWN** (sem fonte; bloqueia ou exige decisão).
> Companheiros: `roadmap.md` (marcos VL-0 a VL-7) e `checkpoints.md` (CP-VLx.y e plano de testes).

## 1. Escopo confirmado

Decisão do usuário em 2026-10-22: o relatório *Contratos primeiro: orquestrando agentes NATURE.exe no Figma* é **referência de design-time** (biblioteca Figma e QA geométrico). O **runtime** implementa só os estágios **06_VISUAL, 07_COVERS, 08_RENDER e 09_QA** do `CLAUDE.md`.

- **Dentro:** validadores, contratos, baseline visual, núcleo de render e os 4 workflows n8n desses estágios.
- **Fora:** estágios 01–05 e 10–12, Fase 1 (banco) e Fase 4 (infra n8n). Esses dois últimos são **pré-requisitos externos** e aparecem aqui como bloqueios, não como entregas.
- **Interpretação de "estágios determinísticos" (PROPOSED):** o código controla estado, validação, cálculo, arquivos, retries e render. O LLM só entra nos usos que `CLAUDE.md` §1 permite (escolha de gramática visual em 06, headline em 07, QA semântico em 09), via Basic LLM Chain ou Information Extractor com Structured Output Parser, sem loops. O MVP é o núcleo determinístico, com as saídas de LLM injetadas por fixtures; os nós LLM entram depois que os prompts baseline forem aprovados (VL-6).

## 2. Fontes e autoridade

| Fonte | Papel | Referência |
| --- | --- | --- |
| `CLAUDE.md` (v1.0, 2026-10-11) | constituição do projeto | repo, baseline `e821de16140d0731b44b55fc9e12847d59b0a253` |
| `docs/STAGES.md`, `PUBLIC_PRIVATE.md`, `ALUCINAÇÃO_GUARD.md` | regras de etapa, fronteira de repos, proibições | repo |
| Relatório NATURE.exe | referência de design-time; não sobrepõe o `CLAUDE.md` | https://claude.ai/artifact/8y5CuhdSjRCNkC5raxQ7hN |
| Pacote de marca "Lambda-inspired" | insumo de design: `tokens.css`, `templates.json`, 6 SVGs, `DESIGN.md`, `README.md`, `brandbook.html` | zip e HTML enviados pelo usuário (fora do repo) |
| Arquivo Figma | biblioteca de design-time, 3 páginas | `fileKey` z6p242KdZVImub4JZu4FlG |

## 3. O que vem do relatório e o que não vem

| Conceito do relatório | Destino |
| --- | --- |
| Contratos primeiro, validação por código | **Mantido**; coincide com `CLAUDE.md` §8 |
| QA geométrico (`QA-DIM/OVF/SAFE/CTR/TOK/TYPE/GRID`) | **Mantido no runtime** como validadores do `09_QA` sobre `cover_spec` e mapa de slots. No relatório o alvo são nós Figma via REST; aqui o alvo são SVG e slots |
| Biblioteca Figma (tokens, componentes sem slots) | **Design-time**: fonte dos templates; nenhuma escrita em runtime |
| Limites do Figma (20 kB por chamada, sem imagens, sem fontes customizadas) | **Design-time**, citados do relatório e **não reverificados** |
| Agentes A0–A9 | **Descartado** em runtime (`CLAUDE.md` §2) |
| Laço Builder ↔ QA | **Descartado**: chamadas recursivas de LLM são proibidas. Retries são do n8n (3x em nós LLM e HTTP) |
| Máquina de 16 estados em arquivo | **Substituída** pela de 13 estados no banco (§5) |
| Gates humanos (`interrupt`, arquivo) | **Substituídos** por `AWAITING_APPROVAL` / `10_APPROVAL` (fora do escopo) |
| Gates CFM 2.336/2023 | **UNKNOWN**: aplicabilidade ao domínio deste pipeline não confirmada (D-05) |
| Aesthetic-4K, A5 (imagem), A8/A9 (publicação, métricas) | **Fora do escopo** |
| Skills `brand-voice` | **Fora do runtime** |

## 4. Estágios 06–09 no modelo do repo

Fonte: `docs/STAGES.md` §6 e `CLAUDE.md`. O status de saída dos estágios 06 a 08 **não é declarado**; a coluna abaixo é inferida pela ordem da máquina de estados (D-09).

| Estágio | Objetivo (STAGES.md) | Status de saída | Escreve | Config e prompt | LLM permitido | Código |
| --- | --- | --- | --- | --- | --- | --- |
| 06_VISUAL | escolhe gramática visual de lista fechada; não inventa visual fora da biblioteca; gera `visual_spec` | `VISUAL_PLANNED` (inferido) | `visual_specs` | `visual_library`, `prompt.06_visual` | escolha dentro da lista fechada | rejeita valor fora do enum |
| 07_COVERS | especifica capas e layouts com parâmetros do baseline; gera `cover_spec` | `COVERS_SPECIFIED` (inferido) | `cover_specs` | `prompt.07_covers` | headline (temperatura > 0 permitida) | limites de linha e caracteres; números rastreáveis |
| 08_RENDER | renderiza capa e layout final; falha vira `RENDER_FAILED` | `COVERS_RENDERED` (inferido); erro `RENDER_FAILED` (declarado) | UNKNOWN (onde ficam os artefatos) | — | nenhum | composição determinística |
| 09_QA | valida o contrato final e aplica quality gates | `QA_PASSED` ou `QA_FAILED` (declarados) | `qa_results` | `prompt.09_qa` | QA semântico | gates geométricos, contraste, números, enums |

Todo uso de LLM grava em `llm_calls`. Toda linha gerada carrega `job_id`, `stage`, `config_source`, `config_version`, `model`, `execution_id` e `created_at`; sem proveniência, a linha não entra no banco.

## 5. Máquina de estados (VERIFIED, `CLAUDE.md` §5)

```
RECEIVED → PDF_PARSED → EVIDENCE_EXTRACTED → EVIDENCE_VERIFIED → INSIGHTS_GENERATED → INSIGHTS_RANKED
→ VISUAL_PLANNED → COVERS_SPECIFIED → COVERS_RENDERED → QA_PASSED → AWAITING_APPROVAL → HUMAN_APPROVED → PUBLISHED
Erros: VERIFICATION_FAILED, QA_FAILED, RENDER_FAILED, NEEDS_REVIEW. Qualquer estado → NEEDS_REVIEW.
```

Workflows nunca fazem `UPDATE` direto no status; chamam `mark_running()` e `set_status()`, e o trigger `guard_transition()` rejeita saltos. Os objetos citados no `CLAUDE.md` são **requisitos planejados**, não prova de objetos implantados.

## 6. Design-time × runtime

| | Design-time | Runtime |
| --- | --- | --- |
| Quem | humano + assistente de desenvolvimento supervisionado (4 papéis fixos) | n8n, código e Postgres |
| Onde | Figma, pacote de marca, PRs deste repo | workflows `n8n/workflows/*`, `validators/`, banco |
| Escreve | Figma só com seat Full (seat atual: View, escrita **UNKNOWN**); PRs | banco via funções; artefatos de render |
| LLM | Claude Code, só para desenvolvimento | modelo configurado no n8n (`OPENAI_MODEL` no `.env.example` é placeholder) |
| Regras | handoff e review (`CLAUDE.md` §2) | proveniência, idempotência, anti-alucinação |

## 7. Insumos de marca

### 7.1 Tokens (VERIFIED, `tokens.css`)

`--bg #0B0B0B` · `--surface #141414` · `--surface-warm #1F1F1F` · `--fg #E7E6D9` · `--fg-2 #D3D2C5` · `--muted #B0AFA6` · `--meta #82817E` · `--border #42413E` · `--accent #6236F4` · `--accent-hover #754EF7` · `--success #37CD8F`. Fontes: `Suisse Intl` / `Helvetica Neue` / Arial (display e corpo) e `Suisse Intl Mono` / `IBM Plex Mono` / monospace.

### 7.2 Templates (VERIFIED, `templates.json`)

| Template | Tamanho | Categoria | Zona segura declarada |
| --- | --- | --- | --- |
| `post-01-manifesto` | 1080×1080 | Post 1:1 | margem 90 px |
| `post-02-metrica` | 1080×1350 | Post 4:5 | margem 90 px; headline até 3 linhas |
| `carousel-01-capa` | 1080×1080 | Carrossel 1:1 | margem 90 px |
| `story-01-convite` | 1080×1920 | Story 9:16 | 120 px laterais; sem conteúdo crítico nos 260 px superiores e 340 px inferiores |
| `reel-01-capa` | 1080×1920 | Reels 9:16 | evitar topo 260 px e base 340 px; título centralizado |
| `reel-02-overlay` | 1080×1920 | Reels 9:16 | textos entre y 380 e 1600 |

### 7.3 Contrastes (CALCULATED, fórmula WCAG de luminância relativa)

| Par (texto sobre fundo) | Uso nos templates | Razão |
| --- | --- | --- |
| `--fg` sobre `--bg` | headlines | 15,67:1 |
| `--muted` sobre `--bg` | labels de 19–23 px e subtítulos | 8,93:1 |
| `--meta` sobre `--bg` | token de legenda | 5,05:1 |
| `--accent` sobre `--bg` | numeral "01" de 190 px | **3,14:1** |
| `--fg` sobre `--accent` | label de CTA (21–28 px) | **4,99:1** |
| `--bg` sobre `--fg` | label do botão creme | 15,67:1 |
| `--muted` sobre `--surface` | "EM DESTAQUE" (23 px) | 8,36:1 |
| `--fg` sobre `--surface` | painel | 14,67:1 |
| `--border` sobre `--bg` | réguas (decorativo, não é texto) | 1,93:1 |

Leitura: `--accent` sobre `--bg` só atende o limiar de texto grande (3:1 em `DESIGN.md` §9) e **reprova** em texto pequeno; `--fg` sobre `--accent` passa o limiar de 4,5:1 por pouco. Os gradientes de fundo (índigo a 18% de opacidade) não entram no cálculo.

### 7.4 Achados da inspeção (VERIFIED nos arquivos recebidos)

1. **3 dos 6 SVGs não são XML bem formado** (`carousel-01-capa`, `post-01-manifesto`, `post-02-metrica`): o contador "01 / 06" tem `text-anchor` duplicado. Testado com parser XML estrito (Python `ElementTree`); os 3 SVGs de 1920 px passam. O painel de templates enviado os exibe normalmente, ou seja, o renderizador que o gerou tolera o erro; parsers estritos falham.
2. **Nenhum `<text>` tem `id`**: os slots não são endereçáveis. Quebras de linha e tamanhos por linha são fixos (ex.: capa de Reels com 164, 126 e 108 px).
3. **Margem:** `templates.json` recomenda 90 px, mas o marcador e o rodapé usam `x=76`. UNKNOWN se esse chrome é isento (D-08).
4. `<linearGradient id="halo">` é definido e **não usado** nos 6 arquivos.
5. **Fontes:** os vetores usam Arial e monospace; `Suisse Intl` é só citada e não é distribuída (README).
6. **Direitos:** o pacote se declara reconstrução independente e não oficial; `DESIGN.md` §6 diz que as diretrizes da Lambda exigem autorização para reproduzir ativos de marca (D-04).
7. **Figma:** 3 páginas (`01 • Brand foundations`, `02 • Components`, `03 • Social templates`); `whoami` mostra seat **View** em plano starter; 8 bibliotecas comunitárias adicionadas ao arquivo (Material 3, Simple Design System, iOS e macOS 26 e 27, watchOS 26, visionOS 26), que poluem buscas.

## 8. Regras herdadas do `CLAUDE.md` e do `ALUCINAÇÃO_GUARD.md`

1. **Nenhum AI Agent** em runtime; temperatura 0 em extração (exceto headlines).
2. **LLM extrai, código calcula** (§3). Validações determinísticas, nunca confiando na saída crua (§8).
3. **Etapas criativas só leem evidência `VERIFIED`** (§4).
4. **Estado vive no banco**; nunca `UPDATE` direto no status (§5).
5. **Idempotência:** `delete` + `insert` na mesma transação, chaveado por `(job_id, stage)` (§6).
6. **Proveniência em toda linha** (§7).
7. **Enums fechados**; desconhecido é `null` ou `"not_reported"`, nunca invenção.
8. **Nada inventado:** parâmetro de nó n8n, endpoint, coluna ou função sem fonte verificada; na dúvida, parar e pedir a fonte.
9. **Público × privado:** nenhum PDF real, saída de LLM, linha de banco ou métrica no repo público; o público funciona sem o privado.
10. **Nenhum workflow público** com credential ID, `pinData` ou URL privada.

## 9. Desenvolvimento supervisionado

Quatro papéis fixos: **master** (especificação e coordenação), **researcher** (verificação de fonte, somente leitura), **implementer** (único que escreve mudanças aprovadas) e **reviewer** (revisão somente leitura). Handoff: master → researcher → master → implementer → reviewer → master → Fonseca. Cada tarefa registra escopo, critérios de aceite, fontes, SHA de baseline e de candidato, artefatos, evidência de validação e incógnitas bloqueantes, distinguindo VERIFIED, PROPOSED e UNKNOWN.

- No máximo **2 ciclos de correção** por tarefa. Um veredito PASS vale só para o SHA candidato e a baseline registrados.
- **Revisão de documento** usa o digest SHA-256, com `reviewed_commit_sha = null`, e não autoriza merge.
- Nenhum bot reporta MERGED ou DEPLOYED. Só o Fonseca faz merge ou deploy.
- Antes de qualquer push de correção, verificar que o PR está `OPEN`.

## 10. Desconhecidos

| ID | Falta | Bloqueia | Quem resolve |
| --- | --- | --- | --- |
| U1 | **DECIDIDO** em 2026-10-22 pelo usuário: o baseline fica em `editorial.config_baseline`. Evidência de schema implantado segue UNKNOWN, e `CLAUDE.md` §9 ainda cita as duas formas | — (a Fase 1 segue exigindo U11) | Fonseca: confirmar a decisão e ajustar o `CLAUDE.md` |
| U2 | campos de `visual_spec`, `cover_spec`, `qa_result` (os arquivos de contrato não existem) | VL-3 | Fonseca aprova proposta (VL-3) |
| U3 | conteúdo e schema de `visual_library` | VL-4 | idem |
| U4 | engine e formato do render no n8n Cloud (SVG puro × PNG). Módulos permitidos: **resolvido** pela lista conferida pelo Fonseca (ver nota em §10) | VL-5, VL-6 | Fonseca, para a engine de render |
| U5 | schema de `verification_thresholds` e limiares de QA | validação de faixa, VL-4 | Fonseca |
| U6 | aplicabilidade de regras regulatórias (CFM) ao domínio | **respondido** (Fonseca, 2026-10-22): sim (D-05). A fonte e o conteúdo da regra seguem UNKNOWN (U22) |
| U7 | direitos de uso do pacote "Lambda-inspired" no repo público | **RESPONDIDO** (Fonseca, 2026-10-23): a declaração de propriedade do markup (22/10/2026, `owned_brand_asset`) vale como registro e fecha o CP-VL1.6 na v0.1; a seção "Proveniência" está em `assets/brand/README.md`. O assistente não verifica a titularidade | VL-4 | — |
| U8 | se escrita no Figma funciona no seat View | só o design-time | teste do usuário ou seat Full |
| U9 | como semear um job sintético em `INSIGHTS_RANKED` sem violar `guard_transition()` | VL-7 | Fonseca / Fase 1 |
| U10 | **DECIDIDO** (Fonseca, 2026-10-22): formato PT-BR, vírgula decimal (`9,52`) | — | — |
| U11 | **RESPONDIDO** (Fonseca, 2026-10-22): a-o. Implementado nas migrations 001 a 005 (PRs #6, #7, #8; 005 sem PR). Ver `schema-contract.md` §10–13 | Fase 1, VL-6 | — |
| U11-h | **RESPONDIDO** (2026-10-22): `editorial.jobs` no schema `editorial` | `set_status`, `mark_running` (migração própria) | — |
| U11-i | **RESPONDIDO** (2026-10-22): estados de erro voltam ao estado de trabalho de origem, além de NEEDS_REVIEW | retry de etapa | — |
| U11-j | **RESPONDIDO** (2026-10-22): `editorial.signatures`; `guard_transition(job_id, from, to)` exige aprovação registrada | gate humano | — |
| U11-k | **RESPONDIDO** (2026-10-22): nenhum estado novo; só AWAITING_APPROVAL e HUMAN_APPROVED | gates do relatório | — |
| U11-l | **RESPONDIDO** (2026-10-22): `NEEDS_REVIEW` sai para `AWAITING_APPROVAL` ou para o estado de trabalho de origem. Restrições do guard são escolha minha (§13) | revisão humana | — |
| U11-m | **RESPONDIDO** (2026-10-22): `approved` e `rejected` confirmados; gravação pelo papel `human_reviewer`. Pendente: não deixar a credencial em workflow sem supervisão | gate | — |
| U11-n | **RESPONDIDO** (2026-10-22): `jobs` ganha a proveniência de `CLAUDE.md` §7 | `jobs`, `set_status` | — |
| U11-o | **RESPONDIDO** (2026-10-22): `jobs.attempt_count`; o limite de 3 é do código. Reuso de assinatura resolvido por `status_entered_at` (escolha minha) | retry, gate | — |
| U12 a U17 | **RESPONDIDO** (Fonseca, 2026-10-22): seguir as recomendações PROPOSED (mapa de slots v0, `alt_text` obrigatório, `rationale` com até 280 caracteres, ids uuid, motivos do juiz semântico, `grammar_id` conferido por código). Ver `contracts-proposal.md` §7 | — | — |
| U18 | **RESPONDIDO** (Fonseca, 2026-10-22; ele disse "reafirmando", e não encontrei registro anterior neste repositório): o rodapé do CFM fica na base, com 12 px, branco, centralizado, no formato `[Nome] – MÉDICO – CRM/[UF] [Número]`. **Posição, decidida depois (Fonseca, 2026-10-22):** nos 9:16 o rodapé fica **acima** da linha de 1580 px (exemplo dado: `y = 1540`; `geometry.cfmFooterBaseline` devolve 1540 em 1080×1920); nos demais formatos fica na base, com a margem de 64 px. Isso substitui a posição "dentro da faixa de 340 px" desta linha. **Ainda UNKNOWN:** de onde vêm Nome, UF e Número (o job? a config?); se "branco" é `#FFFFFF` ou o token `--fg` (`#E7E6D9`); a chave `cfm_footer` ainda não existe em `config/baseline/` e o slot do rodapé ainda não está no mapa de slots nem nos SVGs. **Risco que continua:** 12 px num canvas de 1080 px de largura é pequeno. O risco da faixa do Reels deixou de existir com a nova posição, e o rodapé não é exceção no `QA-SAFE` | `cover_spec` com rodapé, patch dos SVGs, chave `cfm_footer` | Fonseca |
| U19 | **RESPONDIDO** (Fonseca, 2026-10-22): foi um erro na declaração do template, não nos arquivos. A margem é de 64 px (D-08) e a zona segura é o espaço restante. `geometry.js` aplica os 64 px nos quatro lados (PR #19). Consequência: as zonas de `templates.json` estão erradas e o `visual_library` (VL-4) carrega as corrigidas. As faixas de interface dos formatos 9:16 passaram a valer por U23 (PR #26, aberta, aguarda revisão) | `QA-SAFE`, VL-4 | — |
| U20 | **RESPONDIDO** (Fonseca, 2026-10-22): em design-time, Arial como fonte de texto e Courier New (monoespaçada) para números e códigos; atualizar no Figma na Fase 5. Sem os arquivos reais no ambiente, as larguras vêm de Liberation Sans e Mono (compatíveis por projeto do fabricante, não verificado aqui); contra as larguras Helvetica/AFM, 185 de 190 pontos de código Latin-1 comparáveis são iguais. Arial e Courier New reais **nunca foram medidos** | `geometry.js` | — |
| U21 | **RESPONDIDO, com ressalva** (Fonseca, 2026-10-22): o formato pedido (1:1, 4:5, 9:16) vem do campo `format` do payload do estado `request_received` (contrato H1). **Não verificável aqui:** `request_received` não é um dos 17 estados de `CLAUDE.md` §5 (o primeiro é `RECEIVED`), o contrato H1 não está no repositório e os valores permitidos de `format` também não. Sem o texto do H1, o campo não pode ser validado nem entrar em schema. A resposta anterior, "Lista de validadores: aprovada como está na proposta", segue registrada como aprovação da tabela de `contracts-proposal.md` §8, por interpretação minha, a confirmar | gramática `capa` | Fonseca |
| U22 | **RESPONDIDO** (Fonseca, 2026-10-22): a fonte é a planilha privada dele. Lista v0.1 de 10 termos em `config/baseline/cfm_blocklist.json` (PR #21, mesclada). A PR #23 (mesclada) tirou o `100%` isolado (D-13), e a PR #25, aberta, acrescenta `100% eficaz` (10 termos). A fonte normativa da regra do CFM segue **UNKNOWN**: o assistente não a verificou | `QA-CFM`, prompt do `copywriter-cfm` | — |
| U23 | **RESPONDIDO** (Fonseca, 2026-10-22): sim, as faixas continuam valendo. As de 260 px (topo) e 340 px (base) são da interface do Reels e os 64 px são as margens laterais; as duas regras valem em conjunto. `geometry.js` aplica em cada lado o maior dos dois limites (PR #26, mesclada). **Premissas minhas, a confirmar:** "em conjunto" lido como o maior dos limites, não a soma; os 64 px seguem nos quatro lados dos formatos 1:1 e 4:5; um canvas é 9:16 quando `largura × 16 = altura × 9`. **UNKNOWN:** a faixa de 380 a 1600 que `templates.json` declara para o `reel-02-overlay` (a resposta fala só de 260 e 340). **Efeito calculado** (valores de `slot-map-v0.md`, só a vertical): reprovariam `label_top` nos três formatos 9:16, `cta_label` do `story-01-convite` e a 2ª linha do `headline` do `reel-02-overlay`; o chrome **não é isento** (decisão do Fonseca, 2026-10-22: "nada é isento"; nenhum elemento crítico fica nas áreas de corte), então `label_top` e `cta_label` mudam de lugar no patch dos SVGs (D-06). Limites: topo seguro a partir de 260 e base segura até 1580 em 1080×1920, inclusivos em `geometry.js` (o texto da decisão diz "y > 260" e "y < 1580"; a leitura estrita moveria cada borda em 1 px) | `QA-SAFE` em 9:16, patch dos SVGs | Fonseca |
| U24 | **RESPONDIDO e implementado em PR, sem veredito** (Fonseca, 2026-10-22): bloqueio em duas camadas. (a) No JSON Schema de `image_assets` (`contracts/image_assets.schema.json`), o enum `provenance` de `images[]` é `generated_illustration` e `stock_licensed`; `owned_photo` só existe em `exceptions[]`. (b) No validador de negócio (`validators/media.js`), aceitar `owned_photo` exige o `approval_id` de um registro em `editorial.image_approvals` (migration 008), que só `human_reviewer` grava; o registro tem de nomear o job, a imagem e o assunto. Foto clínica (`patient`, `before_after`, `exam`) é recusada sempre, com ou sem registro. **Substitui** o flag `human_approved: true` e a justificativa no payload (decisão do Fonseca no mesmo dia: o flag é frágil). O contrato `image_assets` v0.1.0 original não existe em arquivo; a proposta (`image-assets-proposal.md`) é o v0.1.0 oficial, por decisão do Fonseca. **Limites:** o código só barra o que o produtor declara em `subject`; o registro humano é a segunda declaração. Em aberto: estágio em que o upload é aprovado (Q1), revogação de aprovação, registro de auditoria das recusas |  CP-VL3.5 | Fonseca |

## 11. Decisões pendentes (Fonseca)

| ID | Decisão | Recomendação (PROPOSED) |
| --- | --- | --- |
| D-01 | Onde ficam estes documentos | `docs/visual-layer/` |
| D-02 | Local do baseline | **decidido** (usuário, 2026-10-22): `editorial.config_baseline`; a Fase 1 ainda depende de U11 |
| D-03 | Saída do `08_RENDER` | SVG no MVP; PNG só depois de verificar uma engine compatível com n8n Cloud |
| D-04 | Uso do pacote de marca no repo público | **decidido** (Fonseca): os SVGs ficam fora do repo público e só no scratchpad. Entrada no repo só com autorização explícita do Fonseca, numa fase ainda a nomear (ver D-10). Direitos seguem U7 |
| D-05 | Regras regulatórias (CFM) se aplicam? | **decidido** (Fonseca, 2026-10-22): sim, conformidade é objetivo do sistema. Gate `QA-CFM`, configs `cfm_blocklist` e `cfm_footer` (conteúdo: U22 e U18) |
| D-06 | Quem corrige os SVGs (XML, ids de slot) | patch proposto no VL-1, aprovado antes de entrar no repo |
| D-07 | Módulos em CommonJS puro, sem dependências | confirmar (`validators/math.js` já segue isso) |
| D-08 | Margem do chrome (marcador e rodapé em x=76) | **decidido** (Fonseca, 2026-10-22): 64 px é a margem externa (chrome). **Ajustado por U19 (mesmo dia):** a zona segura de conteúdo é o espaço restante (tela menos 64 px em cada lado), e não mais 90 px. Aplicado em `geometry.js` (PR #19, mesclada). **Ajustado de novo por U23 (mesmo dia):** nos formatos 9:16 as faixas de 260 px (topo) e 340 px (base) também valem, e em cada lado vale o maior limite (PR #26, aberta, aguarda revisão) |
| D-09 | Mapeamento estágio → status de saída (§4) | confirmar a inferência |
| D-10 | Qual fase autoriza a entrada dos SVGs no repo. O Fonseca falou em "Fase 5", mas em `CLAUDE.md` a Fase 5 é Etapas 01 e 02 (ingest e extract), sem relação com a camada visual. A entrada da marca liga-se ao VL-4, que em `CLAUDE.md` é a Fase 3 (Contratos e baseline) | **decidido** (Fonseca, 2026-10-22): só no VL-4 (Fase 3). Exige também a nota de direitos (U7, VL-1) antes da entrada |
| D-11 | Agentes A1–A7 como subagentes com ferramentas × `CLAUDE.md` §2 | **decidido** (Fonseca, 2026-10-22): o `CLAUDE.md` prevalece. Não há subagentes autônomos em runtime; os `SKILL.md` são prompts de sistema de nós de LLM do n8n, sem ferramentas. Só se rascunha o que o escopo determinístico permite (06, 07, 09) |
| D-12 | Fonte do prompt: `skills/` × `prompts/baseline/` | **decidido** (Fonseca, 2026-10-22): `skills/` é a fonte única da verdade; o `seed-baseline` leva o texto para a config. O formato do `content` é proposta nossa (ver a PR dos prompts) |
| D-13 | A palavra isolada `100%` sai de `cfm_blocklist`; ficam só promessas | **decidido** (Fonseca, 2026-10-22): `numbers.js` cuida da matemática e a lista cuida da semântica legal. Um `100%` verificado é publicável; `100% garantido` continua barrado por `garantido`. Implementado na PR #23 (mesclada). **Ampliado no mesmo dia:** `100% eficaz` entra na lista como termo, porque a regra do CFM é contra a promessa e não contra o número (PR #25, aberta, aguarda revisão). Variações como `100% eficazes` e `100% seguro` continuam passando, por desenho |
| D-14 | A lista de termos proibidos pode ficar no repositório público? | **decidido** (Fonseca, 2026-10-22): sim, é intencional. Segundo o Fonseca, a lista é regra pública do CFM e da LGPD (afirmação dele, não verificada pelo assistente). O que fica privado no `editorial-intel` é a metodologia da pesquisa e os casos reais |
| D-15 | Mídia clínica na v1 | **decidido** (Fonseca, 2026-10-22): o bloqueio deve ser imposto. O sistema não aceita upload de imagens de pacientes (fotos clínicas, antes/depois, exames) por padrão; só ilustrações geradas (com selo) ou imagens de banco com crédito. **Desenho em U24, em duas camadas**, com a aprovação de `owned_photo` como registro no banco (migration 008, PR #32) e o contrato e o validador na PR seguinte (`image_assets.schema.json`, `media.js`). **Implementado em PRs abertas, sem veredito**; nada no `main` impõe o bloqueio ainda |
| D-16 | Textos de exemplo dos SVGs, posição dos blocos movidos e legenda com CTA | **decidido** (Fonseca, 2026-10-23): (1) os textos de exemplo dos SVGs saem e entram marcadores neutros (`{{slot_id}}`). (2) "Posicionamento pragmático, confiança": o implementer decide onde os blocos movidos ficam, mantendo o espaçamento original; **aprovado depois** (marca em `assets/brand/README.md`): `label_top` em 290, rodapé em 1540, bloco do story subido, régua do reel-02 acima do rótulo, rodapé do CFM em `#E7E6D9` Arial 400 (PROPOSED aprovado). (3) Legenda e CTA: **a parte de automação (ManyChat + artefato) foi retirada, ver D-17** |
| D-17 | Legenda (`caption`) e CTA (`cta`) | **decidido** (Fonseca, 2026-10-23): **o CTA é texto inerte na arte, sem automação de engajamento nesta versão** (sem ManyChat, sem gatilho, sem entrega de artefato; v0.2, com revisão jurídica sobre CTA médico e LGPD). `cta`: campo opcional do `cover_spec`, de 1 a 40 caracteres, sujeito ao `QA-CFM` e à blocklist, e só existe se o template tiver o slot `cta_label` (hoje `post-01-manifesto` e `story-01-convite`). `caption`: o texto da legenda, **fora da arte**, saída do modelo no estágio `07_COVERS`, no contrato novo `post_copy`, até 300 caracteres. `cta_label` passa de `chrome` para `claim`. Guarda mecânica contra URL, `@`, `#` e telefone no CTA; a fronteira semântica fica no `09_QA` (motivo `cta_promete_entrega`). Proposta aprovada: `caption-cta-proposal.md` (digest `5088182009183ade2495622b91bd8168669b55402b6403fc98bb839871773abe`, perguntas Q1 a Q7 respondidas). **Limitação da v0.1 (Q2):** o escopo são as capas e o carrossel de capa; **não há template de "slide final"**, então um CTA no fim do carrossel exige um template novo (ex.: um `carousel-cta`) na v0.2. **Implementação (proposta §7), em PRs sequenciais:** (1) `contracts/post_copy.schema.json`, (2) `cta` no `cover_spec` e (3) `validators/copy.js` feitos; (4) prompt do `copywriter-cfm` pendente |
| D-18 | Faixa 380 a 1600 do `reel-02-overlay` (Q5 da proposta do `visual_library`) | **decidido** (Fonseca, 2026-10-23): o 380 é o topo do overlay do Instagram, e não uma zona própria do texto. Os textos do reel-02 respeitam a zona global (260 a 1580), e o `label_top` em 290 está seguro. Sem zona por template no arquivo |

## 12. Estado atual (VERIFIED em 2026-10-22, `main` em `0c99259bfc8ecd2cd142fc4814a59a2647a3409d`)

- **Fase 1 fechada:** migrations 001 a 006, rollbacks, `seed-baseline` e `verify-baseline` (com `--skills`), e os CI `migrations` e `validators` no GitHub.
- **Validadores** em `validators/`: `math`, `contrast`, `schema`, `numbers`, `blocklist` e `geometry`. Na árvore de `0c99259`, `node --test 'validators/*.test.js'` dá 155 de 155 e `node --test 'tests/skills/*.test.js'` dá 16 de 16 (rodado localmente); os CI `validators` e `migrations` estão verdes nessa árvore (GitHub Actions).
- **Contratos** em `contracts/`: `visual_spec`, `cover_spec`, `qa_result` (PR #20), com fixtures sintéticas. As regras que o schema não expressa (existência de ids, evidência `VERIFIED`, `slot_id` e `gate_id` únicos, `waived` proibido em `QA-CFM`, `passed` coerente com os gates) **ainda não têm validador de código**.
- **Prompts:** `skills/{art-director,copywriter-cfm,qa-validator}/SKILL.md` na v0.1, com `skills/.checksums`. Nenhum teste roda contra um modelo de linguagem.
- **Config:** `config/baseline/cfm_blocklist.json` com 9 termos no `main` (o `100%` isolado saiu na PR #23); a PR #25, aberta, acrescenta `100% eficaz` (10 termos).
- **PRs abertas:** #25 (`100% eficaz` na lista), #26 (faixas 9:16 no `geometry.js`) e a PR destes documentos. Mescladas pelo Fonseca em 2026-10-22 depois da #21: #22 (linha A5 do `skills/README.md`), #23 (`100%` isolado fora da lista) e #24 (documentação anterior).
- **Marca e direitos:** nenhum arquivo de marca no repo. O `slot-map-v0.md` contém geometria derivada dos SVGs (rótulo VERIFIED) e pede revisão de direitos; a nota de direitos (U7, CP-VL1.6) foi registrada em 2026-10-23 (`assets/brand/README.md`, seção "Proveniência").
- **Code node do n8n Cloud** (VERIFIED pelo Fonseca, trecho oficial colado na sessão; não verificado pelo assistente): só módulos nativos (crypto, http, https, url, util, querystring, stream, zlib, os, buffer, timers, string_decoder, events, dns, net, tls, assert); pacotes npm externos não são suportados no Cloud.
- Os documentos antigos em `design-system/claude/nature-exe-roadmap` descrevem a orquestra de agentes e **estão superados por este conjunto**.

## 13. Retomada

1. Ler este arquivo e `CLAUDE.md`. 2. Abrir `checkpoints.md` no primeiro item aberto. 3. Rodar a verificação do item anterior. 4. Executar só o item seguinte, com handoff registrado. 5. Se a execução esbarrar num UNKNOWN da §10, parar e pedir a fonte.
