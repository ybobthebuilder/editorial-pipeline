# Segurança

Este repositório é público. Esta página diz como relatar uma vulnerabilidade, o que nunca entra aqui, o que fazer se uma credencial vazar, como o projeto se defende e o que foi verificado na auditoria de 2026-11-07.

## Relatar uma vulnerabilidade

Use o relato privado do GitHub: aba **Security** do repositório, botão **Report a vulnerability** (Private vulnerability reporting). Só os mantenedores veem o relato.

- Não abra issue nem pull request público com detalhes de uma vulnerabilidade.
- Não cole no relato uma credencial válida, um PDF real nem dado pessoal. Descreva onde está e como reproduzir.
- O escopo é este repositório: código, migrations, contratos, validadores, configuração base, workflows sanitizados e documentos. Os ambientes de execução (banco, n8n) ficam fora dele e não são cobertos por esta página.
- Prazo de resposta: não definido.

## O que nunca entra neste repositório

(`CLAUDE.md`, "Segurança" e "Dois Repositórios, Dois Schemas"; `docs/PUBLIC_PRIVATE.md`)

- Segredo, token, senha, string de conexão e `.env` real. Só o `.env.example`, com placeholders.
- PDF real, saída de LLM, linha do banco e métrica.
- Workflow n8n com credential ID, `pinData` ou URL privada.
- Dado pessoal. As fixtures são só sintéticas (`fixtures/synthetic/`).
- O que pertence ao `editorial-intel` (privado): sobreposições de configuração aprendidas, análises, relatórios e papers reais.

## Se uma credencial vazar

**Revogue e rotacione. Apagar o commit, reescrever o histórico ou tornar o repositório privado não basta: a credencial pode já ter sido copiada.**

1. Revogue a credencial no emissor (banco, n8n, provedor de API), antes de qualquer outra coisa.
2. Emita uma nova e guarde-a fora do repositório (`.env` ou cofre).
3. Confirme que a antiga deixou de funcionar.
4. Procure uso indevido nos registros do emissor, desde a data em que ela entrou no repositório.
5. Remova-a do código por pull request. Reescrever o histórico é um passo à parte, que não substitui a rotação.

A senha do papel `human_reviewer` fica num cofre separado e nunca entre as credenciais do n8n que roda o robô (`CLAUDE.md`, "Segurança").

## Como o projeto se defende

- **Segredos.** `gitleaks` no commit (hook) e no CI, sobre o histórico e a árvore, com autoteste que planta um segredo e exige que o scanner o pegue. Detalhes no `README.md`.
- **Banco** (`CLAUDE.md`, "Segurança"): RLS ativado em todas as tabelas; `REVOKE ALL` para `anon` e `authenticated`; `n8n_pipeline` só executa funções, sem privilégio de tabela; `human_reviewer` é um papel separado, sem relação com `n8n_pipeline`; as funções são `SECURITY DEFINER`, com `search_path` fixo e dono `editorial_owner`; um banco por cliente. O banco não distingue pessoa de workflow, por isso a credencial do `human_reviewer` não fica em workflow sem supervisão.
- **Dados.** Nenhum PDF real, saída de LLM, linha do banco ou métrica entra no repositório público.

## Configuração do GitHub exigida

Fica fora do código e se confere em Settings. Os comandos abaixo só leem:

| Configuração | Como conferir |
| --- | --- |
| Relato privado de vulnerabilidades | `gh api repos/ybobthebuilder/editorial-pipeline/private-vulnerability-reporting` devolve `{"enabled":true}` |
| Secret scanning e push protection | `gh api repos/ybobthebuilder/editorial-pipeline --jq .security_and_analysis` mostra `secret_scanning` e `secret_scanning_push_protection` como `enabled` |
| Proteção da branch `main`, exigindo os checks `test`, `scan` e `migrations` antes do merge | `gh api repos/ybobthebuilder/editorial-pipeline/branches/main/protection` lista os checks exigidos; a resposta 404 "Branch not protected" quer dizer que não há proteção |

O `scan` (gitleaks) é o único portão de segredos do repositório: um merge antes de ele terminar o anula.

## Auditoria de 2026-11-07

Pedida para conferir se o repositório contém segredo, dado pessoal, PDF, conteúdo real de produção, saída de LLM ou dado de banco.

**Método**
- Histórico completo: 154 commits em 58 branches (94 com conteúdo e 60 merges sem diff), incluindo todo conteúdo já adicionado em qualquer commit, mesmo em arquivos que depois mudaram.
- `gitleaks`, na versão do CI, sobre o histórico inteiro e a árvore atual, com a configuração do repositório e só com as regras padrão. Um token falso plantado foi detectado.
- Varredura própria das 18.514 linhas adicionadas: e-mails, telefones, CPF, CNPJ, números de CRM, strings de conexão, senhas, chaves privadas, JWT, chaves de API de provedores comuns, IPs, URLs, DOI, PMID, chaves de arquivo do Figma, marcadores de saída de LLM e dumps de banco.
- Arquivos: nunca houve PDF, imagem, planilha, `.env` real, arquivo apagado ou blob grande. O maior tem 38 KB; as extensões são `json`, `js`, `md`, `sql`, `svg` e `yml`.

**Resultado:** nenhuma credencial, PDF, dado pessoal sensível, conteúdo real de produção, saída de LLM ou dado de banco, nem no conteúdo atual nem no histórico. Não houve credencial a revogar ou rotacionar. Os achados foram só de exposição:

- Os metadados dos commits trazem o e-mail de contato do autor. Não é segredo. O histórico não foi reescrito.
- Um documento apontava para um relatório externo; o link saiu do documento (PR #55) e continua no histórico.
- Os valores que pareciam dados são placeholders ou sintéticos (telefones e CRM de teste, UUIDs `0000…`, o `[password]` do `.env.example`).

**Não auditado**
- O que existe só no GitHub: descrições e comentários de PR e issues, logs e artefatos do Actions, branches apagados.
- O repositório privado `editorial-intel`.
- Os ambientes reais (banco, n8n), onde ficam as credenciais de verdade. O repositório referencia só placeholders.

A auditoria não se repete sozinha. O `gitleaks` do CI cobre segredos a cada push; o resto pede uma nova varredura.
