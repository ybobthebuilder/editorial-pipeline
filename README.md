# editorial-pipeline
Public media processing pipeline: code, contracts, validators, baseline config, workflows, docs. Auditable, reproducible, zero hallucination.

## Segredos: gitleaks no commit e no CI

O repositório é público: nenhum segredo, token, string de conexão ou dado real entra nele (`CLAUDE.md`, Segurança).

- **No commit** (uma vez por clone): `git config core.hooksPath scripts/hooks`. O hook roda `gitleaks` sobre o que está no stage e **recusa o commit** se achar um segredo, ou se o `gitleaks` não estiver instalado. Instalação, na versão fixada do CI: `go install github.com/zricethezav/gitleaks/v8@v8.30.1`.
- **No CI** (`.github/workflows/gitleaks.yml`): o mesmo `gitleaks`, na mesma versão, varre todo o histórico e a árvore de trabalho; antes disso, um autoteste planta um segredo e exige que o scanner o pegue, para um scanner cego não passar por limpo. A configuração é `.gitleaks.toml` (regras padrão, sem lista de exceções).
- Trocar a versão do `gitleaks` é uma decisão: mude as três ocorrências (workflow, hook e este texto) na mesma PR.
