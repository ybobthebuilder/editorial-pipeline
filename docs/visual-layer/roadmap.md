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
| VL-2 | validadores: `math` ✔, `contrast` ✔, `schema` ✔, `numbers` ✔, `blocklist` ✔, `geometry` ✔ (parcial) | 2 | — | parcial: seis validadores mesclados (PRs #13, #16, #19). `geometry` mede largura, linhas e zona segura de 64 px, mas ainda não conhece slot nem template; isso depende do mapa de slots como config (VL-4) |
| VL-3 | contratos `visual_spec`, `cover_spec`, `qa_result` e prompts baseline | 3 | VL-0, VL-2 (`schema`) | contratos e fixtures mesclados (PR #20); prompts em `skills/` na v0.1 mesclados (PR #21). Faltam o rodapé do CFM (U18), a temperatura do copywriter e o bloqueio de mídia clínica (D-15, CP-VL3.5) |
| VL-4 | baseline `visual_library` e checksums | 3 | VL-1, VL-3, D-04 | **próximo item.** U3 decidido; faltam U7 (direitos do pacote de marca), U18 e o patch dos SVGs (D-06) |
| VL-5 | núcleo de render em código puro | 8 | VL-3, VL-4 | não iniciado; depende do VL-4 |
| VL-6 | workflows n8n 06–09 e cartões de etapa | 4, 7, 8 | VL-5 e Fases 1 e 4 | **Fase 1 fechada** (migrations 001 a 006, scripts de baseline e CI no `main`, CI verde no GitHub com 106 testes). Faltam a Fase 4 (infra n8n) e VL-5 |
| VL-7 | integração sintética 06 → 09 | 9 (parcial) | VL-6 | bloqueado |

**Caminho crítico:** VL-0 → VL-3 → VL-4 → VL-5 → VL-6 → VL-7. **Em paralelo:** VL-1 e VL-2 (não dependem do banco). **Fase 1 fechada em 2026-10-22.** A proposta de contratos foi aprovada e os schemas estão mesclados (PR #20); o bloqueio agora é o VL-4 (U7, U18 e o patch dos SVGs). U1 foi decidido em 2026-10-22 (`editorial.config_baseline`).

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
  3. `numbers.js` ✔ — extrai tokens numéricos e verifica que cada número exibido na capa aparece nas evidências `VERIFIED` citadas; formato PT-BR decidido (U10); 22 testes, 14 mutantes detectados (PR #13).
  4. `schema.js` ✔ — validador de JSON Schema em subconjunto documentado, sem módulos importados (o Code node do n8n Cloud só aceita módulos nativos, conforme trecho conferido pelo Fonseca); falha fechado para palavra-chave desconhecida e `$ref`; branch `claude/validators-schema`, 26 testes e 11 de 11 mutantes detectados. O subconjunto poderá ser ampliado em VL-3 se o contrato exigir.
  5. `geometry.js` ✔ (parcial) — PR #19: mede a largura do texto com tabela de avanços (Arial e Courier New, U20), recusa linhas em excesso, texto fora da zona segura (tela menos 64 px, U19) e caractere sem largura; 31 testes, 35 mutantes detectados. Falta o que depende do mapa de slots como config: slot desconhecido e dimensão do canvas.
  6. `blocklist.js` ✔ — gate `QA-CFM`: acha termo proibido por palavra ou expressão inteira, sem distinguir maiúsculas nem acentos (PR #16). A lista é dado de config (`cfm_blocklist`), não literal no código.
- **Fora desta fase:** validação de faixa de `math` (depende de U5) e `citation.js` (é do `03_VERIFY`).
- **Aceite:** CP-VL2.1 a CP-VL2.7.

## VL-3 — Contratos e prompts baseline (Fase 3)

- **Objetivo:** contratos JSON Schema dos três artefatos desta camada.
- **Passo 1 (bloqueante):** **proposta de contratos** em documento (campos, enums fechados, campos de proveniência obrigatórios, referências `evidence_ids`), revisada por digest e aprovada. Sem isso, nenhum schema é escrito (U2). **Feito:** aprovada pelo Fonseca em 2026-10-22 (PR #15).
- **Passo 2:** `contracts/visual_spec.schema.json`, `cover_spec.schema.json`, `qa_result.schema.json` + fixtures sintéticas (2 válidas e 2 inválidas por contrato) em `fixtures/synthetic/`. **Feito:** PR #20 (24 testes, 290 mutantes detectados); as fixtures ficaram em `fixtures/synthetic/contracts/`.
- **Passo 3:** os prompts vivem em `skills/<nome>/SKILL.md` (D-12), com `skills/.checksums`, e a lista de termos em `config/baseline/cfm_blocklist.json`. **Feito (v0.1):** PRs #14, #17 e #21, mescladas. A PR #23 (sem o `100%` isolado, D-13) está aberta. Nenhum teste roda contra um modelo; a temperatura do copywriter segue UNKNOWN.
- **Passo 4 (PROPOSED):** impor por código e teste o bloqueio de mídia clínica da v1 (D-15). O local é UNKNOWN (U24).
- **Aceite:** CP-VL3.1 a CP-VL3.5.

## VL-4 — Baseline visual

- **Objetivo:** `config/baseline/visual_library.json` (lista fechada de gramáticas, tamanhos, mapa de slots, tokens, zonas seguras, pares de cor permitidos) e `.checksums`.
- **Pré-condições:** mapa de slots do VL-1, schema do VL-3 e decisão D-04. D-04 está decidida: os SVGs ficam fora do repo público, só no scratchpad, até autorização explícita do Fonseca no marco VL-4 (D-10, decidido em 2026-10-22).
- **Zonas seguras:** `templates.json` declara zonas que a resposta a U19 apontou como erradas (erro na declaração, não nos SVGs). O `visual_library` carrega as corrigidas: margem de 64 px, com a dúvida das faixas de 9:16 em U23.
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
| Mídia clínica entra sem bloqueio (D-15 sem código) | foto de paciente em peça publicada | CP-VL3.5; até lá, nada no repositório impõe o bloqueio |
| A lista de termos só pega a forma exata | variações passam (`curar`, `100% eficaz`) | decisão de ampliar a lista; o prompt pede ao modelo que evite; o juiz semântico do `09_QA` cobre o resto |

## Definition of done desta camada

- [ ] VL-2 a VL-5 mergeados pelo Fonseca, cada um com veredito PASS ligado ao SHA candidato.
- [ ] Workflows 06–09 sanitizados, sem nó de agente, conferidos contra a documentação do n8n.
- [ ] Job sintético percorre `INSIGHTS_RANKED` → `QA_PASSED` de forma idempotente, com proveniência completa.
- [ ] Nenhum dado real, PDF, saída de LLM ou ativo de marca sem direito no repo público.
