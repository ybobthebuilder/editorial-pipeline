# Roadmap — Camada visual (estágios 06–09)

> Proposta para revisão (**PROPOSED**). Pré-leitura: `contexto.md`. Verificação: `checkpoints.md`.
> Não há estimativa de duração: dependem de decisões e entradas em aberto. Fases citadas são as de `CLAUDE.md` ("Fases de Construção").

## Princípios de sequência

1. Segue a ordem do repo: banco → validators → contratos → infra n8n → etapas. O que não depende do banco avança antes; o que depende fica **bloqueado**, sem suposição.
2. Contrato antes de código que o consome; validador com teste antes de integração.
3. Uma tarefa atômica por vez, com handoff registrado (`contexto.md` §9).
4. Nenhum arquivo de marca entra no repo antes do VL-4 e da decisão D-04.

## Visão geral

| Marco | Entrega | Fase `CLAUDE.md` | Depende de | Estado |
| --- | --- | --- | --- | --- |
| VL-0 | alinhamento: estes docs revisados e decisões D-01 a D-09 | — | — | em revisão |
| VL-1 | design-time: auditoria do pacote de marca e do Figma (somente leitura) | — | VL-0 | não iniciado |
| VL-2 | validadores: `math` ✔, `contrast` ✔, `numbers`, `schema`, `geometry` | 2 | — | parcial (`math` e `contrast` em branches, sem PR) |
| VL-3 | contratos `visual_spec`, `cover_spec`, `qa_result` e prompts baseline | 3 | VL-0, VL-2 (`schema`) | bloqueado por U2 |
| VL-4 | baseline `visual_library` e checksums | 3 | VL-1, VL-3, D-04 | bloqueado por U3, U7 |
| VL-5 | núcleo de render em código puro | 8 | VL-3, VL-4 | não iniciado |
| VL-6 | workflows n8n 06–09 e cartões de etapa | 4, 7, 8 | VL-5 e Fases 1 e 4 | **bloqueado pelas Fases 1 e 4** (U1 decidido; U11 aberto) |
| VL-7 | integração sintética 06 → 09 | 9 (parcial) | VL-6 | bloqueado |

**Caminho crítico:** VL-0 → VL-3 → VL-4 → VL-5 → VL-6 → VL-7. **Em paralelo:** VL-1 e VL-2 (não dependem do banco). **Bloqueio duro:** a Fase 1 ainda não existe e depende de U11 (colunas, tipos e assinaturas); sem isso não há SQL, e portanto VL-6 e VL-7 ficam parados. U1 foi decidido em 2026-10-22 (`editorial.config_baseline`).

---

## VL-0 — Alinhamento

- **Objetivo:** aprovar o escopo e fechar as decisões que destravam o resto.
- **Entregas:** `docs/visual-layer/{contexto,roadmap,checkpoints}.md` em PR; digest SHA-256 de cada um; respostas do Fonseca a D-01 a D-09.
- **Revisão:** de documento, por digest, com `reviewed_commit_sha = null`; não autoriza merge.
- **Aceite:** CP-VL0.1 a CP-VL0.3.

## VL-1 — Design-time: auditoria (somente leitura)

- **Objetivo:** reconciliar o pacote de marca, o arquivo Figma e os templates, e produzir os dados que alimentam o baseline.
- **Tarefas:**
  1. **Orçamento de leituras do Figma.** O relatório cita 20 chamadas por mês para seat View (não reverificado); fixar um teto antes de começar.
  2. **Tokens:** comparar variáveis e estilos da página `01 • Brand foundations` com `tokens.css`.
  3. **Templates:** inventariar `02 • Components` e `03 • Social templates` e comparar com os 6 SVGs.
  4. **Patch proposto dos SVGs:** XML bem formado nos 6 (atributo `text-anchor` duplicado em 3), `id` por slot, remoção do gradiente não usado, política de margem (D-08).
  5. **Mapa de slots v0**, derivado dos SVGs: por template, cada slot com `id`, `x`, `y`, `font-size`, família, peso, token de cor, `text-anchor`, linhas e orçamento de caracteres por linha.
  6. **Nota de direitos e proveniência** (D-04).
- **Skills (design-time):** `figma:figma-use` apenas para leitura; `figma:figma-generate-library` só se houver seat Full e decisão de escrever. Nada disso roda em produção.
- **Aceite:** CP-VL1.1 a CP-VL1.6. **Riscos:** cota do Figma; 8 bibliotecas comunitárias poluem `search_design_system` (usar `includeLibraryKeys`).

## VL-2 — Validadores (Fase 2)

- **Objetivo:** regras determinísticas puras, sem dependências, compatíveis com n8n Cloud (U4), cada uma com `node:test` e verificação por mutação.
- **Ordem:**
  1. `math.js` ✔ — `computeDeltas`; no branch `claude/validators-math`, 11 testes, 5 mutantes detectados.
  2. `contrast.js` ✔ — razão de contraste WCAG entre cores hex (`#RGB` e `#RRGGBB`), sem arredondar; fórmula conferida na fonte oficial `w3c/wcag`; branch `claude/validators-contrast`, 17 testes, 10 de 11 mutantes detectados. A comparação com limiares (4,5:1 e 3:1) fica para quem consome (VL-4 e `geometry.js`).
  3. `numbers.js` — extrai tokens numéricos e verifica que cada número exibido na capa aparece nas evidências `VERIFIED` citadas; bloqueado em parte por U10 (locale).
  4. `schema.js` — validador de JSON Schema em subconjunto documentado, sem `ajv`; o subconjunto de palavras-chave é decisão de VL-3.
  5. `geometry.js` — dado um template e um `cover_spec`: slots conhecidos, linhas e caracteres dentro do orçamento, dimensões do canvas, conteúdo dentro da zona segura.
- **Fora desta fase:** validação de faixa de `math` (depende de U5) e `citation.js` (é do `03_VERIFY`).
- **Aceite:** CP-VL2.1 a CP-VL2.7.

## VL-3 — Contratos e prompts baseline (Fase 3)

- **Objetivo:** contratos JSON Schema dos três artefatos desta camada.
- **Passo 1 (bloqueante):** **proposta de contratos** em documento (campos, enums fechados, campos de proveniência obrigatórios, referências `evidence_ids`), revisada por digest e aprovada. Sem isso, nenhum schema é escrito (U2).
- **Passo 2:** `contracts/visual_spec.schema.json`, `cover_spec.schema.json`, `qa_result.schema.json` + fixtures sintéticas (2 válidas e 2 inválidas por contrato) em `fixtures/synthetic/`.
- **Passo 3:** `prompts/baseline/06_visual.md`, `07_covers.md`, `09_qa.md`, versionados com hash.
- **Aceite:** CP-VL3.1 a CP-VL3.4.

## VL-4 — Baseline visual

- **Objetivo:** `config/baseline/visual_library.json` (lista fechada de gramáticas, tamanhos, mapa de slots, tokens, zonas seguras, pares de cor permitidos) e `.checksums`.
- **Pré-condições:** mapa de slots do VL-1, schema do VL-3 e decisão D-04 sobre direitos e sobre público × privado.
- **Aceite:** CP-VL4.1 a CP-VL4.4. Os SVGs entram no repo **neste marco**, e só depois de D-04.

## VL-5 — Núcleo de render

- **Objetivo:** `renderCover(cover_spec, visual_library)` → string SVG, em código puro e determinístico.
- **Escopo:** preenche slots, escapa texto, não faz rede nem acessa arquivo; rejeita antes de renderizar o que `geometry.js` reprova. Saída em PNG fica atrás da decisão D-03.
- **Local do código:** UNKNOWN na estrutura planejada; proposta `render/render.js` (módulo colável no Code node), a confirmar.
- **Aceite:** CP-VL5.1 a CP-VL5.5. **Riscos:** XML bem formado sem dependências (o `node:test` não traz parser XML); fontes: o render usa Arial e monospace, e `Suisse Intl` não é distribuída.

## VL-6 — Workflows n8n 06–09 (bloqueado)

- **Pré-requisitos externos:** Fase 1 (banco, `state_transitions`, `guard_transition()`, `mark_running()`, `set_status()`, `get_config()`) e Fase 4 (`90_DB_HELPERS`, `99_ERROR_HANDLER`, `_TEMPLATE_STAGE`). U1 está decidido; falta U11.
- **Entregas:** cartões de etapa 06–09 no formato de `STAGES.md` §7 (local proposto: `docs/stages/`, ausente da estrutura planejada) e `n8n/workflows/06_VISUAL.json` a `09_QA.json`, sanitizados, seguindo o `_TEMPLATE_STAGE` de 11 passos.
- **Regras:** só Basic LLM Chain ou Information Extractor com Structured Output Parser; temperatura 0, exceto headline; retry 3x em LLM e HTTP; banco só por nó Postgres; **todo parâmetro de nó conferido em docs.n8n.io**.
- **Aceite:** CP-VL6.1 a CP-VL6.5.

## VL-7 — Integração sintética

- **Objetivo:** job sintético de `INSIGHTS_RANKED` a `QA_PASSED`, passando por `guard_transition()`.
- **Escopo:** reexecução idempotente de cada estágio, caminhos de erro (`RENDER_FAILED`, `QA_FAILED`, rebobina para `NEEDS_REVIEW`), proveniência em todas as linhas, Postgres limpo no CI.
- **Aceite:** CP-VL7.1 a CP-VL7.4. **Risco:** U9 (semear o job no estado inicial sem violar a máquina).

---

## Fora do escopo

Estágios 01–05 e 10–12; Fase 1 e Fase 4 como entregas; publicação e métricas; geração de imagens; qualquer agente em runtime; escrita no Figma em runtime.

## Skills, ferramentas e papéis

| Item | Uso | Onde |
| --- | --- | --- |
| Papéis master / researcher / implementer / reviewer | todo trabalho de código e doc | desenvolvimento |
| `engineering:testing-strategy` | plano de testes de `checkpoints.md` | desenvolvimento |
| `figma:figma-use`, `figma:figma-generate-library` | auditoria e, se autorizado, atualização da biblioteca | só design-time, sob seat e cota |
| MCP do Figma | leituras do VL-1 | design-time, com orçamento |
| MCP do GitHub | branches e PRs | desenvolvimento |
| n8n, Postgres, modelo de LLM configurado no n8n | estágios 06–09 | runtime (VL-6 em diante) |

## Riscos

| Risco | Efeito | Mitigação |
| --- | --- | --- |
| U11 sem resposta | VL-6 e VL-7 parados | trabalhar VL-1 a VL-5 e escrever os cartões de etapa como proposta |
| Direitos do pacote de marca (U7) | vazamento ou uso indevido | D-04 antes do VL-4; nada de marca no repo antes |
| Render em n8n Cloud inviável (U4) | VL-5 e VL-6 redesenhados | verificar docs.n8n.io antes de codar; SVG puro como base |
| Contratos inventados (U2) | retrabalho | proposta aprovada antes de qualquer schema |
| Texto estoura slot sem medir fonte real | QA falha só no render | orçamento de caracteres por linha e testes de limite; medição real só com a fonte decidida |
| Cota do Figma (seat View) | auditoria incompleta | orçamento fixo no VL-1; tratar o restante como UNKNOWN |

## Definition of done desta camada

- [ ] VL-2 a VL-5 mergeados pelo Fonseca, cada um com veredito PASS ligado ao SHA candidato.
- [ ] Workflows 06–09 sanitizados, sem nó de agente, conferidos contra a documentação do n8n.
- [ ] Job sintético percorre `INSIGHTS_RANKED` → `QA_PASSED` de forma idempotente, com proveniência completa.
- [ ] Nenhum dado real, PDF, saída de LLM ou ativo de marca sem direito no repo público.
