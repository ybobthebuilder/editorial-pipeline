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
| U6 | aplicabilidade de regras regulatórias (CFM) ao domínio | módulo opcional do 09_QA | Fonseca |
| U7 | direitos de uso do pacote "Lambda-inspired" no repo público | VL-4 | Fonseca |
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

## 11. Decisões pendentes (Fonseca)

| ID | Decisão | Recomendação (PROPOSED) |
| --- | --- | --- |
| D-01 | Onde ficam estes documentos | `docs/visual-layer/` |
| D-02 | Local do baseline | **decidido** (usuário, 2026-10-22): `editorial.config_baseline`; a Fase 1 ainda depende de U11 |
| D-03 | Saída do `08_RENDER` | SVG no MVP; PNG só depois de verificar uma engine compatível com n8n Cloud |
| D-04 | Uso do pacote de marca no repo público | **decidido** (Fonseca): os SVGs ficam fora do repo público e só no scratchpad. Entrada no repo só com autorização explícita do Fonseca, numa fase ainda a nomear (ver D-10). Direitos seguem U7 |
| D-05 | Regras regulatórias (CFM) se aplicam? | decidir antes do VL-3; se sim, módulo opcional do `09_QA` |
| D-06 | Quem corrige os SVGs (XML, ids de slot) | patch proposto no VL-1, aprovado antes de entrar no repo |
| D-07 | Módulos em CommonJS puro, sem dependências | confirmar (`validators/math.js` já segue isso) |
| D-08 | Margem do chrome (marcador e rodapé em x=76) | **decidido** (Fonseca, 2026-10-22): 64 px é a margem externa (chrome). Os 90 px de `templates.json` passam a ser a zona segura de conteúdo |
| D-09 | Mapeamento estágio → status de saída (§4) | confirmar a inferência |
| D-10 | Qual fase autoriza a entrada dos SVGs no repo. O Fonseca falou em "Fase 5", mas em `CLAUDE.md` a Fase 5 é Etapas 01 e 02 (ingest e extract), sem relação com a camada visual. A entrada da marca liga-se ao VL-4, que em `CLAUDE.md` é a Fase 3 (Contratos e baseline) | **decidido** (Fonseca, 2026-10-22): só no VL-4 (Fase 3). Exige também a nota de direitos (U7, VL-1) antes da entrada |

## 12. Estado atual (VERIFIED em 2026-10-22)

- `main` do repo em `e821de1…`: só documentação de governança, **sem código**.
- Branch `claude/validators-math` (`da1083e9dc2e4ccb765a1e7ba126743bc829ffb4`): `validators/math.js` e `math.test.js`, 11 testes passando, 5 mutantes detectados. Sem PR.
- Branch `claude/validators-contrast` (`dcb572140146af36505d5a1350c9bcfcbec6c664`): `validators/contrast.js` e `contrast.test.js`, 17 testes passando, 10 de 11 mutantes detectados (o 11º é equivalente). Sem PR.
- Branch `claude/validators-schema` (`759df316c9e30066c5de264deaae5a2c5dd65554`): `validators/schema.js` e `schema.test.js`, 26 testes passando, 11 de 11 mutantes detectados. Sem PR.
- Módulos do Code node do n8n Cloud (VERIFIED pelo Fonseca, a partir do trecho oficial colado na sessão; o assistente não conseguiu acessar a documentação): só nativos (crypto, http, https, url, util, querystring, stream, zlib, os, buffer, timers, string_decoder, events, dns, net, tls, assert); pacotes npm externos não são suportados no Cloud.
- Branch `claude/validators-schema` (`759df316c9e30066c5de264deaae5a2c5dd65554`): `validators/schema.js` e `schema.test.js`, 26 testes passando, 11 de 11 mutantes detectados. Sem PR.
- Módulos do Code node do n8n Cloud (VERIFIED pelo Fonseca, trecho oficial colado na sessão; não verificado pelo assistente, cujo acesso à documentação foi bloqueado): só nativos (crypto, http, https, url, util, querystring, stream, zlib, os, buffer, timers, string_decoder, events, dns, net, tls, assert); pacotes npm externos não são suportados no Cloud.
- Branch `claude/docs-visual-layer`: estes três documentos, como proposta.
- Decisão do usuário em 2026-10-22: o baseline fica em `editorial.config_baseline` (U1, D-02). É uma decisão informada, não uma evidência de schema implantado.
- Branch `claude/migration-001` (`3276ff2c0b41871348095d683d0d2aae9ffeb570`): `supabase/migrations/001_init_editorial_schema.sql` e 16 testes contra Postgres 16.15 limpo. Sem PR.
- Branch `claude/ci-validators` (`90619f6ace61f4e17a736ecb637f2ddc2d4f56c6`): workflow de validadores, preparado e não ativo. Sem PR.
- Nenhum arquivo de marca foi adicionado ao repo.
- Os documentos antigos em `design-system/claude/nature-exe-roadmap` descrevem a orquestra de agentes e **estão superados por este conjunto**.

## 13. Retomada

1. Ler este arquivo e `CLAUDE.md`. 2. Abrir `checkpoints.md` no primeiro item aberto. 3. Rodar a verificação do item anterior. 4. Executar só o item seguinte, com handoff registrado. 5. Se a execução esbarrar num UNKNOWN da §10, parar e pedir a fonte.
