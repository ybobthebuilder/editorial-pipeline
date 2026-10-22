# skills/ — manuais dos estágios com LLM (v0.1)

> **Versão v0.1.** O `seed-baseline --skills` leva o corpo de cada arquivo para `config_baseline`, e `skills/.checksums` lista os hashes. **Nenhum teste roda contra um modelo de linguagem**, então o comportamento dos prompts não foi medido. Os testes que existem são determinísticos: forma, checksums e coerência dos `SKILL.md` (`tests/skills`) e o conferidor de termos, com a lista real (`validators/blocklist.test.js`). Escopo: estágios 06, 07 e 09 da camada visual.
>
> O status mora neste README, não nos `SKILL.md`: o corpo de cada arquivo é o prompt que o modelo recebe.

Cada `SKILL.md` é o **prompt de sistema e a fronteira** de um único nó de LLM do n8n: o que o nó pode e não pode fazer, o formato JSON de entrada e de saída, e o porquê de cada regra. Não é código executável e não é um agente.

## Formato

- Frontmatter com `name` e `description` apenas.
- Corpo em PT-BR, no imperativo, com o motivo de cada regra, bem abaixo de 500 linhas.
- **Sem `tools` e sem `model` no frontmatter.** O n8n não interpreta esses campos, e em runtime não há ferramentas (`CLAUDE.md` §2).
- Não verifiquei contra a documentação da Anthropic o que foi dito sobre formato de Skills e de subagentes (campos do frontmatter, limite de 500 linhas, descrição "insistente"). Os arquivos só usam o mínimo comum, `name` e `description`, e não dependem do resto.

## O que há nesta versão

| Arquivo | Estágio | O que o LLM faz | O que o código faz |
| --- | --- | --- | --- |
| `art-director` | 06_VISUAL | escolhe `grammar_id` numa lista fechada | valida o enum, define template e cores |
| `copywriter-cfm` | 07_COVERS | escreve o texto dos slots `claim` e o `alt_text` | limites de linha, números (`numbers.js`), termos proibidos |
| `qa-validator` | 09_QA | só o juízo semântico | geometria, contraste, números, enums e o `passed` final |

## O que não foi escrito, e por quê

Da lista A1–A7 enviada em 2026-10-22:

| Agente | Situação |
| --- | --- |
| A1 `brief-researcher` | **Não escrito.** Recuperar PMID ou DOI por busca exige ferramenta de rede e confia no modelo para produzir identificadores. Em `CLAUDE.md`, as afirmações vêm do PDF no `02_EXTRACT`, o `03_VERIFY` as confere por código e identificador inventado é a alucinação que o §8 proíbe. Não há estágio atual para ele. |
| A2 `science-reviewer` | **Não escrito.** O papel mais próximo é o `03_VERIFY` (`prompt.03_verify`), fora do escopo da camada visual e já coberto por validação de código (`citation.js`). |
| A5 | **Não escrito.** O papel nunca foi descrito na lista A1–A7 recebida; sem definição não há o que escrever. |
| A6 `figma-builder` | **Não escrito.** O render é código (`08_RENDER`, sem LLM). Escrita no Figma em runtime está fora do escopo (`roadmap.md`) e o seat atual é View. |

## Conflitos com o `CLAUDE.md`: decididos em 2026-10-22 (Fonseca)

1. **Subagentes com ferramentas × "Nenhum AI Agent" (`CLAUDE.md` §2): o `CLAUDE.md` prevalece (D-11).** Não há subagentes autônomos em runtime. Os `SKILL.md` são prompts de sistema de nós de LLM do n8n, sem ferramentas; o n8n faz o roteamento e a execução. Só se escreve o que o escopo determinístico permite.
2. **Duas fontes para o mesmo prompt: `skills/` é a fonte única da verdade (D-12).** O `seed-baseline` leva o texto para `config_baseline` nas chaves `prompt.06_visual`, `prompt.07_covers` e `prompt.09_qa` (o n8n Cloud não lê arquivos do repositório). O `seed-baseline --skills` já faz isso (PR #17); o `content` é `{ name, description, body }`. O `prompts/baseline/` do `CLAUDE.md` fica sem uso e precisa de ajuste de governança.
3. **D-05 (CFM): o CFM se aplica.** A lista de termos é dado de config (`config/baseline/cfm_blocklist.json`, chave `cfm_blocklist`); `validators/blocklist.js` só decide *como* achar um termo. A lista v0.1, de 10 termos, foi fornecida pelo Fonseca em 2026-10-22 (U22), vem de uma planilha privada dele e aparece, igual, no exemplo de entrada de `copywriter-cfm`; um teste garante que as duas cópias não divergem. **Continua UNKNOWN** a fonte da regra do CFM: nenhuma afirmação regulatória foi verificada por mim. O conferidor acha só a forma escrita ("cura" não pega "curar" nem "curas"); variações só entram se forem acrescentadas à lista.
4. **Quem escolhe o template (seguido por decisão de seguir as recomendações PROPOSED).** Aqui o LLM só escolhe a gramática; o template sai dela por mapeamento na config. Na descrição de A4 o agente também escolhia componentes e tokens de cor. Mantive cores e template fora do modelo para que os pares de cor fiquem sob `contrast.js`.

Os contratos que estes arquivos citam estão em `docs/visual-layer/contracts-proposal.md` (proposta aprovada em 2026-10-22).
