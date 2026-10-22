# Checkpoints — Camada visual (estágios 06–09)

> Proposta para revisão (**PROPOSED**). Retome sempre do primeiro `[ ]`. Antes de executar, rode a verificação do checkpoint anterior.
> Formato: **CP-VLx.y** — afirmação. *Verificar:* comando ou método. *Evidência:* onde fica. Tipo `auto` (comando) ou `humano` (revisão do Fonseca ou do reviewer).
> Comando de teste hoje verificado: `node --test 'validators/*.test.js'` (Node 22; passar o diretório sozinho falha).

## VL-0 — Alinhamento

- [ ] **CP-VL0.1** Os 3 documentos foram revisados por digest SHA-256 (`reviewed_commit_sha = null`) e há resposta do Fonseca registrada. *Verificar:* `sha256sum docs/visual-layer/*.md` conferido contra o digest citado no PR. *Tipo:* humano.
- [ ] **CP-VL0.2** D-01 a D-09 estão decididas, ou adiadas de forma explícita com responsável. *Verificar:* tabela em `contexto.md` §11 atualizada. *Tipo:* humano.
- [ ] **CP-VL0.3** O diff do PR não contém dado privado nem ativo de marca. *Verificar:* `git diff --name-only origin/main...HEAD` lista só `docs/visual-layer/*`; `grep -rEn "BEGIN [A-Z ]*PRIVATE KEY|api[_-]?key *[:=] *['\"][^'\"]{8,}" docs/` sem resultado. *Tipo:* auto.

## VL-1 — Design-time: auditoria (somente leitura)

- [ ] **CP-VL1.1** Teto de leituras do Figma fixado e registrado antes de começar. *Evidência:* nota no PR do VL-1. *Tipo:* humano.
- [ ] **CP-VL1.2** Tokens do Figma × `tokens.css` reconciliados em tabela (token, valor no Figma, valor no CSS), sem divergência sem explicação. *Tipo:* humano.
- [ ] **CP-VL1.3** `02 • Components` e `03 • Social templates` inventariadas (nome, tamanho) e comparadas com os 6 templates. *Tipo:* humano.
- [ ] **CP-VL1.4** Patch proposto dos SVGs: os 6 passam em parser XML estrito, cada slot tem `id`, gradiente não usado removido, decisão D-08 aplicada. *Progresso parcial (não commitado; D-04 proíbe marca no repo antes da decisão):* os 6 passam em parser XML estrito; o `text-anchor` duplicado foi resolvido mantendo `end`, que alinha o rótulo à régua em x=1004; o gradiente `halo` não usado foi removido. *Pendente:* `id` por slot (depende do mapa de slots, CP-VL1.5) e decisão D-08. Cópias de trabalho em `scratchpad/cp-vl14/`. *Verificar:* `python3 -I -c "import sys,xml.etree.ElementTree as E; [E.parse(f) for f in sys.argv[1:]]" *.svg` sem erro. *Tipo:* auto.
- [ ] **CP-VL1.5** Mapa de slots v0 gerado; cada slot existe no SVG correspondente (verificação automática por `id`). *Tipo:* auto.
- [ ] **CP-VL1.6** Nota de direitos e proveniência registrada. *Fecha:* D-04, U7. *Tipo:* humano.

## VL-2 — Validadores (Fase 2)

- [x] **CP-VL2.1** `validators/math.js` (`computeDeltas`): exemplo 84→92 dá `delta_absolute` 8 e `delta_relative` 9,52; base zero dá `null`; entrada não numérica lança `TypeError`. *Verificar:* `node --test 'validators/*.test.js'` → 11 de 11; 5 mutantes detectados. *Evidência:* branch `claude/validators-math`, commit `da1083e9dc2e4ccb765a1e7ba126743bc829ffb4` (sem PR, sem veredito de reviewer).
- [x] **CP-VL2.2** `contrast.js` reproduz a tabela CALCULATED de `contexto.md` §7.3 com tolerância de 0,005 (ex.: `--fg`/`--bg` = 15,67; `--accent`/`--bg` = 3,14), mais as âncoras 21:1 e 1:1. *Verificar:* `node --test 'validators/*.test.js'` → 17 de 17; 10 de 11 mutantes detectados (o 11º é equivalente: limiar 0,03928 × 0,04045, sem efeito em canais de 8 bits). *Fórmula:* `w3c/wcag`, `guidelines/terms/20/relative-luminance.html` e `contrast-ratio.html`, lidos em 2026-10-22 pelo repositório oficial no GitHub (`w3.org` está bloqueado no ambiente). *Evidência:* branch `claude/validators-contrast`, commit `dcb572140146af36505d5a1350c9bcfcbec6c664` (sem PR, sem veredito de reviewer).
- [ ] **CP-VL2.3** `numbers.js`: número exibido que não aparece na evidência `VERIFIED` é reprovado; correspondência por número inteiro, nunca por substring (`8` não casa com `80`). Regra de locale decidida (U10). *Tipo:* auto.
- [x] **CP-VL2.4** `schema.js`: subconjunto de palavras-chave documentado; aceita todas as fixtures válidas e rejeita todas as inválidas; sem dependência externa; restrições do Code node do n8n Cloud conferidas. *Verificar:* `node --test 'validators/*.test.js'` → 26 de 26 no branch; 11 mutantes detectados; zero `require`/`import` em `schema.js`. *Restrição do Code node:* lista de módulos nativos (crypto, http, https, url, util, querystring, stream, zlib, os, buffer, timers, string_decoder, events, dns, net, tls, assert) e proibição de pacotes npm externos no n8n Cloud, **conferida pelo Fonseca a partir do trecho oficial que colou na sessão**. O assistente não conseguiu acessar a documentação (`docs.n8n.io` bloqueado; caminhos de `n8n-io/n8n-docs` retornaram 404). *Evidência:* branch `claude/validators-schema`, commit `759df316c9e30066c5de264deaae5a2c5dd65554` (sem PR, sem veredito de reviewer). *Tipo:* auto + humano.
- [ ] **CP-VL2.5** `geometry.js`: reprova slot desconhecido, excesso de linhas, excesso de caracteres, dimensão errada e conteúdo fora da zona segura; aprova o caso no limite. *Tipo:* auto.
- [ ] **CP-VL2.6** Cada validador tem verificação por mutação registrada (mutantes introduzidos e detectados). *Evidência:* nota no PR. *Tipo:* auto.
- [ ] **CP-VL2.7** Uma única execução de `node --test` passa todos os testes dos validadores, sem dependências instaladas. *Tipo:* auto.

## VL-3 — Contratos e prompts baseline (Fase 3)

- [ ] **CP-VL3.1** Proposta de contratos (campos, enums fechados, proveniência obrigatória, referências `evidence_ids`) aprovada por digest. *Fecha:* U2, D-05. *Tipo:* humano.
- [ ] **CP-VL3.2** `visual_spec`, `cover_spec` e `qa_result` têm 2 fixtures válidas e 2 inválidas cada. *Verificar:* `node --test` com `schema.js`. *Tipo:* auto.
- [ ] **CP-VL3.3** Os schemas rejeitam valor fora do enum, ausência de qualquer campo de proveniência e `evidence_ids` ausente. *Tipo:* auto.
- [ ] **CP-VL3.4** Prompts baseline 06, 07 e 09 versionados com hash; política de temperatura documentada (0, exceto headline); sem conteúdo privado. *Tipo:* humano.

## VL-4 — Baseline visual

- [ ] **CP-VL4.1** `visual_library.json` valida contra o schema e contém exatamente os 6 identificadores de `templates.json` como lista fechada. *Tipo:* auto.
- [ ] **CP-VL4.2** `config/baseline/.checksums` gerado e conferido por script. *Tipo:* auto.
- [ ] **CP-VL4.3** Todo par de cores declarado passa em `contrast.js` no limiar do tamanho de texto aplicável; exceções explícitas (ex.: `--accent` sobre `--bg` só em texto grande). *Tipo:* auto.
- [ ] **CP-VL4.4** Decisão D-04 aplicada; varredura do CP-VL0.3 verde no estado final. *Tipo:* auto + humano.

## VL-5 — Núcleo de render

- [ ] **CP-VL5.1** Mesma entrada produz SVG idêntico byte a byte. *Verificar:* teste compara hash SHA-256 de duas execuções. *Tipo:* auto.
- [ ] **CP-VL5.2** Saída em XML bem formado; `& < > " '` escapados em todos os slots (teste com `<script>` e `&`). *Tipo:* auto.
- [ ] **CP-VL5.3** Template desconhecido, slot ausente ou texto que estoura o orçamento são rejeitados antes de renderizar. *Tipo:* auto.
- [ ] **CP-VL5.4** Os 6 templates renderizam fixtures sintéticas; comparação visual com as referências aprovada por humano. *Tipo:* humano.
- [ ] **CP-VL5.5** D-03 decidida; se PNG, a engine foi verificada na documentação do n8n. *Fecha:* U4. *Tipo:* humano.

## VL-6 — Workflows n8n 06–09 (bloqueado pelas Fases 1 e 4)

- [ ] **CP-VL6.1** U1 decidida (`editorial.config_baseline`), U11 resolvida e funções do `CLAUDE.md` §5 existentes nas migrations. *Tipo:* humano.
- [ ] **CP-VL6.2** Cartões de etapa 06–09 no formato de `STAGES.md` §7, revisados. *Tipo:* humano.
- [ ] **CP-VL6.3** Workflows seguem o `_TEMPLATE_STAGE`, estão sanitizados (sem credential ID, `pinData` ou URL privada) e cada parâmetro de nó foi conferido em docs.n8n.io. *Verificar:* `sanitize-workflow --check` (Fase 4). *Tipo:* auto + humano.
- [ ] **CP-VL6.4** Nenhum nó de agente; LLM só em Basic LLM Chain ou Information Extractor com Structured Output Parser; temperatura 0, exceto headline. *Tipo:* auto.
- [ ] **CP-VL6.5** Persistência idempotente por `(job_id, stage)` e proveniência completa em toda linha. *Tipo:* auto.

## VL-7 — Integração sintética

- [ ] **CP-VL7.1** Job sintético percorre `INSIGHTS_RANKED` → `QA_PASSED` apenas por transições aceitas por `guard_transition()`. *Fecha:* U9. *Tipo:* auto.
- [ ] **CP-VL7.2** Cada estágio executado duas vezes não duplica linhas. *Tipo:* auto.
- [ ] **CP-VL7.3** Falhas injetadas levam a `RENDER_FAILED`, `QA_FAILED` e `NEEDS_REVIEW` (rebobina) como previsto. *Tipo:* auto.
- [ ] **CP-VL7.4** Nenhum dado real, PDF ou saída de LLM no repo; fixtures só em `fixtures/synthetic/`. *Tipo:* auto.

---

# Plano de testes (`engineering:testing-strategy`)

Pirâmide com base determinística. Saída de LLM não se testa por texto exato, e sim pelos validadores sobre a saída. **Todas as metas são PROPOSED.**

| Área | Tipo | Meta | Casos de exemplo |
| --- | --- | --- | --- |
| `math.js` | unitário | já coberto (11 testes) | 84→92 = 8 e 9,52; base zero = `null`; `-0` normalizado |
| `contrast.js` | unitário | 100% dos pares do baseline | `--fg`/`--bg` 15,67 aprova; `--accent`/`--bg` 3,14 aprova só texto grande; `--border`/`--bg` 1,93 reprova como texto |
| `numbers.js` | unitário | 100% dos formatos aceitos | número da capa ausente na evidência reprova; `8` não casa com `80`; formato de locale conforme U10 |
| `schema.js` | unitário + contrato | todas as palavras-chave do subconjunto, caso válido e inválido | `enum` fora da lista; campo obrigatório ausente; propriedade extra |
| `geometry.js` | unitário | todos os checks, no limite e além | `post-02-metrica` com 4 linhas reprova (máx. 3); `reel-02-overlay` com texto em y 1650 reprova (faixa 380–1600); template 1080×1350 recebendo 1080×1080 reprova |
| Contratos | contrato | 2 válidas e 2 inválidas por contrato | proveniência ausente; `config_source` fora de `public`/`private`; `evidence_ids` vazio |
| `renderCover` | snapshot | 6 templates | mesma entrada, mesmo hash; `<script>` e `&` escapados; XML estrito aprovado |
| Workflows | integração (Postgres limpo) | os 4 estágios | guard recusa estado errado; reexecução idempotente; erro fatal move para `NEEDS_REVIEW` |
| Ponta a ponta | E2E sintético | 1 job completo | `INSIGHTS_RANKED` → `QA_PASSED` com proveniência |
| Visual | humano | 1 revisão por template | texto sem corte, sem sobreposição, contraste legível |

**Metas gerais:** todo validador com teste e verificação por mutação; toda regra do `ALUCINAÇÃO_GUARD.md` §7 com ao menos um caso de reprovação.

**Lacunas conhecidas**

1. Medição real de texto exige a fonte final; até lá vale orçamento de caracteres por linha.
2. O `node:test` não traz parser XML; a verificação de XML bem formado no CI precisa de decisão sobre ferramenta (D-07).
3. Não há ambiente de n8n Cloud para teste automatizado de workflows no repo hoje.
4. Saídas de LLM são não determinísticas; só os invariantes são testáveis.
5. VL-6 e VL-7 não podem ser testados antes da Fase 1 (U11) e da Fase 4.

---

# Log de execução

| Data | CP | Resultado | Evidência | Quem |
| --- | --- | --- | --- | --- |
| 2026-10-22 | CP-VL2.1 | passou: 11 de 11 testes, 5 mutantes detectados | commit `da1083e9dc2e4ccb765a1e7ba126743bc829ffb4` | implementer (sem review) |
| 2026-10-22 | CP-VL2.2 | passou: 17 de 17 testes, 10 de 11 mutantes detectados (1 equivalente) | commit `dcb572140146af36505d5a1350c9bcfcbec6c664` | implementer (sem review) |
| 2026-10-22 | CP-VL2.4 | passou: 26 de 26 testes, 11 de 11 mutantes detectados; restrição do Code node conferida pelo Fonseca | commit `759df316c9e30066c5de264deaae5a2c5dd65554` | implementer (sem review) |
