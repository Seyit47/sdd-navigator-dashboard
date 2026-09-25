# CLAUDE.md

## Git workflow

- Never commit directly to `main`. Create a branch first (e.g. `chore/...`, `feat/...`, `fix/...`).
- Push new branches with `git push -u origin <branch>`.
- Commit messages MUST follow [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<optional scope>): <description>`, e.g. `feat(requirements): add status filter`.
  - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
  - Description in imperative mood, lowercase, no trailing period; mark breaking changes with `!` after the type/scope and a `BREAKING CHANGE:` footer.
  - `feat`, `fix`, `refactor`, `perf` and `test` commits MUST name the requirements they change in a footer: `Refs: SCD-UI-003, SCD-FLT-001` (ids from `requirements.yaml`).
  - Enforced by the `.husky/commit-msg` hook (commitlint with `@commitlint/config-conventional` plus the local `requirement-reference` rule in `scripts/commitlint/`).
- Husky hooks (`.husky/pre-commit`, `.husky/pre-push`) run `pnpm build`; a failing build blocks the commit/push. Fix the build instead of bypassing with `--no-verify`.
