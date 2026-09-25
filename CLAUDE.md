# CLAUDE.md

Working rules for this repository. They apply to people and to AI agents alike.

## Specification-driven development

- **`requirements.yaml` is the single source of truth.** Every behaviour the app has is a requirement there before it is code.
  - IDs follow `SCD-{AREA}-{NNN}` (e.g. `SCD-UI-003`); `type` is `FR` (functional) or `AR` (architectural / non-functional).
  - Every entry has a `description` that is a verifiable MUST/SHOULD statement.
  - New or changed behaviour: add or edit the requirement **first**, then write the test, then the code.
- **Traceability through `@req` annotations.**
  - Every tracked source, script, hook, workflow and config file carries a comment naming the requirements it implements: `// @req SCD-UI-003, SCD-FLT-001` (`#` in shell/YAML, `/* */` in CSS).
  - In test files (`*.test.*`, `*.contract.*`) every `describe` block is directly preceded by `// @req …` naming what it verifies.
  - Test code that needs annotation text builds it at runtime (`"@" + "req"`) so the scanner does not count it.
- **The coverage gate must stay green:** `pnpm check:coverage --strict` — every requirement covered by implementation *and* test annotations, no partial coverage, no orphan annotations or tasks.
- **Design before code** for anything non-trivial: agree the design, write it to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, then implement. The API contract the schemas mirror is `docs/api/sdd-coverage-api.yaml`.

## Test-driven development

- Write the failing test first, run it and see it fail for the expected reason, then write the minimal code to make it pass.
- Bug fixes start with a test that reproduces the bug.
- Evidence before claims: say something works only after the command that proves it has run.

## Git workflow

- Never commit directly to `main`. Create a branch first (e.g. `chore/...`, `feat/...`, `fix/...`).
- Push new branches with `git push -u origin <branch>`.
- Commit messages MUST follow [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<optional scope>): <description>`, e.g. `feat(requirements): add status filter`.
  - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
  - Description in imperative mood, lowercase, no trailing period; mark breaking changes with `!` after the type/scope and a `BREAKING CHANGE:` footer.
  - Every commit (except a revert) MUST name the requirements it changes in a footer: `Refs: SCD-UI-003, SCD-FLT-001` (ids from `requirements.yaml`; keep each footer line under 100 characters, repeat `Refs:` for more ids).
  - Enforced by the `.husky/commit-msg` hook (commitlint with `@commitlint/config-conventional` plus the local `requirement-reference` rule in `scripts/commitlint/`), and in CI for every pull-request commit.
- Merge pull requests with **Rebase and merge**. GitHub's merge-commit message has no `Refs:` footer, and CI (`scripts/check-commit-refs.ts`) fails on any commit pushed to `main` without one, merge commits included.
- Never bypass hooks with `--no-verify`; fix what they report.

## Deterministic checks

| When | What runs |
|---|---|
| pre-commit | `pnpm test`, `pnpm build` |
| pre-push | `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm check:coverage` |
| commit-msg | commitlint (Conventional Commits + `Refs:`) |
| CI (PRs and `main`) | commit messages and references, `pnpm validate`, `pnpm check:browser`, `pnpm test:contract` |
| After each Production deployment | `pnpm check:browser` against the public URL (`homepage` in `package.json`), expecting API mode |

- Run `pnpm validate` (typecheck, lint, tests, build, strict coverage) before pushing.
- Checks that need a browser or the network (`pnpm check:browser`, `pnpm test:contract`) run in CI; run them locally when changing the UI or the data layer.

## Architecture rules

- All data access goes through `@/lib/api` (`createApiClient` + transport). Components never call `fetch`.
- API types come only from the Zod schemas in `src/lib/api/schemas.ts` (`z.infer`); enum values only from `src/lib/api/enums.ts`; row ordering only from `src/lib/api/sort.ts`.
- Expected failures are `Result` values (`ok` / `error.kind`), not exceptions.
- Mock mode (`NEXT_PUBLIC_API_URL` unset) and API mode share one code path; mock data in `data/*.json` mirrors the live API.
- Filters and sort are server-side: the page reads the URL and calls `src/lib/dashboard/fetch.ts`, one request per selected value. Search (`q`) is client-side. URL state goes through `useDashboardQuery` (`router.replace` for filters/sort, `history.replaceState` for search).
- Colours only as theme tokens in `src/app/globals.css` (one declaration per token, `light-dark()` for both themes); card surfaces via the `surface-card` / `surface-raised` utilities. Components never hard-code colours.
- Dates only through `src/lib/dashboard/format.ts` (fixed locale, UTC); labels through `formatLabel`.
- Accessibility: every control has an accessible name, status is never colour alone (icon or text too), and every view passes axe.

## Parsimony

- No new dependency without a requirement that needs it.
- Export only what another file uses (guarded by `scripts/dry.test.ts`); remove dead code instead of keeping it "just in case".
- Keep the README short and factual; update it in the same change as the behaviour it describes.
