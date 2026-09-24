# SDD Navigator Dashboard

A Next.js dashboard for **specification-driven development**: it shows which requirements of a project are implemented, tested, or still unaddressed, using the [SDD Navigator API](https://api.pdd.foreachpartners.com).

- **Summary** — coverage percentage, requirement counts by type and status, orphan counts, last scan time.
- **Requirements** — searchable, filterable (type / status chips) and sortable table; filters live in the URL so views can be shared.
- **Requirement detail** — description, coverage assessment, linked `@req` annotations with code snippets, linked tasks.
- **Tasks and orphans** — all work items with orphan highlighting, plus a panel of references to unknown requirements.
- **Light and dark themes** — follows the OS on first visit; the toggle's choice is stored in `localStorage`.

## Data modes

| Mode | When | Data |
|---|---|---|
| **Mock mode** | `NEXT_PUBLIC_API_URL` unset or empty (default for development) | `data/*.json`, shaped exactly like the API responses |
| **API mode** | `NEXT_PUBLIC_API_URL` set, e.g. `https://api.pdd.foreachpartners.com` | the live SDD Navigator API |

The header shows which mode is active. `NEXT_PUBLIC_API_URL` is read at build time, so rebuild after changing it.

## Getting started

Requires Node.js ≥ 22.18 (Node 24 recommended) and pnpm.

```bash
pnpm install
pnpm dev                                                   # mock mode on http://localhost:3000
NEXT_PUBLIC_API_URL=https://api.pdd.foreachpartners.com pnpm dev   # API mode
```

Production build:

```bash
pnpm build && pnpm start
NEXT_PUBLIC_API_URL=https://api.pdd.foreachpartners.com pnpm build && pnpm start
```

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js development server, production build, production server |
| `pnpm test` | Unit, component and accessibility tests (Vitest) |
| `pnpm test:contract` | Checks the live API against the schemas (network required) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm check:coverage` | Self-validation: compares `requirements.yaml` with the `@req` annotations in the code and exits with code 1 if any requirement is unimplemented |
| `pnpm validate` | Everything above that CI runs: typecheck, lint, tests, build, coverage check |

## Specification-driven workflow

`requirements.yaml` is the single source of truth. Code that implements or tests a requirement carries a comment such as `// @req SCD-UI-003`; files named `*.test.*` count as tests. `pnpm check:coverage` prints a report (covered / partial / missing, plus orphan annotations) and fails when any requirement has no implementation. Pass `--tasks <file.json>` to also report orphan tasks.

Git hooks (Husky): pre-commit runs tests and the build; pre-push adds the type check and lint. Commit messages follow Conventional Commits (commitlint).

## Deployment

The app deploys on **Vercel** through the GitHub integration:

- every pull request gets a **Preview** deployment;
- `main` deploys to **Production**.

Set `NEXT_PUBLIC_API_URL` per Vercel environment (Project → Settings → Environment Variables). Leave it unset in Preview to review UI changes against mock data.

CI (`.github/workflows/ci.yml`) runs `pnpm validate` on every pull request and push to `main`.
