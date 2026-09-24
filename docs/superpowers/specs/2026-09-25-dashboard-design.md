# Dashboard, tests and self-validation — design

Date: 2026-09-25 · Status: approved design, pending spec review
Covers user steps 3 (dashboard), 4 (comprehensive tests) and 5 (self-validation and deployment).
Builds on the data layer (`docs/superpowers/specs/2026-09-25-data-layer-design.md`, `@/lib/api`).

## Decisions

| Topic | Decision |
|---|---|
| Rendering | Hybrid: server components fetch via `@/lib/api`; client components filter/sort the loaded rows in memory and sync the URL. The browser never calls the API. |
| Freshness | Pages call `await connection()` so they render per request (never prerendered with build-time data). |
| Layout | One scrolling page (summary → requirements → tasks → orphans); requirement detail is its own route. |
| Summary | KPI row of four equal stat tiles + one bar per coverage status (mockup "B"). |
| Colour | Status palette fixed: covered = good `#0ca30c`, partial = warning `#fab219`, missing = critical `#d03b3b`; always icon + label, never colour alone. All colours are CSS tokens. |
| URL state | Repeated params; invalid values ignored; defaults omitted; `router.replace` without scroll. |
| Scan UI | None (not in step 3). |
| A11y automation | axe-core in Vitest/jsdom per view + a token-contrast test over `globals.css`; no Playwright. |
| Self-validation | `scripts/check-coverage.ts` run with Node's built-in TypeScript support; exits 1 when any requirement is missing. |
| Enforcement | Hooks: pre-commit = test + build; pre-push = typecheck + lint + test + build. CI runs `pnpm validate` (adds the coverage gate). |

## Routes

| Route | Data (server) | States |
|---|---|---|
| `/` | In parallel: `getStats()`, `listRequirements()`, `listTasks()`, `listTasks({ orphans: true })`, `listAnnotations({ orphans: true })` | `loading.tsx` skeleton; each section renders its own `ErrorPanel` on a failed `Result` |
| `/requirements/[id]` | `getRequirement(id)` | `loading.tsx`; `not_found` → `notFound()` → `not-found.tsx` ("Requirement not found" + link back); other errors → `ErrorPanel` |

Orphan membership comes from the API's `orphans=true` lists, not from local recomputation.

## Page structure and components

`src/components/` (S = server component, C = client component)

- **Header** (S) — title, data-mode badge ("Mock data" / "Live API", from `dataMode`), `ThemeToggle` (C).
- **Summary** (S)
  - `StatTile` ×4: **Coverage** (`stats.coverage` as `62.5%` + `CoverageMeter`), **Requirements** (total + `FR n · AR n`), **Orphans** (annotation + task orphan counts; ⚠ icon and "need attention" only when > 0, otherwise 0 with ✓), **Last scan** (`lastScanAt`, formatted).
  - `StatusBars`: one row per status (✓ Covered, ◐ Partial, ✕ Missing) — bar width = count / max count, count at the tip, hover/focus tooltip "Covered: 5 of 8 (62.5%)". With 0 requirements all bars are empty and shares read 0% (no division by zero).
- **RequirementsTable** (C) — search box (`q`), `FilterChips` for type and status, "Clear filters", count "Showing n of N" in a polite live region, sortable ID and Updated headers (`aria-sort`, button inside), rows: ID (link to detail with the current query), type, title, `StatusBadge`, updatedAt. Empty state: "No requirements match these filters." + Clear filters.
- **TasksPanel** (C) — `FilterChips` for task status (`taskStatus`), columns ID, requirement ID (link unless orphan), title, status, assignee ("—" when absent). Orphan rows: tinted background + "⚠ orphan" text tag. Empty state for filters.
- **OrphanPanel** (S) — native `<details open>` "Orphans (n)": sub-table *Annotations* (file, line, unknown reqId, type) and *Tasks* (task id, title, unknown requirementId). With none: "No orphans — every reference points to a known requirement."
- **Requirement detail** (S) — back link `/?<query>`; id · type; title; `CoverageLabel` (covered → "✓ Fully covered", partial → "◐ Needs tests", missing → "✕ Not implemented"); description; created / updated / status; `AnnotationList` (file:line, impl/test, snippet in `<pre>`); tasks table (id, title, status, assignee, updatedAt).
- **ErrorPanel** (C) — API error message + Retry (`router.refresh()`).

Pure logic in `src/lib/dashboard/`:

- `query.ts` — `parseDashboardQuery(params)`, `serializeDashboardQuery(query)`, `applyRequirementQuery(rows, query)`, `applyTaskQuery(rows, query)`.
- `coverage.ts` — status → label, icon, token name.
- `format.ts` — dates with `en-GB` and `timeZone: "UTC"` (e.g. `1 Mar 2026`, `1 Mar 2026, 10:15 UTC`) so server and client render identical text.

## URL state

| Param | Values | Default (omitted) |
|---|---|---|
| `q` | free text, trimmed; case-insensitive substring of id or title | none |
| `type` (repeatable) | `FR`, `AR` | no filter |
| `status` (repeatable) | `covered`, `partial`, `missing` | no filter |
| `sort` | `id`, `updatedAt` | `id` |
| `order` | `asc`, `desc` | `asc` |
| `taskStatus` (repeatable) | `open`, `in_progress`, `done` | no filter |

- Unknown values and duplicates are dropped; an empty group means "all".
- Sorting matches the API: text compare on the field, ties broken by id, whole comparison reversed for `desc`.
- Changes call `router.replace(pathname + query, { scroll: false })`; components reading the URL sit inside `<Suspense>`.
- Detail links carry the full current query; the back link restores it (all params, including `taskStatus`).

## Theme

- Tokens in `src/app/globals.css`: `--surface`, `--plane`, `--ink`, `--ink-2`, `--muted`, `--hairline`, `--accent`, `--accent-track`, `--chip`, `--focus`, `--good`, `--warning`, `--critical`, `--orphan-tint`. Light values on `:root`; dark values under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and under `:root[data-theme="dark"]`. Tailwind `@theme inline` maps them to utilities; components never hard-code colours.
- Inline script in `<head>` (before paint) sets `data-theme` from `localStorage["theme"]` if it is `light` or `dark`; storage access wrapped in try/catch. `<html suppressHydrationWarning>`.
- `ThemeToggle` flips between light and dark (starting from the effective theme), writes `localStorage["theme"]`, and is labelled "Switch to dark theme" / "Switch to light theme". First visit follows `prefers-color-scheme`; a stored choice wins afterwards.

## Accessibility

- Chips: `<button aria-pressed>` in `role="group"` with `aria-label` ("Filter by type", …); visible focus ring (`--focus`).
- Tables: `<table>` with visually hidden `<caption>`, `<th scope="col">`; sortable headers expose `aria-sort`.
- Status: icon + text everywhere; the warning colour is used for marks only, never text; all text/surface token pairs ≥ 4.5:1 in both themes.
- Orphans: tint + visible "⚠ orphan" text.
- Status bars: bars `aria-hidden`, counts and shares in text.

## requirements.yaml changes

| ID | Change |
|---|---|
| SCD-UI-001 | Summary: coverage tile with meter, total with FR/AR, orphan counts with warning only when > 0, lastScanAt |
| SCD-UI-002 | One bar per coverage status with count, icon and label |
| SCD-UI-004 | Adds coverage assessment label and back link preserving filters |
| SCD-UI-005 (new) | Tasks panel: columns, assignee when present, orphan tasks highlighted with text tag |
| SCD-UI-006 (new) | Collapsible orphan panel with annotation and task orphans |
| SCD-FLT-001 | Multi-select type/status chips as repeated query params |
| SCD-FLT-002 | Search box synced to `q` (implemented in this step) |
| SCD-FLT-003 (new) | Task status filter, multi-select, synced to `taskStatus` |
| SCD-THEME-001 | Choice persisted in `localStorage` |
| SCD-VAL-001 (new) | `scripts/check-coverage.ts` behaviour (below) |
| SCD-VAL-002 (new) | `pnpm validate` + CI workflow |

## Self-validation — `scripts/check-coverage.ts`

- Inputs: `requirements.yaml` (repo root) and source files under `src/`, `scripts/`, `.husky/` and root config files (`*.config.*`, `next.config.ts`); `docs/`, `node_modules/`, `.next/`, `data/` are excluded. Optional `--tasks <file.json>` reads a task list (same shape as `data/tasks.json`) for task-orphan reporting.
- Annotation syntax: `@req` followed by one or more comma-separated ids matching `[A-Z]+-[A-Z0-9]+-\d{3}`.
- Classification: files matching `*.test.*` or `*.contract.*` → test; everything else → impl.
- Per requirement: covered (impl + test), partial (impl only), missing (no impl annotation; test-only counts as missing).
- Orphans: annotations (and tasks, when given) referencing ids not in `requirements.yaml`.
- Output: a table (id, status, impl count, test count), orphan list, summary line `Coverage: x% (covered/total)`.
- Exit codes: `0` when no requirement is missing (partials and orphans are warnings); `1` when any requirement is missing; `2` when an input is unreadable — empty file, malformed YAML/JSON, or entries without string `id` and `title`.
- Structure: pure functions in `scripts/coverage/` (`parseRequirements(text)`, `parseTasks(text)`, `extractAnnotations(path, text)`, `computeCoverage(requirements, annotations, tasks)`, `formatReport(result)`) returning `Result`-style values; the CLI in `scripts/check-coverage.ts` does file IO and exit codes.
- Run: `pnpm check:coverage` → `node scripts/check-coverage.ts` (Node ≥ 22.18 type stripping; `package.json` `engines.node` set accordingly). New dev dependency: `yaml`.

## Tests

All with `// @req SCD-…` comments. Environments: node (default) and jsdom (component tests, per-file `// @vitest-environment jsdom`).

- **Data layer (existing):** 68 API-client tests — malformed JSON bodies, empty bodies, orphan filters, error mapping.
- **Coverage script:** valid YAML; malformed YAML; empty file; entries missing id/title; malformed and empty tasks JSON; annotation parsing (single, comma lists, ids in strings of other files ignored when not after `@req`); impl/test classification; orphan annotations; orphan tasks; 0% (no annotations), 100% (all impl + test), partial edge cases (impl only, test only = missing, mixed); exit codes via the CLI.
- **Dashboard logic:** query parse/serialize round-trip, invalid values, duplicates, defaults, search, filters, sort with ties; coverage labels; date formatting.
- **Components (React Testing Library, `next/navigation` mocked):** summary counts (requirements, annotations, tasks), 0% / 100% meter and empty dataset; table rows; type and status filter subsets; search; sort by id / updatedAt both directions; empty state; detail shows annotations, tasks and label; tasks panel renders, filters, highlights orphans; orphan panel; theme toggle persistence; error panel retry.
- **Accessibility:** axe-core on each rendered view (jsdom); `theme-contrast.test.ts` parses the tokens in `globals.css` and asserts ≥ 4.5:1 for every text/surface pair in both themes.

New dev dependencies: `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`, `axe-core`, `yaml`.

## Deterministic checks and deployment

- `pnpm validate` = `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm check:coverage`.
- Hooks: pre-commit `pnpm test`, `pnpm build`; pre-push `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
- `.github/workflows/ci.yml`: on pull requests and pushes to `main`, sets up Node 24, installs with pnpm and runs `pnpm validate`.
- Vercel (existing GitHub integration, environments Preview and Production): PRs → Preview, `main` → Production; `NEXT_PUBLIC_API_URL` set per environment in Vercel (unset → mock mode).
- README: what the app is, modes and `NEXT_PUBLIC_API_URL`, scripts (`dev`, `build`, `start`, `test`, `test:contract`, `typecheck`, `lint`, `check:coverage`, `validate`), deployment notes.

## Out of scope

Triggering scans from the UI, pagination, live refresh/polling, Playwright end-to-end tests.
