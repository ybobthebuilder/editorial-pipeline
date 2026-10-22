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
- [ ] **CP-VL1.4** Patch proposto dos SVGs: os 6 passam em parser XML estrito, cada slot tem `id`, gradiente não usado removido, decisão D-08 aplicada. *Progresso parcial (não commitado; D-04 proíbe marca no repo antes da decisão):* os 6 passam em parser XML estrito; o `text-anchor` duplicado foi resolvido mantendo `end`, que alinha o rótulo à régua em x=1004; o gradiente `halo` não usado foi removido. *Pendente:* `id` por slot (depende do mapa de slots, CP-VL1.5). D-08 está decidida e foi ajustada por U19 (2026-10-22): margem de 64 px e zona segura igual ao espaço restante; o erro estava na declaração de `templates.json`, não nos SVGs. Falta aplicá-la ao patch. Cópias de trabalho em `scratchpad/cp-vl14/`. *Verificar:* `python3 -I -c "import sys,xml.etree.ElementTree as E; [E.parse(f) for f in sys.argv[1:]]" *.svg` sem erro. *Tipo:* auto.
- [ ] **CP-VL1.5** Mapa de slots v0 gerado; cada slot existe no SVG correspondente (verificação automática por `id`). *Tipo:* auto.
- [ ] **CP-VL1.6** Nota de direitos e proveniência registrada. *Fecha:* D-04, U7. *Tipo:* humano.

## VL-2 — Validadores (Fase 2)

- [x] **CP-VL2.1** `validators/math.js` (`computeDeltas`): exemplo 84→92 dá `delta_absolute` 8 e `delta_relative` 9,52; base zero dá `null`; entrada não numérica lança `TypeError`. *Verificar:* `node --test 'validators/*.test.js'` → 11 de 11; 5 mutantes detectados. *Evidência:* branch `claude/validators-math`, commit `da1083e9dc2e4ccb765a1e7ba126743bc829ffb4` (sem PR, sem veredito de reviewer).
- [x] **CP-VL2.2** `contrast.js` reproduz a tabela CALCULATED de `contexto.md` §7.3 com tolerância de 0,005 (ex.: `--fg`/`--bg` = 15,67; `--accent`/`--bg` = 3,14), mais as âncoras 21:1 e 1:1. *Verificar:* `node --test 'validators/*.test.js'` → 17 de 17; 10 de 11 mutantes detectados (o 11º é equivalente: limiar 0,03928 × 0,04045, sem efeito em canais de 8 bits). *Fórmula:* `w3c/wcag`, `guidelines/terms/20/relative-luminance.html` e `contrast-ratio.html`, lidos em 2026-10-22 pelo repositório oficial no GitHub (`w3.org` está bloqueado no ambiente). *Evidência:* branch `claude/validators-contrast`, commit `dcb572140146af36505d5a1350c9bcfcbec6c664` (sem PR, sem veredito de reviewer).
- [x] **CP-VL2.3** `numbers.js`: número exibido que não aparece na evidência `VERIFIED` é reprovado; correspondência por número inteiro, nunca por substring (`8` não casa com `80`). Locale PT-BR, vírgula decimal (U10). *Verificar:* `node --test 'validators/*.test.js'` → 22 de 22 em `numbers.test.js`; 14 mutantes detectados. *Evidência:* PR #13, mesclada pelo Fonseca em `58feba5916fefc1063ed0c4d5258bef4b4c91326`. *Tipo:* auto.
- [x] **CP-VL2.4** `schema.js`: subconjunto de palavras-chave documentado; aceita todas as fixtures válidas e rejeita todas as inválidas; sem dependência externa; restrições do Code node do n8n Cloud conferidas. *Verificar:* `node --test 'validators/*.test.js'` → 26 de 26 no branch; 11 mutantes detectados; zero `require`/`import` em `schema.js`. *Restrição do Code node:* lista de módulos nativos (crypto, http, https, url, util, querystring, stream, zlib, os, buffer, timers, string_decoder, events, dns, net, tls, assert) e proibição de pacotes npm externos no n8n Cloud, **conferida pelo Fonseca a partir do trecho oficial que colou na sessão**. O assistente não conseguiu acessar a documentação (`docs.n8n.io` bloqueado; caminhos de `n8n-io/n8n-docs` retornaram 404). *Evidência:* branch `claude/validators-schema`, commit `759df316c9e30066c5de264deaae5a2c5dd65554` (sem PR, sem veredito de reviewer). *Tipo:* auto + humano.
- [ ] **CP-VL2.5** `geometry.js`: reprova slot desconhecido, excesso de linhas, excesso de caracteres, dimensão errada e conteúdo fora da zona segura; aprova o caso no limite. *Progresso parcial:* feito o que não depende de config: excesso de linhas, largura acima da zona segura (tela menos 64 px, U19), âncora fora da zona, limites verticais, caractere sem largura e o caso exato no limite. 31 de 31 testes; 35 mutantes detectados (33 do código e 2 da tabela de larguras). Faixas dos 9:16 (U23, 260 px em cima e 340 px embaixo): PR #26, aberta, 37 testes em `geometry.test.js`, 18 mutantes do código novo detectados. *Pendente:* slot desconhecido e dimensão errada do canvas, que dependem do mapa de slots como config (VL-4). As tabelas de larguras vêm de Liberation Sans e Mono, não de Arial e Courier New (U20). *Evidência:* PR #19, mesclada em `f9a87e3962073e9ec115da1733eebf07d43691eb`, candidato `cf050deb849ee0895062929e96ddcfc5667490da`. *Tipo:* auto.
- [x] **CP-VL2.6** Cada validador tem verificação por mutação registrada (mutantes introduzidos e detectados). *Evidência:* `math` 5; `contrast` 10 de 11 (1 equivalente); `schema` 11; `numbers` 14; `blocklist` 10 mais 24; `geometry` 35; contratos 290. Sem veredito de reviewer. *Tipo:* auto.
- [x] **CP-VL2.7** Uma única execução de `node --test` passa todos os testes dos validadores, sem dependências instaladas. *Evidência:* CI `validators` e `migrations` verdes no `main` em `0c99259bfc8ecd2cd142fc4814a59a2647a3409d` (GitHub Actions); na mesma árvore, `node --test 'validators/*.test.js'` dá 155 de 155 (rodado localmente). Desde a PR #21 o passo falha com teste quebrado (antes só conferia que havia testes). O CI instala `fonts-liberation` só para o teste que compara a tabela de larguras com as fontes. *Tipo:* auto.

## VL-3 — Contratos e prompts baseline (Fase 3)

- [x] **CP-VL3.1** Proposta de contratos (campos, enums fechados, proveniência obrigatória, referências `evidence_ids`) aprovada por digest. *Fecha:* U2, D-05. *Evidência:* aprovada pelo Fonseca em 2026-10-22; PR #15 mesclada em `2158352d364e7d25c4135e4b4dce2758bdc596ee`. *Tipo:* humano.
- [x] **CP-VL3.2** `visual_spec`, `cover_spec` e `qa_result` têm 2 fixtures válidas e 2 inválidas cada. *Verificar:* `node --test` com `schema.js`. *Evidência:* PR #20, mesclada em `7b059f8990af6275cc6a5e23a7968cef10e844a0`; `validators/contracts.test.js` com 24 testes. *Tipo:* auto.
- [x] **CP-VL3.3** Os schemas rejeitam valor fora do enum, ausência de qualquer campo de proveniência e `evidence_ids` ausente. *Evidência:* os 7 campos de proveniência testados nos 3 contratos; 290 de 290 mutantes dos schemas detectados. As regras que o schema não expressa estão fora dele de propósito e ainda sem validador de código. *Tipo:* auto.
- [ ] **CP-VL3.4** Prompts baseline 06, 07 e 09 versionados com hash; política de temperatura documentada (0, exceto headline); sem conteúdo privado. *Progresso parcial:* os prompts estão em `skills/` com `skills/.checksums`, conferidos por `verify-baseline --offline` no CI (PR #21, mesclada em `53c46b332e9a490cada6fdccdb78059ba0e2dfad`; lista ajustada nas PRs #23, mesclada, e #25, aberta); 16 de 16 testes de forma; nenhum teste roda contra um modelo. *Pendente:* a temperatura do copywriter segue UNKNOWN. Sobre "sem conteúdo privado": a lista de termos veio de uma planilha privada e é pública por decisão (D-14). *Tipo:* humano.
- [ ] **CP-VL3.5** O bloqueio de mídia clínica da v1 (D-15) é imposto por código, em duas camadas (U24): (a) o schema de `image_assets` restringe `provenance` a `generated_illustration` e `stock_licensed` por padrão; (b) o validador de negócio aceita `owned_photo` só com `human_approved: true` e justificativa, e recusa sempre a foto clínica (antes/depois, exame), com ou sem o flag. *Estado:* decidido, não implementado. *Bloqueado por fonte:* o contrato `image_assets` v0.1.0, o campo que identifica a foto clínica, os nomes e tipos do flag e da justificativa, e o contrato do repositório que recebe a restrição (U24). *Verificar:* teste que recusa cada categoria bloqueada, aceita as duas permitidas, recusa `owned_photo` sem o flag e sem justificativa, aceita `owned_photo` com os dois, e recusa a foto clínica mesmo com o flag. *Tipo:* auto + humano.

## VL-4 — Baseline visual

- [ ] **CP-VL4.1** `visual_library.json` valida contra o schema e contém exatamente os 6 identificadores de `templates.json` como lista fechada. *Tipo:* auto.
- [ ] **CP-VL4.2** `config/baseline/.checksums` gerado e conferido por script. *Tipo:* auto.
- [ ] **CP-VL4.3** Todo par de cores declarado passa em `contrast.js` no limiar do tamanho de texto aplicável; exceções explícitas (ex.: `--accent` sobre `--bg` só em texto grande). *Tipo:* auto.
- [ ] **CP-VL4.4** Decisão D-04 aplicada; varredura do CP-VL0.3 verde no estado final. *Situação:* D-04 decidida pelo Fonseca (SVGs fora do repo público, só no scratchpad). A entrada no repo depende de autorização explícita numa fase a confirmar (D-10). *Tipo:* auto + humano.

## VL-5 — Núcleo de render

- [ ] **CP-VL5.1** Mesma entrada produz SVG idêntico byte a byte. *Verificar:* teste compara hash SHA-256 de duas execuções. *Tipo:* auto.
- [ ] **CP-VL5.2** Saída em XML bem formado; `& < > " '` escapados em todos os slots (teste com `<script>` e `&`). *Tipo:* auto.
- [ ] **CP-VL5.3** Template desconhecido, slot ausente ou texto que estoura o orçamento são rejeitados antes de renderizar. *Tipo:* auto.
- [ ] **CP-VL5.4** Os 6 templates renderizam fixtures sintéticas; comparação visual com as referências aprovada por humano. *Tipo:* humano.
- [ ] **CP-VL5.5** D-03 decidida; se PNG, a engine foi verificada na documentação do n8n. *Fecha:* U4. *Tipo:* humano.

## VL-6 — Workflows n8n 06–09 (bloqueado pelas Fases 1 e 4)

- [ ] **CP-VL6.1** U1 decidida (`editorial.config_baseline`). U11-a a g respondidas e implementadas em `claude/migration-001` (16 testes contra Postgres 16.15 limpo). U11-h a U11-o respondidos em 2026-10-22; migrations 001 a 005 implementadas. Permanece [ ] até as PRs #6, #7 e #8 serem revisadas e mergeadas pelo Fonseca e a 005 ganhar PR. *Tipo:* humano.
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
| `geometry.js` | unitário | todos os checks, no limite e além | `post-02-metrica` com 4 linhas reprova (máx. 3, pelo `maxLines` do slot); linha mais larga que a zona segura de 64 px reprova; âncora a menos de 64 px da borda reprova. Pendentes: template 1080×1350 recebendo 1080×1080; faixas de 9:16 (U23) |
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
| 2026-10-22 | CP-VL6.1 (parcial) | passou: 16 de 16 testes da migração em Postgres 16.15 limpo; 9 mutantes de comportamento detectados e 1 equivalente | commit `3276ff2c0b41871348095d683d0d2aae9ffeb570` | implementer (sem review) |
| 2026-10-22 | lacuna `require` | passou: teste de ausência de `require` e `import` em math.js e contrast.js; mutante com `require` detectado | commits `198c75e6dc627b68acaf6669b2da61506362d542` e `d6bf5de1bf751b5cec87a5d46a9019d6f7a34ccf` | implementer (sem review) |
| 2026-10-22 | CP-VL6.1 (gate) | passou: 19 de 19 testes; `requires_gate` só em AWAITING_APPROVAL → HUMAN_APPROVED, recusado pelo guard (falha fechada); 3 mutantes detectados | commit `1a91b7b0a68f7b4122fdbfe290ee67570266b699` | implementer (sem review) |
| 2026-10-22 | CP-VL6.1 (jobs, assinaturas, rebobinamento) | passou: 17 de 17 testes da 002; 36 de 36 com a 001; 8 mutantes da 002 detectados | `0329c4c` | implementer (sem review) |
| 2026-10-22 | governança (CLAUDE.md, PUBLIC_PRIVATE) | PR #5 aberta, sem veredito | `c41a9eb88` | implementer (sem review) |
| 2026-10-22 | CP-VL6.1 (003: saída de NEEDS_REVIEW, proveniência, human_reviewer) | passou: 22 de 22 na 003; 62 de 62 no conjunto; 11 mutantes detectados | `cc4ca36` | implementer (sem review) |
| 2026-10-22 | CP-VL6.1 (004: set_status, mark_running) | passou: 13 de 13 na 004; 76 de 76 no conjunto; 11 mutantes detectados, inclusive o bloqueio de linha | `73e91e5` | implementer (sem review) |
| 2026-10-22 | CP-VL6.1 (005: índices CONCURRENTLY) | passou: 5 de 5; 82 de 82 no conjunto; 4 mutantes detectados | `51c65df` | implementer (sem review) |
| 2026-10-22 | rollbacks (001 a 005) | passou: subir, descer e subir restaura o catálogo idêntico; 3 mutantes dos scripts detectados | `5779311` | implementer (sem review) |
| 2026-10-22 | PRs abertas: #6 (001+002), #7 (003, base #6), #8 (004, base #7); #5 atualizada (`733b06a`) | sem veredito; aguardam revisão do Fonseca | — | — |
| 2026-10-22 | PRs #5, #6, #7, #8 mergeadas pelo Fonseca; #7 e #8 entraram em branches da pilha, não no `main` | consolidação aberta como #9 (003 e 004); #10 (005) | `c42c08f`, `51c65df` | — |
| 2026-10-22 | CP-VL6.1 (006: editorial_owner, create_job) | passou: 12 de 12; 94 de 94 no conjunto; 9 mutantes e 1 do rollback detectados | `35e2e09` | implementer (sem review) |
| 2026-10-22 | seed-baseline e verify-baseline | passou: 12 de 12; 10 de 11 mutantes detectados (o 11º é equivalente) | `6b4ba6c` | implementer (sem review) |
| 2026-10-22 | CI de migrations | YAML conferido; passo exato simulado: 106 de 106; execução vazia falha. Não rodou no GitHub Actions | `26f2023` | implementer (sem review) |
| 2026-10-22 | PRs abertas: #11 (006, scripts, CI), #12 (STAGES.md e CLAUDE.md) | sem veredito; aguardam revisão do Fonseca | `26f2023`, `e9050bf` | — |
| 2026-10-22 | PRs #9, #10, #11, #12 mergeadas pelo Fonseca; `main` em `5ea6f4f` | CI `migrations` rodou no GitHub: 4 execuções com sucesso; no `main`, `# tests 106`, `# pass 106`, `# fail 0`, 0 `not ok` (log do job 119763003883). **Fase 1 fechada** | `5ea6f4f` | Fonseca (merge) |
| 2026-10-22 | CP-VL2.6 `numbers.js` | passou: 22 de 22; 78 de 78 com os outros validadores; 14 mutantes detectados | `7953395` | implementer (sem review) |
| 2026-10-22 | unificação dos validadores (math, contrast, schema, CI) | merges limpos sobre o `main`; 56 de 56 antes de `numbers.js`, 78 de 78 depois. PR #13 aberta, sem veredito | `7953395` | — |
| 2026-10-22 | CP-VL3.1 proposta de contratos | escrita (`contracts-proposal.md`); aguarda aprovação por digest; nenhum schema criado | digest no commit seguinte | — |
| 2026-10-22 | rascunhos de `SKILL.md` (06, 07, 09) | PR #14 em rascunho; 13 de 13 testes de forma; sem veredito | `035d5bc` | — |
| 2026-10-22 | PR #13 (validadores, `numbers.js`) mergeada pelo Fonseca; `main` em `58feba5` | CI de validadores ativo no `main` | `58feba5` | Fonseca (merge) |
| 2026-10-22 | decisões do Fonseca: D-05 sim; `CLAUDE.md` §2 prevalece (D-11); `skills/` é a fonte do prompt (D-12); seguir as recomendações PROPOSED de U3 e U12 a U17 | aplicadas em `contracts-proposal.md` e `slot-map-v0.md` (CP-VL1.5 proposto, não aprovado); abertas U18 a U22 | `3bf9c92` | — |
| 2026-10-22 | PRs #14, #16, #17 e #18 mescladas pelo Fonseca (rascunhos de skills, `blocklist.js`, seed de prompts, governança dos skills) | `main` em `ea2c26edde67c756472385537aeb0982aa240241` | `4f857af81484cc36c2a0bde9d8e7840877ca0153`, `5550a8f93dba5ba22b0c78935e9412a1f2a15b53`, `f249f993b29b320dcba61e1c8f0c1f007940ceec`, `ea2c26edde67c756472385537aeb0982aa240241` | Fonseca (merge) |
| 2026-10-22 | PR #15 (documentos desta camada, proposta de contratos, mapa de slots v0) mesclada | `main` em `2158352d364e7d25c4135e4b4dce2758bdc596ee`. Proposta de contratos aprovada | `2158352d364e7d25c4135e4b4dce2758bdc596ee` | Fonseca (merge) |
| 2026-10-22 | CP-VL2.5 (parcial) `geometry.js`, com U19 e U20 | passou: 31 de 31 testes; 35 mutantes detectados (33 do código e 2 da tabela). Larguras de Liberation Sans e Mono, cruzadas com Helvetica/AFM (185 de 190 iguais). PR #19 mesclada | candidato `cf050deb849ee0895062929e96ddcfc5667490da`; merge `f9a87e3962073e9ec115da1733eebf07d43691eb` | implementer (sem review); Fonseca (merge) |
| 2026-10-22 | CP-VL3.2 e CP-VL3.3 contratos | passou: 24 testes; 290 de 290 mutantes detectados. PR #20 mesclada | candidato `e58d6a19d6c2495fb306fe691ba271524fbc4f96`; merge `7b059f8990af6275cc6a5e23a7968cef10e844a0` | implementer (sem review); Fonseca (merge) |
| 2026-10-22 | U22 lista do CFM, skills v0.1, CI de validadores | lista v0.1 com 10 termos; 16 de 16 testes de skills; 24 mutantes novos detectados. O passo `validators` do CI não falhava com teste quebrado (sem `pipefail` e sem o `grep` de `# fail 0`): corrigido. PR #21 mesclada | candidato `2d452d9d12ced1e074aa1eb402f0dd8750af2cd8`; merge `53c46b332e9a490cada6fdccdb78059ba0e2dfad` | implementer (sem review); Fonseca (merge) |
| 2026-10-22 | decisões do Fonseca: U19 (margem de 64 px), U20 (Arial e Courier New em design-time), U22 (lista do CFM), D-13 (sem `100%` isolado), D-14 (lista pública), D-15 (bloqueio de mídia clínica na v1) | registradas em `contexto.md` §10 e §11; abertas U23 e U24; U18 e U21 seguem abertas | esta PR | — |
| 2026-10-22 | PR #22 (linha A5 do `skills/README.md`) | aprovada pelo Fonseca, que informou o merge; na consulta de 2026-10-22 o GitHub ainda a mostrava aberta (`merged: false`) e o `main` não a continha | candidato `ccd4851ac724399adb57f4582131bb0148f67889` | — |
| 2026-10-22 | PR #23 (`100%` fora da lista, D-13) | aberta, sem veredito: 155 testes de validadores, 16 de skills, 14 mutantes detectados. Deixa `100% eficaz` fora da lista (lacuna) | candidato `39a4c87185bc67d52b66a26e720b3f19eeb41e3c` | implementer (sem review) |
| 2026-10-22 | PRs #22, #23 e #24 mescladas pelo Fonseca (linha A5; `100%` isolado fora da lista; documentação U19 a U22) | CI `validators` e `migrations` verdes no `main` em `0c99259bfc8ecd2cd142fc4814a59a2647a3409d`; 155 de 155 testes de validadores e 16 de 16 de skills (local). A #22 constava como aberta numa consulta anterior; o merge veio depois, como o Fonseca informou | `51478fa7b2fc6c426271a96b2bb25d507622441f`, `369415fdd083a721426d9caa38edd7f8fab778f4`, `0c99259bfc8ecd2cd142fc4814a59a2647a3409d` | Fonseca (merge) |
| 2026-10-22 | decisões do Fonseca: `100% eficaz` na lista (D-13 ampliado); U23 (faixas de 9:16 valem); U24 (bloqueio em duas camadas); U18 (rodapé do CFM); U21 (`format` no payload de `request_received`, contrato H1) | registradas em `contexto.md` §10 e §11. U21 fica com ressalva (estado e contrato H1 não verificáveis) e U24 sem implementação (faltam fontes) | esta PR | — |
| 2026-10-22 | PR #25 (`100% eficaz` na `cfm_blocklist`) | aberta, sem veredito: 156 testes de validadores, 16 de skills, `verify-baseline --offline` conferido, 4 mutantes detectados | candidato `878812a3f5034b2442e707494d68a3e1b1484fc4` | implementer (sem review) |
| 2026-10-22 | PR #26 (faixas de 260 e 340 px dos 9:16 em `geometry.js`, U23) | aberta, sem veredito: 161 testes de validadores, 18 mutantes detectados | candidato `3b4ceed145ddedc04f27e8472ef51cbeae38732d` | implementer (sem review) |
| 2026-10-22 | migration 008: `editorial.image_approvals` e `get_image_approvals(job_id)` (aprovação humana de imagem como registro, decisão do Fonseca) | passou: 166 de 166 testes de banco e scripts; 53 mutantes, 52 detectados e 1 equivalente | esta PR | — |
