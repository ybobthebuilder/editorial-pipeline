# editorial-pipeline

Pipeline editorial que transforma um paper em capas e textos de post, com cada afirmação ligada a um trecho verificado do PDF. Este repositório é a parte **pública**: código, migrations, contratos, validadores, configuração base, prompts e fixtures sintéticas. Auditável e reproduzível; funciona sem o repositório privado.

A alucinação é barrada por validação determinística em código, nunca pela palavra do modelo (`CLAUDE.md` §8). O LLM extrai e classifica; estado, cálculos e regras de negócio são do banco e do código (`CLAUDE.md` §1 a §3).

## Estado do projeto

O que está pronto e o que falta muda a cada fase. A fonte é a seção "Fases de Construção" do `CLAUDE.md`, e não uma cópia aqui, para não envelhecer. Os workflows n8n ainda não existem neste repositório.

## Por onde começar a ler

1. `CLAUDE.md`: os princípios que não se negociam e o mapa de diretórios.
2. `docs/PUBLIC_PRIVATE.md`: o que fica neste repositório e o que fica no privado.
3. `docs/STAGES.md`: um cartão por etapa, de `00_ORCHESTRATOR` a `12_PUBLISHED`.
4. `docs/visual-layer/contexto.md`: a camada visual.
5. `docs/DECISIONS.md`: o registro das decisões (`D-nn`, `U-nn`, `U11-x`), com a fonte de cada uma.

## Fronteira público/privado

- **Público (aqui):** nenhum PDF real, saída de LLM, linha do banco, métrica, segredo ou string de conexão.
- **Privado (`editorial-intel`):** sobreposições de configuração aprendidas, análises, relatórios e papers reais. Só acrescenta camadas; este repositório não depende dele.

Detalhe e regras em `docs/PUBLIC_PRIVATE.md`.

## Como rodar os testes

Requer Node 22. Não há `package.json` nem dependências a instalar. Os comandos são os do CI (`.github/workflows/`); rode da raiz do repositório:

```
node --test 'validators/*.test.js'
node --test 'render/*.test.js'
node --test 'tests/skills/*.test.js'
node --test 'tests/docs/*.test.js'
```

O `node` termina com código 0 quando o padrão não casa nenhum arquivo. O CI por isso recusa uma execução vazia ou com falha (`# tests` maior que 0 e `# fail 0`); confira essas duas linhas na saída. O CI também instala `fonts-liberation` antes desses testes: as larguras embutidas em `validators/geometry.js` vêm dessas fontes.

**Migrations, rollbacks e scripts** exigem um Postgres limpo e o cliente `psql`, com `PGHOST`, `PGPORT`, `PGUSER` e `PGPASSWORD` definidos. Sem `PGHOST` a suíte falha de propósito, sem pulo silencioso. As suítes criam papéis do cluster inteiro (`anon`, `authenticated`, `n8n_pipeline`, `human_reviewer`, `editorial_owner`): use só um Postgres descartável, nunca um banco com dados.

```
node --test --test-concurrency=1 'tests/migrations/*.test.js' 'tests/scripts/*.test.js'
```

## Como auditar a configuração base

`config/baseline/` e `skills/` (a fonte dos prompts) têm um `.checksums` cada. Para conferir os arquivos contra eles, sem tocar no banco:

```
node scripts/verify-baseline.js --dir config/baseline --skills skills --offline true
```

Saída `OK: ... conferem com .checksums` e código 0 quando tudo bate; 1 se algo diverge; 2 se o uso estiver errado. Sem `--offline true`, o script também compara com `editorial.config_baseline` e precisa de um papel que leia essa tabela.

## Como contribuir

Toda mudança entra por pull request, no modelo de `.github/pull_request_template.md`. As regras de desenvolvimento supervisionado, de revisão e de merge estão em `CLAUDE.md` §2.

## Segredos: gitleaks no commit e no CI

O repositório é público: nenhum segredo, token, string de conexão ou dado real entra nele (`CLAUDE.md`, Segurança).

- **No commit** (uma vez por clone): `git config core.hooksPath scripts/hooks`. O hook roda `gitleaks` sobre o que está no stage e **recusa o commit** se achar um segredo, ou se o `gitleaks` não estiver instalado. Instalação, na versão fixada do CI: `go install github.com/zricethezav/gitleaks/v8@v8.30.1`.
- **No CI** (`.github/workflows/gitleaks.yml`): o mesmo `gitleaks`, na mesma versão, varre todo o histórico e a árvore de trabalho; antes disso, um autoteste planta um segredo e exige que o scanner o pegue, para um scanner cego não passar por limpo. A configuração é `.gitleaks.toml` (regras padrão, sem lista de exceções).
- Trocar a versão do `gitleaks` é uma decisão: mude as três ocorrências (workflow, hook e este texto) na mesma PR.

Para relatar uma vulnerabilidade, o que fazer se uma credencial vazar e o registro da auditoria, ver `docs/SECURITY.md`.

## Licença

MIT. Ver `LICENSE`.
