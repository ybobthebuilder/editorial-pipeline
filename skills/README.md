# skills/ — manuais dos estágios com LLM (rascunhos)

> **RASCUNHO (PROPOSED).** Revisão por digest, sem autorizar merge. Nenhum workflow carrega estes arquivos. Escopo: estágios 06, 07 e 09 da camada visual.

Cada `SKILL.md` é o **prompt de sistema e a fronteira** de um único nó de LLM do n8n: o que o nó pode e não pode fazer, o formato JSON de entrada e de saída, e o porquê de cada regra. Não é código executável e não é um agente.

## Formato

- Frontmatter com `name` e `description` apenas.
- Corpo em PT-BR, no imperativo, com o motivo de cada regra, bem abaixo de 500 linhas.
- **Sem `tools` e sem `model` no frontmatter.** O n8n não interpreta esses campos, e em runtime não há ferramentas (`CLAUDE.md` §2).
- Não verifiquei contra a documentação da Anthropic o que foi dito sobre formato de Skills e de subagentes (campos do frontmatter, limite de 500 linhas, descrição "insistente"). Os arquivos só usam o mínimo comum, `name` e `description`, e não dependem do resto.

## O que foi rascunhado

| Arquivo | Estágio | O que o LLM faz | O que o código faz |
| --- | --- | --- | --- |
| `art-director` | 06_VISUAL | escolhe `grammar_id` numa lista fechada | valida o enum, define template e cores |
| `copywriter-cfm` | 07_COVERS | escreve o texto dos slots `claim` e o `alt_text` | limites de linha, números (`numbers.js`), termos proibidos |
| `qa-validator` | 09_QA | só o juízo semântico | geometria, contraste, números, enums e o `passed` final |

## O que não foi rascunhado, e por quê

Da lista A1–A7 enviada em 2026-10-22:

| Agente | Situação |
| --- | --- |
| A1 `brief-researcher` | **Não rascunhado.** Recuperar PMID ou DOI por busca exige ferramenta de rede e confia no modelo para produzir identificadores. Em `CLAUDE.md`, as afirmações vêm do PDF no `02_EXTRACT`, o `03_VERIFY` as confere por código e identificador inventado é a alucinação que o §8 proíbe. Não há estágio atual para ele. |
| A2 `science-reviewer` | **Não rascunhado.** O papel mais próximo é o `03_VERIFY` (`prompt.03_verify`), fora do escopo da camada visual e já coberto por validação de código (`citation.js`). |
| A5 | Não aparece na mensagem. Qual é o papel? |
| A6 `figma-builder` | **Não rascunhado.** O render é código (`08_RENDER`, sem LLM). Escrita no Figma em runtime está fora do escopo (`roadmap.md`) e o seat atual é View. |

## Conflitos com o `CLAUDE.md` que precisam de decisão

1. **Subagentes com ferramentas × "Nenhum AI Agent" (`CLAUDE.md` §2).** A descrição de A1–A7 como subagentes com `tools` (WebFetch, PubMed, Figma) é incompatível com o runtime atual: só Basic LLM Chain e Information Extractor, sem modo agente. Os rascunhos seguem o §2. Se a intenção é mudar o §2, isso é uma decisão de governança (PR no `CLAUDE.md`), não um detalhe de arquivo.
2. **Duas fontes para o mesmo prompt.** O `CLAUDE.md` prevê `prompts/baseline/*.md` e as chaves `prompt.06_visual`, `prompt.07_covers`, `prompt.09_qa` na config. Aqui há `skills/*/SKILL.md`. Proponho que `skills/` seja a fonte e que `seed-baseline` leve o texto para `config_baseline`, porque o n8n Cloud não lê arquivos do repositório. Hoje o `seed-baseline` só carrega JSON, e o formato do `content` de um prompt (por exemplo `{"text": "..."}`) é **UNKNOWN**.
3. **D-05 (CFM).** Os nomes `copywriter-cfm` e a regra de termos proibidos pressupõem que as regras do CFM se aplicam. Isso não foi decidido. A lista de termos entra pela config (`blocklist`), nunca embutida no prompt, e a afirmação regulatória em si não foi verificada.
4. **Quem escolhe o template.** Aqui o LLM só escolhe a gramática; o template sai dela por mapeamento na config. Na descrição de A4 o agente também escolhia componentes e tokens de cor. Mantive cores e template fora do modelo para que os pares de cor fiquem sob `contrast.js`.

Os contratos que estes arquivos citam estão em `docs/visual-layer/contracts-proposal.md` (ainda proposta; nenhum schema foi criado).
