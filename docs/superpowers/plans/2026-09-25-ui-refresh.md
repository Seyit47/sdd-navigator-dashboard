# UI Refresh and API-side Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send the dashboard's filters and sort to the data layer as query parameters (HTTP query string in API mode) and restyle the UI in the approved minimalist "soft cards" direction.

**Architecture:** The dashboard page reads `searchParams` on the server and calls a new `src/lib/dashboard/fetch.ts`, which fans a multi-select filter out into one single-valued request per selected value, merges, de-duplicates and re-sorts. Client controls navigate with `router.replace` and show the requested state immediately through a pending query kept in `useDashboardQuery`; search stays client-side via `history.replaceState`. Visuals move to new tokens and small primitives (`Card`, `KpiCard`, `SegmentedFilter`, `StatusPill`, `EmptyState`, `CoverageBar`).

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS 4, Zod 4, Vitest 5 + Testing Library + jsdom + axe-core.

**Spec:** `docs/superpowers/specs/2026-09-25-ui-refresh-design.md` (base: `docs/superpowers/specs/2026-09-25-dashboard-design.md`).

**Refinements over the spec (decided while planning):**
- The optimistic query is an explicit pending state in `useDashboardQuery` (set on click, cleared when the URL changes) instead of React's `useOptimistic`. `useOptimistic` reverts as soon as its transition settles, which in tests (and when a navigation is superseded) drops the pressed state; the explicit state is deterministic and testable with the same user-visible behaviour.
- "Last scan" moves from the site header into the dashboard's title row ("Coverage overview · Last scan …"): the header is in the root layout and has no access to page data without an extra `/stats` request.
- Client components still apply the (pending) filters to the rows they already have, so narrowing a filter shows instantly while the server re-fetches; widening shows once the new rows arrive.

## Global Constraints

- Branch `feat/dashboard`. Conventional Commits with the `Co-Authored-By` line; never `--no-verify`.
- No new dependencies.
- TypeScript strict, no `any`. Every source/test file carries `// @req SCD-…` (jsdom tests: `// @vitest-environment jsdom` first, then `@req`; client components: `"use client";` first).
- Components never hard-code colours (enforced by `theme-contrast.test.ts`); colours only via token utilities or `var(--token)`.
- URL params unchanged: `q`, `type`, `status`, `sort`, `order`, `taskStatus`. Filter/sort changes → `router.replace(href, { scroll: false })`; search → `window.history.replaceState(null, "", href)`.
- A group with no value or every value selected sends no parameter; requests per list ≤ 2.
- Accessible names that tests rely on stay: groups "Filter by type", "Filter by coverage status", "Filter by task status"; buttons "Sort by ID", "Sort by Updated"; searchbox "Search"; regions "Requirements", "Tasks"; table captions.
- After Task 5: `pnpm validate` exits 0 with coverage 100%.

## Review Focus

1. **Navigation superseded or landing on an unexpected URL** — a pending state must clear whenever the URL changes, never leave the table dimmed forever. Pinned in Task 3 (`clears the pending state when the URL changes elsewhere`).
2. **Clicking a control that does not change the URL** ("All" when nothing is selected) — must not set a pending state that never clears. Pinned in Task 3 (`does not navigate when nothing changes`).
3. **Every value selected** — must be treated as "All": no parameter in the URL or the API request. Pinned in Tasks 1 and 2.
4. **A failed request among several fan-out requests** — the whole list shows an error rather than a silently partial list. Pinned in Task 1 (`returns the first error`).
5. **Searching while a filter navigation is in flight** — the typed text must end up in the URL and the table. Pinned in Task 3 (`keeps the search text when a filter changes`).

---

### Task 1: API-side filtering core

**Files:**
- Modify: `requirements.yaml` (SCD-UI-001, SCD-UI-002, SCD-FLT-001, SCD-FLT-003, SCD-SORT-001; add SCD-UI-007)
- Modify: `src/lib/dashboard/query.ts` (export `compareRows`, use it in `applyRequirementQuery`)
- Modify: `src/lib/dashboard/format.ts` (add `formatLabel`), `src/lib/dashboard/coverage.ts` (add `tint`)
- Create: `src/lib/dashboard/fetch.ts`
- Test: `src/lib/dashboard/fetch.test.ts`, `src/lib/dashboard/format.test.ts` (one test added)

**Interfaces:**
- Consumes: `listRequirements`, `listTasks`, `ApiClient`, `Requirement`, `Task`, `Result` (`@/lib/api`); `ok` (`@/lib/api/errors`); `createApiClient`, `mockTransport`, `dataOf` (data layer, tests).
- Produces: `compareRows<T extends { id: string; updatedAt: string }>(query: Pick<DashboardQuery, "sort" | "order">): (a: T, b: T) => number`; `fetchRequirements(query: DashboardQuery, api?: Pick<ApiClient, "listRequirements">): Promise<Result<Requirement[]>>`; `fetchTasks(query: DashboardQuery, api?: Pick<ApiClient, "listTasks">): Promise<Result<Task[]>>`; `formatLabel(value: string): string` ("in_progress" → "In progress"); `StatusPresentation.tint` (`var(--good-tint)` etc.).

- [ ] **Step 1: Write the failing tests — `src/lib/dashboard/fetch.test.ts`**

```ts
// @req SCD-FLT-001, SCD-FLT-003, SCD-SORT-001
import { describe, expect, it } from "vitest";
import type { Requirement } from "@/lib/api";
import { createApiClient } from "@/lib/api/client";
import { err, ok } from "@/lib/api/errors";
import { mockTransport } from "@/lib/api/mock";
import type { Transport } from "@/lib/api/transport";
import { fetchRequirements, fetchTasks } from "./fetch";
import { DEFAULT_QUERY, type DashboardQuery } from "./query";

/** A client over the mock server that records every request as "path?query". */
function recordingClient() {
  const calls: string[] = [];
  const mock = mockTransport({ delayMs: 0 });
  const transport: Transport = {
    send(request) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(request.query ?? {})) if (value !== undefined) params.set(key, value);
      const search = params.toString();
      calls.push(search ? `${request.path}?${search}` : request.path);
      return mock.send(request);
    },
  };
  return { api: createApiClient(transport), calls };
}

const query = (patch: Partial<DashboardQuery>): DashboardQuery => ({ ...DEFAULT_QUERY, ...patch });
const ids = (result: Awaited<ReturnType<typeof fetchRequirements>> | Awaited<ReturnType<typeof fetchTasks>>) =>
  result.ok ? result.data.map((row) => row.id) : result.error;

describe("fetchRequirements", () => {
  it("sends one request with the default sort when nothing is filtered", async () => {
    const { api, calls } = recordingClient();
    expect(ids(await fetchRequirements(DEFAULT_QUERY, api))).toHaveLength(8);
    expect(calls).toEqual(["/requirements?sort=id&order=asc"]);
  });

  it("sends a selected type as a query parameter", async () => {
    const { api, calls } = recordingClient();
    expect(ids(await fetchRequirements(query({ types: ["AR"] }), api))).toEqual(["AR-PERF-001", "AR-SEC-001"]);
    expect(calls).toEqual(["/requirements?type=AR&sort=id&order=asc"]);
  });

  it("omits a group when every value is selected", async () => {
    const { api, calls } = recordingClient();
    await fetchRequirements(query({ types: ["FR", "AR"], statuses: ["covered", "partial", "missing"] }), api);
    expect(calls).toEqual(["/requirements?sort=id&order=asc"]);
  });

  it("sends one request per selected status and merges them in id order", async () => {
    const { api, calls } = recordingClient();
    expect(ids(await fetchRequirements(query({ statuses: ["partial", "covered"] }), api))).toEqual([
      "FR-API-001", "FR-API-002", "FR-API-003", "FR-SCAN-001", "FR-SCAN-002", "FR-SCAN-003",
    ]);
    expect(calls).toEqual(["/requirements?status=partial&sort=id&order=asc", "/requirements?status=covered&sort=id&order=asc"]);
  });

  it("passes sort and order through and re-sorts the merged rows", async () => {
    const { api, calls } = recordingClient();
    const result = await fetchRequirements(query({ statuses: ["partial", "missing"], sort: "updatedAt", order: "desc" }), api);
    expect(ids(result)).toEqual(["AR-SEC-001", "FR-API-003", "AR-PERF-001"]);
    expect(calls).toEqual([
      "/requirements?status=partial&sort=updatedAt&order=desc",
      "/requirements?status=missing&sort=updatedAt&order=desc",
    ]);
  });

  it("never sends the search text", async () => {
    const { api, calls } = recordingClient();
    await fetchRequirements(query({ q: "scan", types: ["FR"] }), api);
    expect(calls).toEqual(["/requirements?type=FR&sort=id&order=asc"]);
  });

  it("de-duplicates rows returned by more than one request", async () => {
    const { api } = recordingClient();
    const all = await api.listRequirements();
    const rows: Requirement[] = all.ok ? all.data : [];
    const result = await fetchRequirements(query({ statuses: ["covered", "partial"] }), {
      listRequirements: async () => ok(rows),
    });
    expect(ids(result)).toHaveLength(8);
  });

  it("returns the first error when any request fails", async () => {
    let call = 0;
    const result = await fetchRequirements(query({ statuses: ["covered", "partial"] }), {
      listRequirements: async () => (++call === 1 ? err({ kind: "network", message: "offline" }) : ok([])),
    });
    expect(result).toEqual({ ok: false, error: { kind: "network", message: "offline" } });
  });
});

describe("fetchTasks", () => {
  it("sends no parameters without a task filter", async () => {
    const { api, calls } = recordingClient();
    expect(ids(await fetchTasks(DEFAULT_QUERY, api))).toHaveLength(6);
    expect(calls).toEqual(["/tasks"]);
  });

  it("sends one request per selected task status and merges them in id order", async () => {
    const { api, calls } = recordingClient();
    const result = await fetchTasks(query({ taskStatuses: ["open", "done"] }), api);
    expect(ids(result)).toEqual(["TASK-001", "TASK-002", "TASK-004", "TASK-005", "TASK-006"]);
    expect(calls).toEqual(["/tasks?status=open", "/tasks?status=done"]);
  });

  it("omits the status when every task status is selected", async () => {
    const { api, calls } = recordingClient();
    await fetchTasks(query({ taskStatuses: ["open", "in_progress", "done"] }), api);
    expect(calls).toEqual(["/tasks"]);
  });

  it("ignores requirement filters", async () => {
    const { api, calls } = recordingClient();
    await fetchTasks(query({ types: ["AR"], statuses: ["missing"] }), api);
    expect(calls).toEqual(["/tasks"]);
  });
});
```

Add to `src/lib/dashboard/format.test.ts` (import `formatLabel` alongside the other format functions):

```ts
describe("formatLabel", () => {
  it("capitalises and replaces underscores", () => {
    expect(["covered", "in_progress", "FR"].map((v) => formatLabel(v))).toEqual(["Covered", "In progress", "FR"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/dashboard`
Expected: FAIL — `Cannot find module './fetch'`; format test fails with `formatLabel is not a function` (or import error).

- [ ] **Step 3: Add `compareRows` to `src/lib/dashboard/query.ts`**

Replace the `compareText` constant and `applyRequirementQuery` with:

```ts
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The API's ordering: text comparison on the sort field, id as tie-break, reversed for desc. */
export function compareRows<T extends { id: string; updatedAt: string }>(
  query: Pick<DashboardQuery, "sort" | "order">,
): (a: T, b: T) => number {
  const direction = query.order === "desc" ? -1 : 1;
  return (a, b) => direction * (compareText(a[query.sort], b[query.sort]) || compareText(a.id, b.id));
}

export function applyRequirementQuery(rows: readonly Requirement[], query: DashboardQuery): Requirement[] {
  const needle = query.q.toLowerCase();
  return rows
    .filter(
      (r) =>
        (query.types.length === 0 || query.types.includes(r.type)) &&
        (query.statuses.length === 0 || query.statuses.includes(r.status)) &&
        (needle === "" || r.id.toLowerCase().includes(needle) || r.title.toLowerCase().includes(needle)),
    )
    .sort(compareRows(query));
}
```

- [ ] **Step 4: Add `formatLabel` to `src/lib/dashboard/format.ts`**

```ts
/** "in_progress" → "In progress", "covered" → "Covered"; already-capitalised values are kept. */
export function formatLabel(value: string): string {
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
```

- [ ] **Step 5: Add status tints to `src/lib/dashboard/coverage.ts`**

Add to `StatusPresentation` (after `color`):

```ts
  /** Soft background token for pills and highlighted rows; text on it is --ink. */
  tint: string;
```

and set `tint: "var(--good-tint)"`, `tint: "var(--warning-tint)"`, `tint: "var(--critical-tint)"` on `covered`, `partial`, `missing`.

- [ ] **Step 6: Write `src/lib/dashboard/fetch.ts`**

```ts
// @req SCD-FLT-001, SCD-FLT-003, SCD-SORT-001, SCD-API-003
// Server-side data for the dashboard: the URL's filters become data-layer query parameters
// (the HTTP query string in API mode). The API takes one value per parameter, so a
// multi-select becomes one request per selected value, merged and re-sorted here.
import { listRequirements, listTasks, type ApiClient, type Requirement, type Result, type Task } from "@/lib/api";
import { ok } from "@/lib/api/errors";
import { COVERAGE_STATUSES, REQUIREMENT_TYPES, TASK_STATUSES } from "./options";
import { compareRows, type DashboardQuery } from "./query";

const defaultApi = { listRequirements, listTasks };

/** Values to request for one group: none or all selected means "no parameter". */
function values<T extends string>(selected: readonly T[], allowed: readonly T[]): (T | undefined)[] {
  return selected.length === 0 || selected.length === allowed.length ? [undefined] : [...selected];
}

async function merge<T extends { id: string }>(requests: Promise<Result<T[]>>[]): Promise<Result<T[]>> {
  const results = await Promise.all(requests);
  const rows: T[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    if (!result.ok) return result;
    for (const row of result.data) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        rows.push(row);
      }
    }
  }
  return ok(rows);
}

export async function fetchRequirements(
  query: DashboardQuery,
  api: Pick<ApiClient, "listRequirements"> = defaultApi,
): Promise<Result<Requirement[]>> {
  const requests = values(query.types, REQUIREMENT_TYPES).flatMap((type) =>
    values(query.statuses, COVERAGE_STATUSES).map((status) =>
      api.listRequirements({ type, status, sort: query.sort, order: query.order }),
    ),
  );
  const result = await merge(requests);
  return result.ok ? ok(result.data.sort(compareRows(query))) : result;
}

export async function fetchTasks(
  query: DashboardQuery,
  api: Pick<ApiClient, "listTasks"> = defaultApi,
): Promise<Result<Task[]>> {
  const requests = values(query.taskStatuses, TASK_STATUSES).map((status) => api.listTasks({ status }));
  const result = await merge(requests);
  return result.ok ? ok(result.data.sort(compareRows({ sort: "id", order: "asc" }))) : result;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test src/lib/dashboard`
Expected: PASS — the 12 new fetch tests and the new format test pass, plus the existing query/format/contrast tests.

- [ ] **Step 8: Update `requirements.yaml`**

Replace the `description` of these entries and add SCD-UI-007 after SCD-UI-006:

```yaml
- id: SCD-UI-001
  type: FR
  title: Summary panel from /stats
  description: >-
    Dashboard MUST fetch GET /stats on load and show, as KPI cards, the overall
    coverage percentage with a progress indicator, the total requirement count
    with the FR and AR counts, and the annotation and task orphan counts with a
    warning indicator only when either is above zero, together with the
    lastScanAt timestamp.

- id: SCD-UI-002
  type: FR
  title: Show coverage breakdown by status
  description: >-
    Summary MUST show the covered, partial and missing counts as numbers and as
    one segmented bar, with text labels so that status is never conveyed by
    color alone.
```

```yaml
- id: SCD-UI-007
  type: AR
  title: Minimalist visual design
  description: >-
    The UI MUST present content in cards on a neutral page, use segmented
    controls for filters and tinted pills for status, and MUST show pending
    feedback (aria-busy and reduced opacity) while filtered data is loading.
```

```yaml
- id: SCD-FLT-001
  type: FR
  title: Filter requirements by type and status
  description: >-
    Requirements list MUST offer multi-select filters for type (FR, AR) and
    coverage status (covered, partial, missing), reflected in the URL as
    repeated query parameters (e.g. ?type=FR&status=missing); the selected
    filters MUST be sent to the data source as query parameters, one request per
    selected value when several are selected and none when all are selected.

- id: SCD-FLT-003
  type: FR
  title: Filter tasks by status
  description: >-
    Tasks panel MUST offer a multi-select task status filter (open, in_progress,
    done), reflected in the URL as repeated taskStatus query parameters and sent
    to GET /tasks as the status query parameter, one request per selected value.

- id: SCD-SORT-001
  type: FR
  title: Sort requirements by id or updatedAt
  description: >-
    Requirements list MUST support sorting by id or updatedAt in ascending or
    descending order, defaulting to id ascending, with the sort reflected in the
    URL and sent to GET /requirements as the sort and order query parameters.
```

- [ ] **Step 9: Full suite, typecheck and commit**

Run: `pnpm test` — Expected: PASS (246 + 13 = 259). Run: `pnpm typecheck` — Expected: exit 0.

```bash
git add requirements.yaml src/lib/dashboard
git commit -m "feat(dashboard): send filters and sort to the data layer as query parameters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Design tokens and UI primitives

**Files:**
- Replace: `src/app/globals.css`, `src/app/theme-contrast.test.ts`
- Create: `src/components/Card.tsx`, `src/components/KpiCard.tsx`, `src/components/SegmentedFilter.tsx`, `src/components/StatusPill.tsx`, `src/components/EmptyState.tsx`
- Modify: `src/components/Header.tsx`, `src/components/ThemeToggle.tsx`, `src/components/ErrorPanel.tsx`, `src/components/LoadingSkeleton.tsx`, `src/app/layout.tsx` (main container)
- Test: `src/components/primitives.test.tsx`

**Interfaces:**
- Consumes: `toggleValue` (query); `STATUS_PRESENTATION` (coverage); `formatLabel`.
- Produces: tokens/utilities `plane surface surface-2 ink ink-2 muted link hairline accent focus good warning critical good-tint warning-tint critical-tint`, `shadow-card`; `Card({ titleId, title, meta?, busy?, children })` (a `<section>` region named by its heading; `busy` → `aria-busy="true"` + dimmed); `KpiCard({ label, value, detail?, className?, children? })` (`role="group"` named `label`); `SegmentedFilter<T>({ label, legend, options, selected, onChange, format? })` ("All" + one `aria-pressed` button per value; `onChange` receives `[]` for "All" or when every value ends up selected); `StatusPill({ status })`; `EmptyState({ title, hint, action? })`.

- [ ] **Step 1: Write the failing tests**

`src/components/primitives.test.tsx`:

```tsx
// @vitest-environment jsdom
// @req SCD-UI-007, SCD-FLT-001, SCD-A11Y-002
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { formatLabel } from "@/lib/dashboard/format";
import { axeViolations } from "@/test/axe";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { SegmentedFilter } from "./SegmentedFilter";
import { StatusPill } from "./StatusPill";

const TYPES = ["FR", "AR"] as const;
const STATUSES = ["covered", "partial", "missing"] as const;

function renderFilter<T extends string>(options: readonly T[], selected: T[]) {
  const onChange = vi.fn<(next: T[]) => void>();
  const view = render(
    <SegmentedFilter label="Filter by x" legend="X" options={options} selected={selected} onChange={onChange} format={formatLabel} />,
  );
  const button = (name: string) => within(screen.getByRole("group", { name: "Filter by x" })).getByRole("button", { name });
  return { onChange, button, ...view };
}

describe("SegmentedFilter", () => {
  it("presses All when nothing is selected", () => {
    const { button } = renderFilter(TYPES, []);
    expect(button("All")).toHaveAttribute("aria-pressed", "true");
    expect(button("FR")).toHaveAttribute("aria-pressed", "false");
  });

  it("adds a value", async () => {
    const { button, onChange } = renderFilter(STATUSES, ["missing"]);
    await userEvent.click(button("Covered"));
    expect(onChange).toHaveBeenCalledWith(["covered", "missing"]);
  });

  it("removes a selected value", async () => {
    const { button, onChange } = renderFilter(STATUSES, ["partial", "missing"]);
    await userEvent.click(button("Partial"));
    expect(onChange).toHaveBeenCalledWith(["missing"]);
  });

  it("treats selecting every value as All", async () => {
    const { button, onChange } = renderFilter(TYPES, ["FR"]);
    await userEvent.click(button("AR"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("clears the group with All", async () => {
    const { button, onChange } = renderFilter(STATUSES, ["missing"]);
    expect(button("All")).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button("All"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("has no axe violations", async () => {
    const { container } = renderFilter(STATUSES, ["partial"]);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("StatusPill", () => {
  it("shows a capitalised label on the status tint", () => {
    render(<StatusPill status="partial" />);
    const pill = screen.getByText("Partial");
    expect(pill).toHaveStyle({ backgroundColor: "var(--warning-tint)" });
  });
});

describe("Card", () => {
  it("is a region named by its title", () => {
    render(<Card titleId="t" title="Requirements">body</Card>);
    expect(screen.getByRole("region", { name: "Requirements" })).not.toHaveAttribute("aria-busy");
  });

  it("marks itself busy while pending", () => {
    render(<Card titleId="t" title="Requirements" busy>body</Card>);
    expect(screen.getByRole("region", { name: "Requirements" })).toHaveAttribute("aria-busy", "true");
  });
});

describe("EmptyState", () => {
  it("shows the title, hint and action", () => {
    render(<EmptyState title="Nothing here" hint="Try again" action={<button type="button">Clear</button>} />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });
});
```

Replace `src/app/theme-contrast.test.ts`:

```ts
// @req SCD-A11Y-001, SCD-THEME-002
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/dashboard/contrast";

const css = readFileSync("src/app/globals.css", "utf8");

function tokens(block: RegExp): Record<string, string> {
  const match = block.exec(css);
  if (!match) throw new Error(`Block ${block} not found in globals.css`);
  const found: Record<string, string> = {};
  for (const [, name, value] of match[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) found[name] = value.trim();
  return found;
}

const light = tokens(/:root\s*\{([^}]*)\}/);
const darkMedia = tokens(/:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/);
const darkToggle = tokens(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/);

const TEXT = ["ink", "ink-2", "muted", "link"];
const BACKGROUNDS = ["surface", "plane", "surface-2"];
const TINTS = ["good-tint", "warning-tint", "critical-tint"];
const textPairs = TEXT.flatMap((text) => BACKGROUNDS.map((background) => [text, background] as const));

describe.each([
  ["light", light],
  ["dark", darkToggle],
])("%s theme", (_theme, t) => {
  it.each(textPairs)("--%s on --%s is at least 4.5:1", (text, background) => {
    expect(contrastRatio(t[text], t[background])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(TINTS)("--ink on --%s is at least 4.5:1", (tint) => {
    expect(contrastRatio(t.ink, t[tint])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("theme tokens", () => {
  it("define the fixed status colours", () => {
    expect([light.good, light.warning, light.critical]).toEqual(["#0ca30c", "#fab219", "#d03b3b"]);
  });

  it("use identical dark values for the OS preference and the toggle", () => {
    expect(darkMedia).toEqual(darkToggle);
  });

  it("are the only colours used by components", () => {
    const files = readdirSync("src/components", { recursive: true, encoding: "utf8" }).filter(
      (f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"),
    );
    const offenders = files.filter((f) =>
      /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(readFileSync(join("src/components", f), "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/components/primitives.test.tsx src/app/theme-contrast.test.ts`
Expected: FAIL — `Cannot find module './Card'` etc.; contrast tests fail with `undefined` colours for `surface-2` and the tints.

- [ ] **Step 3: Replace `src/app/globals.css`**

```css
@import "tailwindcss";

/* @req SCD-THEME-002, SCD-A11Y-001, SCD-UI-007
   Minimalist "soft cards" design. Every colour is a token; components use the utilities
   mapped in @theme. Text tokens (ink, ink-2, muted, link) are >= 4.5:1 on plane, surface and
   surface-2, and --ink is >= 4.5:1 on every tint, in both themes (theme-contrast.test.ts).
   Status colours are fixed across themes and used only for marks, never for text. */

:root {
  color-scheme: light;
  --plane: #fafaf9;
  --surface: #ffffff;
  --surface-2: #f4f4f2;
  --ink: #111110;
  --ink-2: #57564f;
  --muted: #6b6a66;
  --link: #1c5cab;
  --hairline: rgba(17, 17, 16, 0.08);
  --shadow: 0 1px 2px rgba(17, 17, 16, 0.04), 0 1px 3px rgba(17, 17, 16, 0.06);
  --accent: #2a78d6;
  --focus: #2a78d6;
  --good: #0ca30c;
  --warning: #fab219;
  --critical: #d03b3b;
  --good-tint: #e8f6e8;
  --warning-tint: #fdf3dc;
  --critical-tint: #fbe9e9;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --plane: #0e0e0d;
    --surface: #191918;
    --surface-2: #232321;
    --ink: #f5f5f4;
    --ink-2: #c3c2b7;
    --muted: #8d8c86;
    --link: #86b6ef;
    --hairline: rgba(255, 255, 255, 0.08);
    --shadow: none;
    --accent: #3987e5;
    --focus: #3987e5;
    --good-tint: #15291a;
    --warning-tint: #2e2612;
    --critical-tint: #321a1a;
  }
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --plane: #0e0e0d;
  --surface: #191918;
  --surface-2: #232321;
  --ink: #f5f5f4;
  --ink-2: #c3c2b7;
  --muted: #8d8c86;
  --link: #86b6ef;
  --hairline: rgba(255, 255, 255, 0.08);
  --shadow: none;
  --accent: #3987e5;
  --focus: #3987e5;
  --good-tint: #15291a;
  --warning-tint: #2e2612;
  --critical-tint: #321a1a;
}

@theme inline {
  --color-plane: var(--plane);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-ink: var(--ink);
  --color-ink-2: var(--ink-2);
  --color-muted: var(--muted);
  --color-link: var(--link);
  --color-hairline: var(--hairline);
  --color-accent: var(--accent);
  --color-focus: var(--focus);
  --color-good: var(--good);
  --color-warning: var(--warning);
  --color-critical: var(--critical);
  --color-good-tint: var(--good-tint);
  --color-warning-tint: var(--warning-tint);
  --color-critical-tint: var(--critical-tint);
  --shadow-card: var(--shadow);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--plane);
  color: var(--ink);
}

:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Write the primitives**

`src/components/Card.tsx`:

```tsx
// @req SCD-UI-007
import type { ReactNode } from "react";

export function Card({
  titleId,
  title,
  meta,
  busy = false,
  children,
}: {
  titleId: string;
  title: ReactNode;
  meta?: ReactNode;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
      className={`rounded-xl bg-surface p-5 shadow-card transition-opacity ${busy ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={titleId} className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        {meta}
      </div>
      {children}
    </section>
  );
}
```

`src/components/KpiCard.tsx`:

```tsx
// @req SCD-UI-001, SCD-UI-007
import type { ReactNode } from "react";

export function KpiCard({
  label,
  value,
  detail,
  className = "",
  children,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className={`rounded-xl bg-surface p-5 shadow-card ${className}`}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      {detail ? <p className="mt-1 text-sm text-ink-2">{detail}</p> : null}
      {children}
    </div>
  );
}
```

`src/components/SegmentedFilter.tsx`:

```tsx
"use client";
// @req SCD-FLT-001, SCD-FLT-003, SCD-UI-007, SCD-A11Y-001
import type { ReactNode } from "react";
import { toggleValue } from "@/lib/dashboard/query";

export function SegmentedFilter<T extends string>({
  label,
  legend,
  options,
  selected,
  onChange,
  format = (value) => value,
}: {
  /** Accessible group name, e.g. "Filter by type". */
  label: string;
  /** Short visible caption, e.g. "Type". */
  legend: string;
  options: readonly T[];
  selected: readonly T[];
  /** Receives the new selection; [] means "All" (also when every value ends up selected). */
  onChange: (next: T[]) => void;
  format?: (value: T) => string;
}) {
  function toggle(value: T) {
    const next = toggleValue(selected, value, options);
    onChange(next.length === options.length ? [] : next);
  }

  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="text-xs font-medium text-muted">
        {legend}
      </span>
      <div role="group" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-lg bg-surface-2 p-0.5">
        <Segment pressed={selected.length === 0} onClick={() => onChange([])}>
          All
        </Segment>
        {options.map((option) => (
          <Segment key={option} pressed={selected.includes(option)} onClick={() => toggle(option)}>
            {format(option)}
          </Segment>
        ))}
      </div>
    </div>
  );
}

function Segment({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-sm transition-colors ${
        pressed ? "bg-surface font-medium text-ink shadow-card" : "text-ink-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
```

`src/components/StatusPill.tsx`:

```tsx
// @req SCD-UI-003, SCD-UI-007, SCD-A11Y-001
import type { CoverageStatus } from "@/lib/api";
import { STATUS_PRESENTATION } from "@/lib/dashboard/coverage";

export function StatusPill({ status }: { status: CoverageStatus }) {
  const p = STATUS_PRESENTATION[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium text-ink"
      style={{ backgroundColor: p.tint }}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: p.color }} />
      {p.label}
    </span>
  );
}
```

`src/components/EmptyState.tsx`:

```tsx
// @req SCD-STATE-003, SCD-UI-007
import type { ReactNode } from "react";

export function EmptyState({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="mt-4 flex flex-col items-center gap-1 rounded-lg bg-plane px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      <p className="text-sm text-ink-2">{hint}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
```

- [ ] **Step 5: Restyle the header, toggle, error panel, skeleton and main container**

`src/components/Header.tsx` — replace the returned JSX:

```tsx
    <header className="sticky top-0 z-10 border-b border-hairline bg-plane/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <h1 className="text-base font-semibold tracking-tight">
          <Link href="/">SDD Navigator</Link>
        </h1>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">
          {dataMode === "api" ? "Live API" : "Mock data"}
        </span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
```

`src/components/ThemeToggle.tsx` — replace the button's `className` with:

```tsx
      className="rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
```

`src/components/ErrorPanel.tsx` — replace the returned JSX:

```tsx
    <div role="alert" className="rounded-xl border-l-4 border-critical bg-surface p-5 shadow-card">
      <p className="font-semibold">
        <span aria-hidden="true">✕ </span>
        {title}
      </p>
      <p className="mt-1 text-sm text-ink-2">{error.message}</p>
      {error.kind === "invalid_response" && error.issues.length > 0 ? (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer">Details</summary>
          <ul className="mt-1 list-disc pl-5 font-mono text-xs">
            {error.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <button
        type="button"
        onClick={() => router.refresh()}
        className="mt-3 rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink hover:text-ink-2"
      >
        Retry
      </button>
    </div>
```

`src/components/LoadingSkeleton.tsx` — replace the returned JSX:

```tsx
    <div role="status" className="grid grid-cols-1 gap-4">
      <span className="sr-only">{label}</span>
      {Array.from({ length: blocks }, (_, index) => (
        <div key={index} aria-hidden="true" className="h-28 animate-pulse rounded-xl bg-surface shadow-card" />
      ))}
    </div>
```

`src/app/layout.tsx` — replace the `<main>` element's `className` with `"mx-auto w-full max-w-6xl px-4 py-8 sm:px-6"`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test src/components/primitives.test.tsx src/app/theme-contrast.test.ts src/components/header.test.tsx src/components/theme-toggle.test.tsx src/components/error-panel.test.tsx`
Expected: PASS — 10 primitives tests; theme-contrast 2 × (12 + 3) + 3 = 33; header, toggle and error-panel tests unchanged and passing.

- [ ] **Step 7: Full suite, typecheck and commit**

Run: `pnpm test` — Expected: PASS (the not-yet-restyled components still pass their tests; some of their utility classes now have no token, which Task 3–5 replace). Run: `pnpm typecheck` — Expected: exit 0.

```bash
git add src/app/globals.css src/app/theme-contrast.test.ts src/app/layout.tsx src/components/Card.tsx src/components/KpiCard.tsx src/components/SegmentedFilter.tsx src/components/StatusPill.tsx src/components/EmptyState.tsx src/components/Header.tsx src/components/ThemeToggle.tsx src/components/ErrorPanel.tsx src/components/LoadingSkeleton.tsx src/components/primitives.test.tsx
git commit -m "feat(ui): add minimalist design tokens and ui primitives

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: URL state with pending feedback; requirements table and tasks panel

**Files:**
- Replace: `src/test/navigation.ts`, `src/components/useDashboardQuery.ts`, `src/components/RequirementsTable.tsx`, `src/components/TasksPanel.tsx`
- Replace: `src/components/requirements-table.test.tsx`, `src/components/tasks-panel.test.tsx`
- Delete: `src/components/FilterChips.tsx`, `src/components/StatusBadge.tsx`

**Interfaces:**
- Consumes: `Card`, `SegmentedFilter`, `StatusPill`, `EmptyState` (Task 2); `applyRequirementQuery`, `applyTaskQuery`, `parseDashboardQuery`, `serializeDashboardQuery` (query); `formatDate`, `formatLabel`.
- Produces: `useDashboardQuery(): { query: DashboardQuery; isPending: boolean; update(patch: Partial<DashboardQuery>): void; setSearchText(q: string): void }`; `RequirementsTable({ requirements, total }: { requirements: Requirement[]; total: number })`; `TasksPanel({ tasks, total, orphanTaskIds }: { tasks: Task[]; total: number; orphanTaskIds: string[] })`; test navigation helpers `setSearch`, `resetNavigation`, `commitNavigation`, `lastNavigation`, `lastHref`, spies `replace`, `refresh`, `push`, `historyReplace`.

- [ ] **Step 1: Replace the navigation test double — `src/test/navigation.ts`**

```ts
// @req SCD-FLT-001
// Test double for next/navigation (jsdom only), modelling what the dashboard relies on:
// - router.replace starts a server navigation whose URL change only lands later; tests
//   land it explicitly with commitNavigation().
// - window.history.replaceState changes the URL immediately and useSearchParams follows it.
import { useSyncExternalStore } from "react";
import { vi } from "vitest";

const listeners = new Set<() => void>();
const realReplaceState = window.history.replaceState.bind(window.history);
let pendingHref: string | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

export const historyReplace = vi.fn((...args: Parameters<History["replaceState"]>) => {
  realReplaceState(...args);
  notify();
});
window.history.replaceState = historyReplace;

/** Simulates a URL change from outside the component (link click, back button, shared link). */
export function setSearch(next: string): void {
  realReplaceState(null, "", `/${next === "" || next.startsWith("?") ? next : `?${next}`}`);
  notify();
}

export const replace = vi.fn((...args: [href: string, options?: { scroll?: boolean }]) => {
  pendingHref = args[0];
});
export const refresh = vi.fn();
export const push = vi.fn();

/** Lands the last router.replace navigation, as the server response would. */
export function commitNavigation(): void {
  if (pendingHref === null) return;
  realReplaceState(null, "", pendingHref);
  pendingHref = null;
  notify();
}

/** The last href passed to router.replace. */
export function lastNavigation(): string | undefined {
  return replace.mock.lastCall?.[0];
}

/** The last URL written with history.replaceState. */
export function lastHref(): string | undefined {
  const url = historyReplace.mock.lastCall?.[2];
  return url === undefined || url === null ? undefined : String(url);
}

export function resetNavigation(): void {
  realReplaceState(null, "", "/");
  pendingHref = null;
  historyReplace.mockClear();
  replace.mockClear();
  refresh.mockClear();
  push.mockClear();
}

export const navigationMock = {
  useSearchParams: () =>
    new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search, () => "")),
  useRouter: () => ({ replace, refresh, push, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  notFound: (): never => {
    throw new Error("NEXT_NOT_FOUND");
  },
};
```

- [ ] **Step 2: Write the failing tests**

`src/components/requirements-table.test.tsx`:

```tsx
// @vitest-environment jsdom
// @req SCD-UI-003, SCD-UI-007, SCD-FLT-001, SCD-FLT-002, SCD-SORT-001, SCD-STATE-003, SCD-A11Y-002
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Requirement } from "@/lib/api";
import { axeViolations } from "@/test/axe";
import { loadFixtures } from "@/test/fixtures";
import { commitNavigation, lastHref, lastNavigation, replace, resetNavigation, setSearch } from "@/test/navigation";
import { RequirementsTable } from "./RequirementsTable";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);

let requirements: Requirement[];

beforeAll(async () => {
  ({ requirements } = await loadFixtures());
});

beforeEach(() => {
  resetNavigation();
});

function renderTable(search = "", rows: Requirement[] = requirements, total = 8) {
  setSearch(search);
  return render(<RequirementsTable requirements={rows} total={total} />);
}

const region = () => screen.getByRole("region", { name: "Requirements" });
const rowIds = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
const segment = (group: string, name: string) =>
  within(screen.getByRole("group", { name: group })).getByRole("button", { name });

describe("RequirementsTable", () => {
  it("renders the rows it is given, sorted by id", () => {
    renderTable();
    expect(rowIds()).toEqual([
      "AR-PERF-001", "AR-SEC-001", "FR-API-001", "FR-API-002",
      "FR-API-003", "FR-SCAN-001", "FR-SCAN-002", "FR-SCAN-003",
    ]);
    expect(within(screen.getAllByRole("row")[1]).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "AR-PERF-001", "AR", "Scan completes under 5s for 10k files", "Missing", "10 Feb 2026",
    ]);
    expect(screen.getByText("Showing 8 of 8 requirements")).toBeInTheDocument();
  });

  it("counts against the project total", () => {
    renderTable("?type=AR", requirements.filter((r) => r.type === "AR"));
    expect(screen.getByText("Showing 2 of 8 requirements")).toBeInTheDocument();
  });

  it("requests a filter from the server and shows it as pending until the URL lands", async () => {
    renderTable();
    await userEvent.click(segment("Filter by type", "FR"));
    expect(replace).toHaveBeenLastCalledWith("/?type=FR", { scroll: false });
    expect(segment("Filter by type", "FR")).toHaveAttribute("aria-pressed", "true");
    expect(region()).toHaveAttribute("aria-busy", "true");
    expect(rowIds()).toHaveLength(6);
    act(() => commitNavigation());
    expect(region()).not.toHaveAttribute("aria-busy");
    expect(segment("Filter by type", "FR")).toHaveAttribute("aria-pressed", "true");
  });

  it("composes quick consecutive clicks before the URL lands", async () => {
    renderTable();
    await userEvent.click(segment("Filter by type", "FR"));
    await userEvent.click(segment("Filter by coverage status", "Partial"));
    await userEvent.click(segment("Filter by coverage status", "Missing"));
    expect(lastNavigation()).toBe("/?type=FR&status=partial&status=missing");
    expect(rowIds()).toEqual(["FR-API-003"]);
  });

  it("clears a group with All", async () => {
    renderTable("?status=missing", requirements.filter((r) => r.status === "missing"));
    await userEvent.click(segment("Filter by coverage status", "All"));
    expect(lastNavigation()).toBe("/");
  });

  it("treats selecting every type as All", async () => {
    renderTable("?type=FR", requirements.filter((r) => r.type === "FR"));
    await userEvent.click(segment("Filter by type", "AR"));
    expect(lastNavigation()).toBe("/");
    expect(segment("Filter by type", "All")).toHaveAttribute("aria-pressed", "true");
  });

  it("does not navigate when nothing changes", async () => {
    renderTable();
    await userEvent.click(segment("Filter by type", "All"));
    expect(replace).not.toHaveBeenCalled();
    expect(region()).not.toHaveAttribute("aria-busy");
  });

  it("clears the pending state when the URL changes elsewhere", async () => {
    renderTable();
    await userEvent.click(segment("Filter by type", "FR"));
    expect(region()).toHaveAttribute("aria-busy", "true");
    act(() => setSearch("?status=missing"));
    expect(region()).not.toHaveAttribute("aria-busy");
    expect(segment("Filter by coverage status", "Missing")).toHaveAttribute("aria-pressed", "true");
  });

  it("restores and ignores URL values", () => {
    renderTable("?type=AR&status=missing&status=bogus&sort=title");
    expect(segment("Filter by type", "AR")).toHaveAttribute("aria-pressed", "true");
    expect(segment("Filter by coverage status", "Missing")).toHaveAttribute("aria-pressed", "true");
    expect(segment("Filter by coverage status", "Covered")).toHaveAttribute("aria-pressed", "false");
  });

  it("searches in the browser without a server navigation", async () => {
    renderTable();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "scan");
    expect(rowIds()).toEqual(["AR-PERF-001", "AR-SEC-001", "FR-SCAN-001", "FR-SCAN-002", "FR-SCAN-003"]);
    expect(lastHref()).toBe("/?q=scan");
    expect(replace).not.toHaveBeenCalled();
  });

  it("keeps the search text when a filter changes", async () => {
    renderTable();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "scan");
    await userEvent.click(segment("Filter by type", "FR"));
    expect(lastNavigation()).toBe("/?q=scan&type=FR");
    expect(rowIds()).toEqual(["FR-SCAN-001", "FR-SCAN-002", "FR-SCAN-003"]);
  });

  it("follows the search text when the URL changes from outside", () => {
    renderTable("?q=scan");
    const searchbox = screen.getByRole("searchbox", { name: "Search" });
    expect(searchbox).toHaveValue("scan");
    act(() => setSearch(""));
    expect(searchbox).toHaveValue("");
  });

  it("sorts immediately and requests the sort from the server", async () => {
    renderTable();
    await userEvent.click(screen.getByRole("button", { name: "Sort by Updated" }));
    expect(lastNavigation()).toBe("/?sort=updatedAt");
    expect(rowIds()).toEqual([
      "AR-PERF-001", "FR-API-003", "AR-SEC-001", "FR-API-002",
      "FR-SCAN-001", "FR-SCAN-003", "FR-API-001", "FR-SCAN-002",
    ]);
    expect(screen.getByRole("columnheader", { name: "Updated" })).toHaveAttribute("aria-sort", "ascending");
    act(() => commitNavigation());
    await userEvent.click(screen.getByRole("button", { name: "Sort by Updated" }));
    expect(lastNavigation()).toBe("/?sort=updatedAt&order=desc");
    expect(rowIds()[0]).toBe("FR-SCAN-002");
  });

  it("shows an empty state that clears the filters", async () => {
    renderTable("?type=AR&status=covered", []);
    expect(screen.getByText("No requirements match these filters")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(lastNavigation()).toBe("/");
  });

  it("links to detail pages with the current filters, encoding ids", () => {
    renderTable("?type=FR&sort=updatedAt", [...requirements.filter((r) => r.type === "FR"), { ...requirements[2], id: "FR-X Y-001" }]);
    expect(screen.getByRole("link", { name: "FR-API-001" })).toHaveAttribute("href", "/requirements/FR-API-001?type=FR&sort=updatedAt");
    expect(screen.getByRole("link", { name: "FR-X Y-001" })).toHaveAttribute("href", "/requirements/FR-X%20Y-001?type=FR&sort=updatedAt");
  });

  it("has no axe violations", async () => {
    const { container } = renderTable("?type=FR", requirements.filter((r) => r.type === "FR"));
    expect(await axeViolations(container)).toEqual([]);
  });
});
```

`src/components/tasks-panel.test.tsx`:

```tsx
// @vitest-environment jsdom
// @req SCD-UI-005, SCD-UI-007, SCD-FLT-003, SCD-STATE-003, SCD-A11Y-002
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/api";
import { axeViolations } from "@/test/axe";
import { loadFixtures } from "@/test/fixtures";
import { commitNavigation, lastNavigation, resetNavigation, setSearch } from "@/test/navigation";
import { TasksPanel } from "./TasksPanel";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);

let tasks: Task[];
let orphanTaskIds: string[];

beforeAll(async () => {
  const fixtures = await loadFixtures();
  tasks = fixtures.tasks;
  orphanTaskIds = fixtures.orphanTasks.map((t) => t.id);
});

beforeEach(() => {
  resetNavigation();
});

function renderPanel(search = "", rows: Task[] = tasks) {
  setSearch(search);
  return render(<TasksPanel tasks={rows} total={6} orphanTaskIds={orphanTaskIds} />);
}

const region = () => screen.getByRole("region", { name: "Tasks" });
const rowIds = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
const row = (id: string) => screen.getByRole("row", { name: new RegExp(`^${id}\\b`) });
const segment = (name: string) =>
  within(screen.getByRole("group", { name: "Filter by task status" })).getByRole("button", { name });

describe("TasksPanel", () => {
  it("renders every task with its columns", () => {
    renderPanel();
    expect(rowIds()).toEqual(["TASK-001", "TASK-002", "TASK-003", "TASK-004", "TASK-005", "TASK-006"]);
    expect(within(row("TASK-003")).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "TASK-003", "FR-API-001", "Add filtering to requirements endpoint", "In progress", "maria",
    ]);
    expect(screen.getByText("Showing 6 of 6 tasks")).toBeInTheDocument();
  });

  it("highlights orphan tasks with a text marker and no requirement link", () => {
    renderPanel();
    expect(row("TASK-006")).toHaveAttribute("data-orphan", "true");
    expect(within(row("TASK-006")).getByText("⚠ Orphan")).toBeInTheDocument();
    expect(within(row("TASK-006")).queryByRole("link")).toBeNull();
    expect(within(row("TASK-001")).getByRole("link", { name: "FR-SCAN-001" })).toBeInTheDocument();
  });

  it("marks unassigned tasks", () => {
    renderPanel();
    expect(within(row("TASK-004")).getByText("Unassigned")).toBeInTheDocument();
  });

  it("requests a status filter from the server with pending feedback", async () => {
    renderPanel();
    await userEvent.click(segment("Open"));
    expect(lastNavigation()).toBe("/?taskStatus=open");
    expect(segment("Open")).toHaveAttribute("aria-pressed", "true");
    expect(region()).toHaveAttribute("aria-busy", "true");
    expect(rowIds()).toEqual(["TASK-004", "TASK-005", "TASK-006"]);
    act(() => commitNavigation());
    expect(region()).not.toHaveAttribute("aria-busy");
  });

  it("restores a multi-select filter from the URL", () => {
    renderPanel("?taskStatus=done&taskStatus=in_progress", tasks.filter((t) => t.status !== "open"));
    expect(segment("Done")).toHaveAttribute("aria-pressed", "true");
    expect(segment("In progress")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Showing 3 of 6 tasks")).toBeInTheDocument();
  });

  it("keeps the requirement filters when filtering tasks", async () => {
    renderPanel("?type=FR");
    await userEvent.click(segment("Done"));
    expect(lastNavigation()).toBe("/?type=FR&taskStatus=done");
  });

  it("links requirement ids with the current query", () => {
    renderPanel("?type=FR");
    expect(screen.getByRole("link", { name: "FR-SCAN-001" })).toHaveAttribute("href", "/requirements/FR-SCAN-001?type=FR");
  });

  it("shows an empty state that clears the filter", async () => {
    renderPanel("?taskStatus=done", []);
    expect(screen.getByText("No tasks match this filter")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(lastNavigation()).toBe("/");
  });

  it("has no axe violations", async () => {
    const { container } = renderPanel();
    expect(await axeViolations(container)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test src/components/requirements-table.test.tsx src/components/tasks-panel.test.tsx`
Expected: FAIL — `total` prop unused / segmented groups missing ("Unable to find … role "button" and name "All""), `region` not found, `replace` never called.

- [ ] **Step 4: Replace `src/components/useDashboardQuery.ts`**

```ts
"use client";
// @req SCD-FLT-001, SCD-FLT-002, SCD-FLT-003, SCD-SORT-001, SCD-UI-007
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { parseDashboardQuery, serializeDashboardQuery, type DashboardQuery } from "@/lib/dashboard/query";

/**
 * Dashboard view state from the URL.
 * - update(): filters and sort are fetched on the server, so they navigate with router.replace.
 *   The requested state is shown immediately (pending) and consecutive changes build on it;
 *   it clears as soon as the URL changes — when the navigation lands, or anything else moves it.
 * - setSearchText(): search is applied in the browser, so it only rewrites the URL in place.
 */
export function useDashboardQuery() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const urlQuery = parseDashboardQuery(params);
  const urlKey = serializeDashboardQuery(urlQuery);

  const [pending, setPending] = useState<DashboardQuery | null>(null);
  const [seenKey, setSeenKey] = useState(urlKey);
  if (urlKey !== seenKey) {
    setSeenKey(urlKey);
    setPending(null);
  }

  const query = pending ?? urlQuery;

  function update(patch: Partial<DashboardQuery>): void {
    const next = { ...query, ...patch };
    const nextKey = serializeDashboardQuery(next);
    if (nextKey === urlKey) {
      setPending(null);
      return;
    }
    setPending(next);
    router.replace(`${pathname}${nextKey}`, { scroll: false });
  }

  function setSearchText(q: string): void {
    window.history.replaceState(null, "", `${pathname}${serializeDashboardQuery({ ...query, q })}`);
  }

  return { query, isPending: pending !== null, update, setSearchText };
}
```

- [ ] **Step 5: Replace `src/components/RequirementsTable.tsx`**

```tsx
"use client";
// @req SCD-UI-003, SCD-UI-007, SCD-FLT-001, SCD-FLT-002, SCD-SORT-001, SCD-STATE-003, SCD-A11Y-001
import Link from "next/link";
import { useState } from "react";
import type { Requirement, SortField, SortOrder } from "@/lib/api";
import { formatDate, formatLabel } from "@/lib/dashboard/format";
import { COVERAGE_STATUSES, REQUIREMENT_TYPES } from "@/lib/dashboard/options";
import { applyRequirementQuery, serializeDashboardQuery, type DashboardQuery } from "@/lib/dashboard/query";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { SegmentedFilter } from "./SegmentedFilter";
import { StatusPill } from "./StatusPill";
import { useDashboardQuery } from "./useDashboardQuery";

export function RequirementsTable({ requirements, total }: { requirements: Requirement[]; total: number }) {
  const { query, isPending, update, setSearchText } = useDashboardQuery();
  // Local text keeps typing responsive; it adopts the URL's q when that changes from outside.
  const [search, setSearch] = useState(query.q);
  const [syncedQ, setSyncedQ] = useState(query.q);
  if (query.q !== syncedQ) {
    setSyncedQ(query.q);
    setSearch(query.q);
  }

  const effective: DashboardQuery = { ...query, q: search.trim() };
  // The server already applied the URL's filters; applying the pending ones here too makes
  // narrowing instant while the server re-fetches.
  const rows = applyRequirementQuery(requirements, effective);
  const linkQuery = serializeDashboardQuery(effective);
  const filtered = effective.q !== "" || query.types.length > 0 || query.statuses.length > 0;

  const set = (patch: Partial<DashboardQuery>) => update({ q: effective.q, ...patch });

  function sortBy(field: SortField) {
    set(query.sort === field ? { order: query.order === "asc" ? "desc" : "asc" } : { sort: field, order: "asc" });
  }

  function clearFilters() {
    setSearch("");
    update({ q: "", types: [], statuses: [] });
  }

  return (
    <Card
      titleId="requirements-heading"
      title="Requirements"
      busy={isPending}
      meta={
        <p aria-live="polite" className="text-sm text-muted">
          Showing {rows.length} of {total} requirements
        </p>
      }
    >
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <label className="w-full sm:w-64">
          <span className="sr-only">Search</span>
          <input
            type="search"
            value={search}
            placeholder="Search ID or title"
            onChange={(event) => {
              setSearch(event.target.value);
              setSearchText(event.target.value.trim());
            }}
            className="w-full rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-muted"
          />
        </label>
        <SegmentedFilter
          label="Filter by type"
          legend="Type"
          options={REQUIREMENT_TYPES}
          selected={query.types}
          onChange={(types) => set({ types })}
        />
        <SegmentedFilter
          label="Filter by coverage status"
          legend="Status"
          options={COVERAGE_STATUSES}
          selected={query.statuses}
          onChange={(statuses) => set({ statuses })}
          format={formatLabel}
        />
        {filtered && rows.length > 0 ? (
          <button type="button" onClick={clearFilters} className="text-sm text-link hover:underline">
            Clear filters
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No requirements match these filters"
          hint="Try removing a filter or changing the search."
          action={
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink hover:text-ink-2"
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <div className="relative mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Requirements</caption>
            <thead>
              <tr className="text-xs text-muted">
                <SortHeader field="id" label="ID" sort={query.sort} order={query.order} onSort={sortBy} />
                <th scope="col" className="px-3 py-2 font-medium">
                  Type
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Title
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Status
                </th>
                <SortHeader field="updatedAt" label="Updated" sort={query.sort} order={query.order} onSort={sortBy} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-hairline transition-colors hover:bg-plane">
                  <td className="px-3 py-3 font-mono whitespace-nowrap">
                    <Link href={`/requirements/${encodeURIComponent(r.id)}${linkQuery}`} className="text-link hover:underline">
                      {r.id}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-ink-2">{r.type}</td>
                  <td className="px-3 py-3">{r.title}</td>
                  <td className="px-3 py-3">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap tabular-nums text-muted">
                    <time dateTime={r.updatedAt}>{formatDate(r.updatedAt)}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SortHeader({
  field,
  label,
  sort,
  order,
  onSort,
}: {
  field: SortField;
  label: string;
  sort: SortField;
  order: SortOrder;
  onSort: (field: SortField) => void;
}) {
  const active = sort === field;
  return (
    <th
      scope="col"
      aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"}
      className="px-3 py-2 font-medium"
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        aria-label={`Sort by ${label}`}
        className="inline-flex items-center gap-1 hover:text-ink"
      >
        {label}
        {active ? <span aria-hidden="true">{order === "asc" ? "↑" : "↓"}</span> : null}
      </button>
    </th>
  );
}
```

- [ ] **Step 6: Replace `src/components/TasksPanel.tsx`**

```tsx
"use client";
// @req SCD-UI-005, SCD-UI-007, SCD-FLT-003, SCD-STATE-003, SCD-A11Y-001
import Link from "next/link";
import type { Task } from "@/lib/api";
import { formatLabel } from "@/lib/dashboard/format";
import { TASK_STATUSES } from "@/lib/dashboard/options";
import { applyTaskQuery, serializeDashboardQuery } from "@/lib/dashboard/query";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { SegmentedFilter } from "./SegmentedFilter";
import { useDashboardQuery } from "./useDashboardQuery";

const HEADERS = ["ID", "Requirement", "Title", "Status", "Assignee"];

export function TasksPanel({ tasks, total, orphanTaskIds }: { tasks: Task[]; total: number; orphanTaskIds: string[] }) {
  const { query, isPending, update } = useDashboardQuery();
  const rows = applyTaskQuery(tasks, query);
  const orphans = new Set(orphanTaskIds);
  const linkQuery = serializeDashboardQuery(query);

  return (
    <Card
      titleId="tasks-heading"
      title="Tasks"
      busy={isPending}
      meta={
        <p aria-live="polite" className="text-sm text-muted">
          Showing {rows.length} of {total} tasks
        </p>
      }
    >
      <div className="mt-4">
        <SegmentedFilter
          label="Filter by task status"
          legend="Status"
          options={TASK_STATUSES}
          selected={query.taskStatuses}
          onChange={(taskStatuses) => update({ taskStatuses })}
          format={formatLabel}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No tasks match this filter"
          hint="Choose another status or show all tasks."
          action={
            <button
              type="button"
              onClick={() => update({ taskStatuses: [] })}
              className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink hover:text-ink-2"
            >
              Clear filter
            </button>
          }
        />
      ) : (
        <div className="relative mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Tasks</caption>
            <thead>
              <tr className="text-xs text-muted">
                {HEADERS.map((header) => (
                  <th key={header} scope="col" className="px-3 py-2 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const orphan = orphans.has(t.id);
                return (
                  <tr
                    key={t.id}
                    data-orphan={orphan || undefined}
                    className={`border-t border-hairline ${orphan ? "bg-critical-tint" : "transition-colors hover:bg-plane"}`}
                  >
                    <td className="px-3 py-3 font-mono whitespace-nowrap">{t.id}</td>
                    <td className="px-3 py-3 font-mono whitespace-nowrap">
                      {orphan ? (
                        <>
                          {t.requirementId}{" "}
                          <span className="ml-1 rounded-full bg-surface px-2 py-0.5 font-sans text-xs font-medium text-ink">
                            ⚠ Orphan
                          </span>
                        </>
                      ) : (
                        <Link
                          href={`/requirements/${encodeURIComponent(t.requirementId)}${linkQuery}`}
                          className="text-link hover:underline"
                        >
                          {t.requirementId}
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-3">{t.title}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-ink-2">{formatLabel(t.status)}</td>
                    <td className="px-3 py-3 text-ink-2">
                      {t.assignee ?? (
                        <>
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">Unassigned</span>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 7: Delete the replaced components**

```bash
git rm src/components/FilterChips.tsx src/components/StatusBadge.tsx
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm test src/components/requirements-table.test.tsx src/components/tasks-panel.test.tsx`
Expected: PASS — 16 + 9 tests.

- [ ] **Step 9: Typecheck and commit**

Run: `pnpm typecheck` — Expected: errors only in `src/app/page.tsx` (missing `total` props), fixed in Task 5. **Ruling in advance:** to keep every commit green, add `total={requirements.data.length}` to `<RequirementsTable>` and `total={tasks.data.length}` to `<TasksPanel>` in `src/app/page.tsx` now; Task 5 replaces the page anyway. Re-run `pnpm typecheck` — Expected: exit 0. Run `pnpm test` — Expected: PASS.

```bash
git add src/test/navigation.ts src/components/useDashboardQuery.ts src/components/RequirementsTable.tsx src/components/TasksPanel.tsx src/components/requirements-table.test.tsx src/components/tasks-panel.test.tsx src/app/page.tsx
git commit -m "feat(ui): restyle tables with segmented filters and pending server-side filtering

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Summary as KPI cards

**Files:**
- Create: `src/components/summary/CoverageBar.tsx`
- Replace: `src/components/summary/SummaryPanel.tsx`, `src/components/summary/summary.test.tsx`
- Delete: `src/components/summary/StatTile.tsx`, `src/components/summary/CoverageMeter.tsx`, `src/components/summary/StatusBars.tsx`

**Interfaces:**
- Consumes: `KpiCard` (Task 2); `STATUS_PRESENTATION`, `share`; `formatPercent`, `formatDateTime`; `COVERAGE_STATUSES`.
- Produces: `SummaryPanel({ stats }: { stats: Stats })` (section named "Coverage overview"); `CoverageBar({ byStatus, total, coverage })` (`role="meter"` named "Coverage").

- [ ] **Step 1: Write the failing tests — replace `src/components/summary/summary.test.tsx`**

```tsx
// @vitest-environment jsdom
// @req SCD-UI-001, SCD-UI-002, SCD-UI-007, SCD-A11Y-002
import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import type { Stats } from "@/lib/api";
import { axeViolations } from "@/test/axe";
import { loadFixtures } from "@/test/fixtures";
import { SummaryPanel } from "./SummaryPanel";

let stats: Stats;

beforeAll(async () => {
  ({ stats } = await loadFixtures());
});

const card = (name: string) => within(screen.getByRole("group", { name }));
const segment = (container: HTMLElement, status: string) => container.querySelector(`[data-status="${status}"]`);

describe("SummaryPanel", () => {
  it("shows the overview heading and the last scan", () => {
    render(<SummaryPanel stats={stats} />);
    expect(screen.getByRole("heading", { level: 2, name: "Coverage overview" })).toBeInTheDocument();
    expect(screen.getByText("Last scan 1 Mar 2026, 10:15 UTC")).toBeInTheDocument();
  });

  it("shows requirement, annotation and task counts", () => {
    render(<SummaryPanel stats={stats} />);
    expect(card("Coverage").getByText("62.5%")).toBeInTheDocument();
    expect(card("Coverage").getByText("5 of 8 requirements fully covered")).toBeInTheDocument();
    expect(card("Requirements").getByText("8")).toBeInTheDocument();
    expect(card("Requirements").getByText("6 FR · 2 AR")).toBeInTheDocument();
    expect(card("Orphans").getByText("3")).toBeInTheDocument();
    expect(card("Orphans").getByText("2 of 16 annotations · 1 of 6 tasks")).toBeInTheDocument();
    expect(card("Orphans").getByText("⚠ Needs attention")).toBeInTheDocument();
    expect(card("Orphans").getByRole("link", { name: "Review →" })).toHaveAttribute("href", "#orphans");
  });

  it("shows coverage as a meter with one segment per status", () => {
    const { container } = render(<SummaryPanel stats={stats} />);
    expect(screen.getByRole("meter", { name: "Coverage" })).toHaveAttribute("aria-valuenow", "62.5");
    expect(card("Coverage").getByText("5 covered · 1 partial · 2 missing")).toBeInTheDocument();
    expect(segment(container, "covered")).toHaveStyle({ flexGrow: "5" });
    expect(segment(container, "partial")).toHaveStyle({ flexGrow: "1" });
    expect(segment(container, "missing")).toHaveStyle({ flexGrow: "2" });
  });

  it("renders 0% coverage", () => {
    const none: Stats = { ...stats, coverage: 0, requirements: { ...stats.requirements, byStatus: { missing: 8 } } };
    const { container } = render(<SummaryPanel stats={none} />);
    expect(card("Coverage").getByText("0%")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Coverage" })).toHaveAttribute("aria-valuenow", "0");
    expect(segment(container, "covered")).toBeNull();
    expect(segment(container, "missing")).toHaveStyle({ flexGrow: "8" });
  });

  it("renders 100% coverage without orphans", () => {
    const full: Stats = {
      ...stats,
      coverage: 100,
      requirements: { ...stats.requirements, byStatus: { covered: 8 } },
      annotations: { ...stats.annotations, orphans: 0 },
      tasks: { ...stats.tasks, orphans: 0 },
    };
    render(<SummaryPanel stats={full} />);
    expect(card("Coverage").getByText("100%")).toBeInTheDocument();
    expect(card("Orphans").getByText("None")).toBeInTheDocument();
    expect(card("Orphans").queryByText("⚠ Needs attention")).toBeNull();
    expect(card("Orphans").queryByRole("link")).toBeNull();
  });

  it("renders an empty project without NaN", () => {
    const empty: Stats = {
      requirements: { total: 0, byType: {}, byStatus: {} },
      annotations: { total: 0, impl: 0, test: 0, orphans: 0 },
      tasks: { total: 0, byStatus: {}, orphans: 0 },
      coverage: 0,
      lastScanAt: "2026-03-01T10:15:00Z",
    };
    const { container } = render(<SummaryPanel stats={empty} />);
    expect(card("Requirements").getByText("0 FR · 0 AR")).toBeInTheDocument();
    expect(card("Coverage").getByText("0 covered · 0 partial · 0 missing")).toBeInTheDocument();
    expect(container.textContent).not.toContain("NaN");
  });

  it("has no axe violations", async () => {
    const { container } = render(<SummaryPanel stats={stats} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/components/summary`
Expected: FAIL — no "Coverage overview" heading, groups named "Coverage"/"Orphans" lack the new text.

- [ ] **Step 3: Write `src/components/summary/CoverageBar.tsx`**

```tsx
// @req SCD-UI-001, SCD-UI-002, SCD-A11Y-001
import { STATUS_PRESENTATION, share } from "@/lib/dashboard/coverage";
import { formatPercent } from "@/lib/dashboard/format";
import { COVERAGE_STATUSES } from "@/lib/dashboard/options";

export function CoverageBar({
  byStatus,
  total,
  coverage,
}: {
  byStatus: Record<string, number>;
  total: number;
  coverage: number;
}) {
  const rows = COVERAGE_STATUSES.map((status) => ({ status, count: byStatus[status] ?? 0 }));
  const value = Math.min(100, Math.max(0, coverage));
  return (
    <>
      <div
        role="meter"
        aria-label="Coverage"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={`${formatPercent(value)} fully covered`}
        className="mt-4 flex h-2 gap-0.5"
      >
        {total === 0 ? (
          <span className="h-full flex-1 rounded-full bg-surface-2" />
        ) : (
          rows
            .filter((row) => row.count > 0)
            .map((row) => (
              <span
                key={row.status}
                data-status={row.status}
                title={`${STATUS_PRESENTATION[row.status].label}: ${row.count} of ${total} (${formatPercent(share(row.count, total))})`}
                className="h-full rounded-full"
                style={{ flexGrow: row.count, flexBasis: 0, backgroundColor: STATUS_PRESENTATION[row.status].color }}
              />
            ))
        )}
      </div>
      <p className="mt-2 text-sm text-ink-2">{rows.map((row) => `${row.count} ${row.status}`).join(" · ")}</p>
    </>
  );
}
```

- [ ] **Step 4: Replace `src/components/summary/SummaryPanel.tsx`**

```tsx
// @req SCD-UI-001, SCD-UI-002, SCD-UI-007
import type { Stats } from "@/lib/api";
import { formatDateTime, formatPercent } from "@/lib/dashboard/format";
import { KpiCard } from "../KpiCard";
import { CoverageBar } from "./CoverageBar";

export function SummaryPanel({ stats }: { stats: Stats }) {
  const { requirements, annotations, tasks } = stats;
  const orphans = annotations.orphans + tasks.orphans;
  return (
    <section aria-labelledby="summary-heading" className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="summary-heading" className="text-xl font-semibold tracking-tight">
          Coverage overview
        </h2>
        <p className="text-sm text-muted">
          Last scan <time dateTime={stats.lastScanAt}>{formatDateTime(stats.lastScanAt)}</time>
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Coverage"
          className="sm:col-span-2"
          value={formatPercent(stats.coverage)}
          detail={`${requirements.byStatus.covered ?? 0} of ${requirements.total} requirements fully covered`}
        >
          <CoverageBar byStatus={requirements.byStatus} total={requirements.total} coverage={stats.coverage} />
        </KpiCard>
        <KpiCard
          label="Requirements"
          value={requirements.total}
          detail={`${requirements.byType.FR ?? 0} FR · ${requirements.byType.AR ?? 0} AR`}
        />
        <KpiCard
          label="Orphans"
          value={orphans > 0 ? orphans : "None"}
          detail={`${annotations.orphans} of ${annotations.total} annotations · ${tasks.orphans} of ${tasks.total} tasks`}
        >
          {orphans > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-full bg-warning-tint px-2 py-0.5 text-xs font-medium text-ink">⚠ Needs attention</span>
              <a href="#orphans" className="text-link hover:underline">
                Review →
              </a>
            </div>
          ) : null}
        </KpiCard>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Delete the replaced summary components**

```bash
git rm src/components/summary/StatTile.tsx src/components/summary/CoverageMeter.tsx src/components/summary/StatusBars.tsx
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test src/components/summary`
Expected: PASS — 7 tests.

- [ ] **Step 7: Full suite, typecheck and commit**

Run: `pnpm test` — Expected: PASS except `src/app/pages.test.tsx` expectations tied to the old summary (`group "Coverage"` still passes; if any fail, they are rewritten in Task 5 — record which in the ledger). Run: `pnpm typecheck` — Expected: exit 0.

```bash
git add src/components/summary
git commit -m "feat(ui): show the summary as kpi cards with one coverage bar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Pages, detail view, orphans and verification

**Files:**
- Replace: `src/app/page.tsx`, `src/app/requirements/[id]/not-found.tsx`, `src/components/RequirementDetailView.tsx`, `src/components/OrphanPanel.tsx`
- Replace: `src/app/pages.test.tsx`, `src/components/requirement-detail.test.tsx`, `src/components/orphan-panel.test.tsx`

**Interfaces:**
- Consumes: `fetchRequirements`, `fetchTasks` (Task 1); `Card`, `StatusPill` (Task 2); `RequirementsTable`, `TasksPanel` (Task 3); `SummaryPanel` (Task 4); `parseDashboardQuery`, `searchParamsFromRecord`.
- Produces: final pages.

- [ ] **Step 1: Write the failing tests**

`src/components/orphan-panel.test.tsx`:

```tsx
// @vitest-environment jsdom
// @req SCD-UI-006, SCD-UI-007, SCD-A11Y-002
import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import type { Annotation, Task } from "@/lib/api";
import { axeViolations } from "@/test/axe";
import { loadFixtures } from "@/test/fixtures";
import { OrphanPanel } from "./OrphanPanel";

let annotations: Annotation[];
let tasks: Task[];

beforeAll(async () => {
  const fixtures = await loadFixtures();
  annotations = fixtures.orphanAnnotations;
  tasks = fixtures.orphanTasks;
});

const cells = (table: HTMLElement) =>
  within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell").map((c) => c.textContent));

describe("OrphanPanel", () => {
  it("lists orphan annotations and orphan tasks together", () => {
    render(<OrphanPanel annotations={annotations} tasks={tasks} />);
    expect(cells(screen.getByRole("table", { name: "Annotations (2)" }))).toEqual([
      ["src/api/legacy.rs", "5", "FR-LEGACY-001", "impl"],
      ["tests/api_test.rs", "88", "FR-API-099", "test"],
    ]);
    expect(cells(screen.getByRole("table", { name: "Tasks (1)" }))).toEqual([["TASK-006", "Add CSV export", "FR-EXPORT-001"]]);
  });

  it("is a collapsible card, open by default, with a count badge", () => {
    const { container } = render(<OrphanPanel annotations={annotations} tasks={tasks} />);
    expect(screen.getByRole("heading", { name: "Orphans" })).toBeInTheDocument();
    expect(container.querySelector("section#orphans summary")).toHaveTextContent("Orphans3");
    expect(container.querySelector("section#orphans details")).toHaveAttribute("open");
  });

  it("says so when there are no orphans", () => {
    render(<OrphanPanel annotations={[]} tasks={[]} />);
    expect(screen.getByText("No orphans — every reference points to a known requirement.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("marks an empty sub-list with None", () => {
    render(<OrphanPanel annotations={annotations} tasks={[]} />);
    expect(screen.getByRole("heading", { name: "Tasks (0)" })).toBeInTheDocument();
    expect(screen.getByText("None.")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<OrphanPanel annotations={annotations} tasks={tasks} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
```

`src/components/requirement-detail.test.tsx`:

```tsx
// @vitest-environment jsdom
// @req SCD-UI-004, SCD-UI-007, SCD-A11Y-002
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axeViolations } from "@/test/axe";
import { loadRequirement } from "@/test/fixtures";
import { RequirementDetailView } from "./RequirementDetailView";

async function renderDetail(id: string, backHref = "/") {
  const requirement = await loadRequirement(id);
  return render(<RequirementDetailView requirement={requirement} backHref={backHref} />);
}

describe("RequirementDetailView", () => {
  it("shows every field, the status and the assessment", async () => {
    await renderDetail("FR-API-002");
    expect(screen.getByRole("heading", { level: 2, name: "Requirement detail with linked artifacts" })).toBeInTheDocument();
    expect(screen.getByText("Covered")).toBeInTheDocument();
    expect(screen.getByText("Fully covered")).toBeInTheDocument();
    expect(
      screen.getByText("GET /requirements/{id} MUST return the requirement with all linked annotations and tasks."),
    ).toBeInTheDocument();
    const details = screen.getByRole("region", { name: "Details" });
    for (const text of ["IDFR-API-002", "TypeFR", "Created14 Feb 2026", "Updated25 Feb 2026"]) {
      expect(details).toHaveTextContent(text);
    }
  });

  it("lists linked annotations as code cards", async () => {
    await renderDetail("FR-API-002");
    const items = within(screen.getByRole("list", { name: "Annotations" })).getAllByRole("listitem");
    expect(within(items[0]).getByText("src/api/requirements.rs:45")).toBeInTheDocument();
    expect(within(items[0]).getByText("impl")).toBeInTheDocument();
    expect(within(items[1]).getByText("tests/api_test.rs:55")).toBeInTheDocument();
    expect(within(items[1]).getByText("test")).toBeInTheDocument();
    expect(within(items[0]).getByText(/async fn get_requirement/)).toBeInTheDocument();
  });

  it("lists linked tasks", async () => {
    await renderDetail("FR-API-002");
    const table = screen.getByRole("table", { name: "Linked tasks" });
    expect(within(within(table).getAllByRole("row")[1]).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "TASK-004", "Write tests for requirement detail", "Open", "—Unassigned", "20 Feb 2026",
    ]);
  });

  it.each([
    ["FR-API-002", "Fully covered"],
    ["FR-API-003", "Needs tests"],
    ["AR-SEC-001", "Not implemented"],
  ])("assesses %s as %s", async (id, label) => {
    await renderDetail(id);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("says when nothing is linked", async () => {
    await renderDetail("AR-SEC-001");
    expect(screen.getByText("No annotations reference this requirement.")).toBeInTheDocument();
    expect(screen.getByText("No tasks reference this requirement.")).toBeInTheDocument();
  });

  it("links back to the table with the given filters via the breadcrumb", async () => {
    await renderDetail("FR-API-002", "/?type=FR&status=covered");
    const breadcrumb = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(breadcrumb.getByRole("link", { name: "Requirements" })).toHaveAttribute("href", "/?type=FR&status=covered");
    expect(breadcrumb.getByText("FR-API-002")).toHaveAttribute("aria-current", "page");
  });

  it("has no axe violations", async () => {
    const { container } = await renderDetail("FR-API-002");
    expect(await axeViolations(container)).toEqual([]);
  });
});
```

`src/app/pages.test.tsx`:

```tsx
// @vitest-environment jsdom
// @req SCD-UI-001, SCD-UI-004, SCD-UI-005, SCD-UI-006, SCD-FLT-001, SCD-STATE-001, SCD-STATE-002
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetNavigation } from "@/test/navigation";
import DashboardLoading from "./loading";
import DashboardPage from "./page";
import RequirementLoading from "./requirements/[id]/loading";
import RequirementNotFound from "./requirements/[id]/not-found";
import RequirementPage from "./requirements/[id]/page";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);
vi.mock("next/server", () => ({ connection: async () => undefined }));

beforeEach(() => {
  resetNavigation();
});

const dashboard = (search: Record<string, string | string[]> = {}) =>
  DashboardPage({ searchParams: Promise.resolve(search) });

describe("dashboard page", () => {
  it("renders the summary, requirements, tasks and orphans from mock data", async () => {
    render(await dashboard());
    expect(screen.getByRole("group", { name: "Coverage" })).toHaveTextContent("62.5%");
    expect(screen.getByRole("region", { name: "Requirements" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Orphans" })).toBeInTheDocument();
  });

  it("fetches filtered data on the server from the URL", async () => {
    render(await dashboard({ type: "AR", status: ["missing"], taskStatus: "done" }));
    const requirements = within(screen.getByRole("region", { name: "Requirements" }));
    expect(requirements.getByText("Showing 2 of 8 requirements")).toBeInTheDocument();
    const tasks = within(screen.getByRole("region", { name: "Tasks" }));
    expect(tasks.getByText("Showing 2 of 6 tasks")).toBeInTheDocument();
  });
});

describe("requirement page", () => {
  it("renders the requirement and keeps only recognised filters in the breadcrumb", async () => {
    render(
      await RequirementPage({
        params: Promise.resolve({ id: "FR-API-002" }),
        searchParams: Promise.resolve({ type: "FR", status: ["covered", "partial"], bogus: "x" }),
      }),
    );
    expect(screen.getByRole("heading", { level: 2, name: "Requirement detail with linked artifacts" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Requirements" })).toHaveAttribute("href", "/?type=FR&status=covered&status=partial");
  });

  it("calls notFound for an unknown requirement", async () => {
    await expect(
      RequirementPage({ params: Promise.resolve({ id: "FR-UNKNOWN-999" }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("has a not-found state that links back", () => {
    render(<RequirementNotFound />);
    expect(screen.getByRole("heading", { name: "Requirement not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to requirements" })).toHaveAttribute("href", "/");
  });
});

// jsdom has no layout engine; these structural rules are what keep the views within a
// 360px phone viewport (verified in Chrome): grid tracks may shrink below their content's
// width, and wide tables scroll inside their own positioned box instead of widening the page.
function expectPhoneSafeLayout(container: HTMLElement) {
  const tables = Array.from(container.querySelectorAll("table"));
  expect(tables.length).toBeGreaterThan(0);
  for (const table of tables) expect(table.closest(".overflow-x-auto")).toHaveClass("relative");
  for (const grid of container.querySelectorAll(".grid")) expect(grid.className).toMatch(/\bgrid-cols-/);
  expect(container.firstElementChild).toHaveClass("grid-cols-[minmax(0,1fr)]");
}

describe("phone layout", () => {
  it("keeps the dashboard within the viewport", async () => {
    const { container } = render(await dashboard());
    expectPhoneSafeLayout(container);
  });

  it("keeps the requirement page within the viewport", async () => {
    const { container } = render(
      await RequirementPage({ params: Promise.resolve({ id: "FR-API-002" }), searchParams: Promise.resolve({}) }),
    );
    expectPhoneSafeLayout(container);
  });
});

describe("loading states", () => {
  it("announce loading for both routes", () => {
    const { unmount } = render(<DashboardLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading dashboard…");
    unmount();
    render(<RequirementLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading requirement…");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/app/pages.test.tsx src/components/requirement-detail.test.tsx src/components/orphan-panel.test.tsx`
Expected: FAIL — page ignores `searchParams` ("Showing 8 of 8"), no "Breadcrumb" navigation, no "Details" region, orphan heading still "Orphans (3)", not-found link text differs.

- [ ] **Step 3: Replace `src/app/page.tsx`**

```tsx
// @req SCD-UI-001, SCD-UI-003, SCD-UI-005, SCD-UI-006, SCD-FLT-001, SCD-FLT-003, SCD-STATE-002
import { connection } from "next/server";
import { Suspense } from "react";
import { ErrorPanel } from "@/components/ErrorPanel";
import { OrphanPanel } from "@/components/OrphanPanel";
import { RequirementsTable } from "@/components/RequirementsTable";
import { SummaryPanel } from "@/components/summary/SummaryPanel";
import { TasksPanel } from "@/components/TasksPanel";
import { getStats, listAnnotations, listTasks, type ApiError, type Result } from "@/lib/api";
import { fetchRequirements, fetchTasks } from "@/lib/dashboard/fetch";
import { parseDashboardQuery, searchParamsFromRecord } from "@/lib/dashboard/query";

function firstError(...results: Result<unknown>[]): ApiError | null {
  for (const result of results) if (!result.ok) return result.error;
  return null;
}

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  // Render per request: filters come from the URL and go to the data source.
  await connection();
  const query = parseDashboardQuery(searchParamsFromRecord(await searchParams));
  const [stats, requirements, tasks, orphanTasks, orphanAnnotations] = await Promise.all([
    getStats(),
    fetchRequirements(query),
    fetchTasks(query),
    listTasks({ orphans: true }),
    listAnnotations({ orphans: true }),
  ]);
  const tasksError = firstError(tasks, orphanTasks);
  const orphansError = firstError(orphanAnnotations, orphanTasks);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {stats.ok ? <SummaryPanel stats={stats.data} /> : <ErrorPanel title="Couldn't load project stats" error={stats.error} />}

      <Suspense fallback={null}>
        {requirements.ok ? (
          <RequirementsTable
            requirements={requirements.data}
            total={stats.ok ? stats.data.requirements.total : requirements.data.length}
          />
        ) : (
          <ErrorPanel title="Couldn't load requirements" error={requirements.error} />
        )}
      </Suspense>

      <Suspense fallback={null}>
        {tasksError ? (
          <ErrorPanel title="Couldn't load tasks" error={tasksError} />
        ) : tasks.ok && orphanTasks.ok ? (
          <TasksPanel
            tasks={tasks.data}
            total={stats.ok ? stats.data.tasks.total : tasks.data.length}
            orphanTaskIds={orphanTasks.data.map((t) => t.id)}
          />
        ) : null}
      </Suspense>

      {orphansError ? (
        <ErrorPanel title="Couldn't load orphans" error={orphansError} />
      ) : orphanAnnotations.ok && orphanTasks.ok ? (
        <OrphanPanel annotations={orphanAnnotations.data} tasks={orphanTasks.data} />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Replace `src/components/OrphanPanel.tsx`**

```tsx
// @req SCD-UI-006, SCD-UI-007, SCD-A11Y-001
import type { Annotation, Task } from "@/lib/api";

export function OrphanPanel({ annotations, tasks }: { annotations: Annotation[]; tasks: Task[] }) {
  const total = annotations.length + tasks.length;
  return (
    <section id="orphans" aria-labelledby="orphans-heading" className="rounded-xl bg-surface shadow-card">
      <details open className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-5">
          <h2 id="orphans-heading" className="text-base font-semibold tracking-tight">
            Orphans
          </h2>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2">{total}</span>
          <span aria-hidden="true" className="ml-auto text-muted transition-transform group-open:rotate-180">
            ⌄
          </span>
        </summary>
        <div className="px-5 pb-5">
          <p className="text-sm text-ink-2">References to requirements that are not in requirements.yaml.</p>
          {total === 0 ? (
            <p className="mt-3 text-sm">No orphans — every reference points to a known requirement.</p>
          ) : (
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-6">
              <OrphanTable
                title={`Annotations (${annotations.length})`}
                headers={["File", "Line", "Unknown reqId", "Type"]}
                rows={annotations.map((a) => ({
                  key: `${a.file}:${a.line}:${a.reqId}`,
                  cells: [a.file, String(a.line), a.reqId, a.type],
                }))}
              />
              <OrphanTable
                title={`Tasks (${tasks.length})`}
                headers={["Task", "Title", "Unknown requirementId"]}
                rows={tasks.map((t) => ({ key: t.id, cells: [t.id, t.title, t.requirementId] }))}
              />
            </div>
          )}
        </div>
      </details>
    </section>
  );
}

function OrphanTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: { key: string; cells: string[] }[];
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm text-ink-2">None.</p>
      ) : (
        <div className="relative mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="text-xs text-muted">
                {headers.map((header) => (
                  <th key={header} scope="col" className="px-3 py-2 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-hairline">
                  {row.cells.map((cell, index) => (
                    <td key={headers[index]} className={`px-3 py-2.5 ${index === 0 ? "font-mono" : ""}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Replace `src/components/RequirementDetailView.tsx`**

```tsx
// @req SCD-UI-004, SCD-UI-007, SCD-A11Y-001
import Link from "next/link";
import type { RequirementDetail } from "@/lib/api";
import { STATUS_PRESENTATION } from "@/lib/dashboard/coverage";
import { formatDate, formatLabel } from "@/lib/dashboard/format";
import { Card } from "./Card";
import { StatusPill } from "./StatusPill";

const TASK_HEADERS = ["ID", "Title", "Status", "Assignee", "Updated"];

export function RequirementDetailView({ requirement, backHref }: { requirement: RequirementDetail; backHref: string }) {
  return (
    <article aria-labelledby="requirement-title" className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-2 text-sm text-muted">
          <li>
            <Link href={backHref} className="text-link hover:underline">
              Requirements
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-mono text-ink-2">
            {requirement.id}
          </li>
        </ol>
      </nav>

      <header className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <h2 id="requirement-title" className="text-2xl font-semibold tracking-tight">
          {requirement.title}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill status={requirement.status} />
          <span className="text-sm font-medium text-ink-2">{STATUS_PRESENTATION[requirement.status].assessment}</span>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-label="Description" className="rounded-xl bg-surface p-5 shadow-card">
          <p className="leading-relaxed">{requirement.description}</p>
        </section>
        <section aria-label="Details" className="rounded-xl bg-surface p-5 shadow-card">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">ID</dt>
            <dd className="font-mono">{requirement.id}</dd>
            <dt className="text-muted">Type</dt>
            <dd>{requirement.type}</dd>
            <dt className="text-muted">Created</dt>
            <dd>
              <time dateTime={requirement.createdAt}>{formatDate(requirement.createdAt)}</time>
            </dd>
            <dt className="text-muted">Updated</dt>
            <dd>
              <time dateTime={requirement.updatedAt}>{formatDate(requirement.updatedAt)}</time>
            </dd>
          </dl>
        </section>
      </div>

      <Card titleId="annotations-heading" title={`Annotations (${requirement.annotations.length})`}>
        {requirement.annotations.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">No annotations reference this requirement.</p>
        ) : (
          <ul aria-label="Annotations" className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3">
            {requirement.annotations.map((a) => (
              <li key={`${a.file}:${a.line}`} className="overflow-hidden rounded-lg bg-surface-2">
                <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                  <span className="truncate font-mono text-ink-2">
                    {a.file}:{a.line}
                  </span>
                  <span className="rounded-full bg-surface px-2 py-0.5 font-medium text-ink">{a.type}</span>
                </div>
                <pre className="overflow-x-auto px-3 pb-3 text-xs">
                  <code>{a.snippet}</code>
                </pre>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card titleId="detail-tasks-heading" title={`Tasks (${requirement.tasks.length})`}>
        {requirement.tasks.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">No tasks reference this requirement.</p>
        ) : (
          <div className="relative mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Linked tasks</caption>
              <thead>
                <tr className="text-xs text-muted">
                  {TASK_HEADERS.map((header) => (
                    <th key={header} scope="col" className="px-3 py-2 font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requirement.tasks.map((t) => (
                  <tr key={t.id} className="border-t border-hairline">
                    <td className="px-3 py-3 font-mono">{t.id}</td>
                    <td className="px-3 py-3">{t.title}</td>
                    <td className="px-3 py-3 text-ink-2">{formatLabel(t.status)}</td>
                    <td className="px-3 py-3 text-ink-2">
                      {t.assignee ?? (
                        <>
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">Unassigned</span>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-muted">
                      <time dateTime={t.updatedAt}>{formatDate(t.updatedAt)}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </article>
  );
}
```

- [ ] **Step 6: Replace `src/app/requirements/[id]/not-found.tsx`**

```tsx
// @req SCD-STATE-002, SCD-UI-007
import Link from "next/link";

export default function RequirementNotFound() {
  return (
    <div className="rounded-xl bg-surface p-8 text-center shadow-card">
      <h2 className="text-lg font-semibold">Requirement not found</h2>
      <p className="mt-2 text-sm text-ink-2">No requirement with this ID exists in the current scan.</p>
      <Link href="/" className="mt-4 inline-block text-sm text-link hover:underline">
        Back to requirements
      </Link>
    </div>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test src/app/pages.test.tsx src/components/requirement-detail.test.tsx src/components/orphan-panel.test.tsx`
Expected: PASS — 8 + 9 + 5 tests.

- [ ] **Step 8: Remove every reference to retired tokens**

Run: `grep -rnE 'bg-code-bg|border-grid|bg-chip|bg-orphan-tint|accent-track|FilterChips|StatusBadge|StatTile|CoverageMeter|StatusBars' src`
Expected: no output. (If anything remains, replace `border-grid` → `border-hairline`, `bg-code-bg` → `bg-surface-2`, `bg-orphan-tint` → `bg-critical-tint`.)

- [ ] **Step 9: Full check and commit**

Run: `pnpm validate`
Expected: exit 0 — typecheck clean, 0 lint errors, all tests pass, build lists `/` and `/requirements/[id]` as dynamic, coverage 100% (25/25 covered).

```bash
git add src/app src/components
git commit -m "feat(ui): restyle pages and fetch filtered data on the server

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 10: Verify in a real browser**

With `pnpm build && PORT=3919 pnpm start` running (mock mode), use headless Chrome (DevTools protocol, as in the previous plan's verification) to check:
1. At 360px width, `/`, `/?type=AR&status=missing` and `/requirements/FR-API-002` have `document.documentElement.scrollWidth === 360`.
2. Clicking "FR" then "Missing" 50 ms apart ends at `?type=FR&status=missing` with "Showing 0 of 8 requirements" and the empty state, and the Requirements region is not `aria-busy` after it settles.
3. The server log shows no errors. Stop the server by the PID bound to the port (`ss -ltnp`), never by process name.

Record the measurements in the ledger. Any failure is a finding: fix it test-first before finishing.
