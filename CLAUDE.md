# CLAUDE.md

## Git workflow

- Never commit directly to `main`. Create a branch first (e.g. `chore/...`, `feat/...`, `fix/...`).
- Push new branches with `git push -u origin <branch>`.
- Husky hooks (`.husky/pre-commit`, `.husky/pre-push`) run `pnpm build`; a failing build blocks the commit/push. Fix the build instead of bypassing with `--no-verify`.
