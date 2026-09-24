# UI refresh and API-side filtering — design

Date: 2026-09-25 · Status: approved design, pending spec review · Branch: `feat/dashboard`
Supersedes, in `docs/superpowers/specs/2026-09-25-dashboard-design.md`: the "Rendering" decision (filtering in memory), the "Summary" layout (four tiles + bars per status), and the visual styling. Everything else there still applies.

## Goals

1. **Filters go to the data layer as query parameters.** In API mode that is the HTTP query string sent to the SDD Navigator API; mock mode receives identical calls.
2. **Minimalist, friendlier UI** — visual direction "A · Soft cards" chosen in the companion.

## Decisions

| Topic | Decision |
|---|---|
| Where filtering happens | Server: `/` reads `searchParams` and requests filtered data; one code path for both modes |
| Multi-select vs single-valued API params | One request per selected value, merged, de-duplicated by id, re-sorted; a group with every value selected (or none) omits the parameter |
| Search `q` | Client-side on the returned rows (the API has no search parameter); written to the URL with `history.replaceState` (no server round trip) |
| Filter / sort URL updates | `router.replace(href, { scroll: false })` inside `startTransition`; controls read an optimistic query (`useOptimistic`) so clicks show immediately and consecutive clicks compose |
| Pending feedback | The affected table gets `aria-busy="true"` and reduced opacity while the transition runs |
| Visual direction | Soft cards: off-white page, borderless white cards, segmented filter controls, tinted status pills |
| Summary layout | Three KPI cards: Coverage (figure + one segmented stacked bar + counts text), Requirements (total + FR/AR), Orphans (total + breakdown + "Review →") — replaces the four-tile + per-status-bars layout |
| Dependencies | None added |

## Data flow

### `src/lib/dashboard/fetch.ts` (server-side)

```ts
fetchRequirements(query: DashboardQuery, api?: Pick<ApiClient, "listRequirements">): Promise<Result<Requirement[]>>
fetchTasks(query: DashboardQuery, api?: Pick<ApiClient, "listTasks">): Promise<Result<Task[]>>
```

- `api` defaults to the `@/lib/api` functions; tests inject a client over a recording transport.
- Parameter values per group: `[]` or all allowed values → `[undefined]` (omit); otherwise the selected values.
- Requirements: one `listRequirements({ type, status, sort, order })` call per (type × status) combination — at most 1 × 2 = 2 calls, because selecting both types is "all".
- Tasks: one `listTasks({ status })` call per selected task status — at most 2 calls.
- Results run in parallel; the first failed `Result` (in request order) becomes the result; otherwise rows are merged, de-duplicated by `id` (first occurrence wins) and sorted with `compareRows(query)` — text comparison on the sort field, id tie-break, reversed for `desc` — the same rule the API and `applyRequirementQuery` use (shared helper, not duplicated).
- `q` is not sent.

### Page `/`

- `DashboardPage({ searchParams }: PageProps<"/">)` → `parseDashboardQuery(searchParamsFromRecord(await searchParams))`.
- In parallel: `getStats()`, `fetchRequirements(query)`, `fetchTasks(query)`, `listTasks({ orphans: true })`, `listAnnotations({ orphans: true })`.
- "Showing n of N": n = rows after the client-side `q` filter; N = `stats.requirements.total` / `stats.tasks.total` (falls back to the fetched row count when stats failed).

### Client

- `useDashboardQuery()` returns `{ query, isPending, update(patch), setSearchText(q) }`:
  - `query` = `useOptimistic(parseDashboardQuery(useSearchParams()))`.
  - `update(patch)` → `startTransition(() => { setOptimistic({...query, ...patch}); router.replace(href, { scroll: false }) })`.
  - `setSearchText(q)` → `window.history.replaceState(null, "", href)` (q only; no server render).
- `RequirementsTable` / `TasksPanel` receive already-filtered rows from the server; they apply only `q` (requirements) and render.

## Visual design (direction A)

### Tokens (`src/app/globals.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--plane` | `#fafaf9` | `#0e0e0d` | page |
| `--surface` | `#ffffff` | `#191918` | cards |
| `--surface-2` | `#f4f4f2` | `#232321` | segmented-control track, code, search field |
| `--ink` / `--ink-2` / `--muted` | `#111110` / `#57564f` / `#6b6a66` | `#f5f5f4` / `#c3c2b7` / `#8d8c86` | text |
| `--link` | `#1c5cab` | `#86b6ef` | links |
| `--hairline` | `rgba(17,17,16,0.08)` | `rgba(255,255,255,0.08)` | dividers |
| `--shadow` | `0 1px 2px rgba(17,17,16,0.04), 0 1px 3px rgba(17,17,16,0.06)` | `none` | cards |
| `--accent` / `--focus` | `#2a78d6` | `#3987e5` | selected controls, meter, focus ring |
| `--good` / `--warning` / `--critical` | `#0ca30c` / `#fab219` / `#d03b3b` | same | dots and bar segments (never text) |
| `--good-tint` / `--warning-tint` / `--critical-tint` | `#e8f6e8` / `#fdf3dc` / `#fbe9e9` | `#15291a` / `#2e2612` / `#321a1a` | pill backgrounds, orphan row tint |

All text tokens ≥ 4.5:1 on `--surface`, `--plane` and `--surface-2`; `--ink` ≥ 4.5:1 on every tint — extended in `theme-contrast.test.ts`.

### Components

| Component | Replaces | Notes |
|---|---|---|
| `Card` | ad-hoc bordered sections | `rounded-xl bg-surface shadow-[var(--shadow)] p-5`; optional title + actions slot |
| `SegmentedFilter<T>` | `FilterChips` | track in `--surface-2`; "All" + one toggle button per value (`aria-pressed`); "All" pressed when none selected and clears the group; group `role="group"` + `aria-label` unchanged |
| `StatusPill` | `StatusBadge` | tint background + coloured dot + capitalised label ("Partial") |
| `CoverageBar` | `StatusBars` | one bar, segments per status with 2px gaps, `aria-hidden`; sr-only sentence "5 covered, 1 partial, 2 missing of 8"; legend text visible |
| `KpiCard` | `StatTile` | label (12px muted), value (28px semibold, tight tracking), detail |
| `Header` | Header | slim bar: title, mode badge, "Last scan …" (muted, hidden < 640px), icon theme toggle |

### Pages

- **Dashboard:** header → KPI row (Coverage card spans 2 columns on ≥ 1024px) → Requirements card (toolbar: search + two segmented filters, wraps on narrow screens; "Showing n of N"; table with 44px rows, hover wash, sort arrow only on the active column) → Tasks card (segmented task-status filter; orphan rows tinted with an "Orphan" pill) → Orphans card (`<details>`, count badge, chevron right; two compact lists).
- **Detail:** breadcrumb `Requirements / {id}` (link keeps filters) → title, `StatusPill` and assessment → two cards (description; meta: type, status, created, updated) → annotation code cards (header `file:line` + impl/test tag, snippet) → tasks list.
- **States:** skeletons shaped like the cards; pending tables dimmed with `aria-busy`; error cards; empty states centred with a "Clear filters" button; not-found card.
- **Phone:** cards stack; tables scroll inside cards; the 360px guard test stays.

Unchanged: URLs and params, accessible names/roles used by tests (group labels, button names, captions, "Sort by …"), icon + label for status, theme persistence, axe checks.

## Requirements (`requirements.yaml`)

- **SCD-FLT-001**, **SCD-FLT-003**, **SCD-SORT-001**: add "in API mode the selected filters and sort MUST be sent to the API as query parameters (one request per selected value when several are selected)".
- **SCD-UI-001 / SCD-UI-002**: summary as KPI cards; status breakdown as one segmented bar with counts and labels.
- New **SCD-UI-007** "Minimalist visual design": cards on a neutral page, segmented filters, tinted status pills, pending feedback while filters load.

## Testing

- `fetch.test.ts` (node): recording transport — exact request query strings for: no filter; one type; both types (omitted); two statuses (2 requests); two task statuses; sort/order passthrough; merge + de-dup + re-sort; first error wins; `q` never sent.
- Component tests updated for the new markup; new tests: optimistic chip press before the URL changes, consecutive clicks compose, `router.replace` for filters vs `history.replaceState` for search, `aria-busy` while pending, "All" clears a group.
- Page test: `DashboardPage` with `searchParams` `{ type: "AR", status: ["missing"] }` renders only the AR/missing rows from the filtered request.
- Navigation mock: `router.replace` records the href and lets tests commit the URL explicitly (`commitNavigation()`), modelling the async server round trip.
- Existing: contrast (extended to tints and `--surface-2`), no hard-coded colours, phone-layout guard, axe per view, coverage gate 100%.

## Out of scope

Client-side fetching, caching/prefetch of filter combinations, new features, detail-page data changes.
