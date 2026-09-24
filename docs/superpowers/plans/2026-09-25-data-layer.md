# Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A strictly typed, runtime-validated client for the SDD Navigator API that works identically against the live API or local mock data.

**Architecture:** Zod schemas in `src/lib/api/schemas.ts` are the single source of types. `createApiClient(transport)` in `client.ts` runs one pipeline for every call — build request → `Transport.send` → status check → Zod parse → `Result<T>`. Two transports implement the same interface: `httpTransport` (fetch) and `mockTransport` (an in-process copy of the API over `data/*.json`); `config.ts` picks one from `NEXT_PUBLIC_API_URL` and `index.ts` exports the bound functions. Refinements over the spec: `createApiClient` lives in its own `client.ts` so tests can inject transports, and the mock's clock is injectable (`now` option) instead of relying on fake timers for the scan lifecycle.

**Tech Stack:** Next.js 16, TypeScript 5 (strict), Zod 4.6, Vitest 5, pnpm 12.

**Spec:** `docs/superpowers/specs/2026-09-25-data-layer-design.md` (requirements SCD-API-001/002/003 in `requirements.yaml`).

## Global Constraints

- TypeScript strict mode; no `any` (explicit or `as any`) anywhere, including tests.
- Dependencies: `zod@^4.6.5` (runtime), `vitest@^5.0.1` (dev). No other new packages.
- Module lives in `src/lib/api/`, imported by the app as `@/lib/api`. Mock data lives in `data/` at the repository root.
- Mode: `NEXT_PUBLIC_API_URL` non-empty after trimming → API mode; unset/empty → mock mode.
- HTTP timeout `10_000` ms; mock delay `300` ms; mock scan duration `1500` ms.
- Expected failures (network, non-2xx, malformed body) are returned as `Result` values, never thrown.
- Every source and test file starts with a `// @req SCD-…` annotation naming the requirement(s) it implements or tests.
- Work on branch `feat/data-layer`. Commit messages follow Conventional Commits and end with the `Co-Authored-By` line. Never use `--no-verify`; the hooks run `pnpm test` and `pnpm build`.
- Package registry access is intermittent on this machine: run `pnpm add` with a timeout and retry once if it hangs.

## Review Focus

1. **Blank requirement id** — `getRequirement("")` or `getRequirement("  ")` should return `not_found` without sending a request, not hit `/requirements/` (which the live API may answer with a list). Pinned in Task 2.
2. **Ids with reserved URL characters** — `getRequirement("FR X/1")` must encode to `/requirements/FR%20X%2F1` and the mock must decode it back. Pinned in Tasks 2, 3 and 4.
3. **Base URL with trailing slash or whitespace** — `NEXT_PUBLIC_API_URL=" https://host/ "` must produce `https://host/stats`, not `https://host//stats`. Pinned in Tasks 3 and 5.
4. **Non-JSON error body** — a proxy's HTML 502 page must become `{ kind: "http", status: 502, message: "HTTP 502" }`, not a crash. Pinned in Tasks 2 and 3.
5. **Extra fields from a newer API** — unknown properties must be accepted and stripped, not turned into `invalid_response`; tasks without `assignee` must parse. Pinned in Task 2.

---

### Task 1: Test tooling, schemas and mock fixtures

**Files:**
- Modify: `package.json` (scripts, dependencies)
- Create: `vitest.config.mts`
- Modify: `.husky/pre-commit`, `.husky/pre-push`
- Create: `src/lib/api/schemas.ts`
- Create: `data/stats.json`, `data/requirements.json`, `data/annotations.json`, `data/tasks.json`, `data/scan.json`
- Test: `src/lib/api/fixtures.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (from `src/lib/api/schemas.ts`): schemas `RequirementTypeSchema`, `CoverageStatusSchema`, `AnnotationTypeSchema`, `TaskStatusSchema`, `ScanStateSchema`, `RequirementStatsSchema`, `AnnotationStatsSchema`, `TaskStatsSchema`, `StatsSchema`, `RequirementSchema`, `RequirementDetailSchema`, `AnnotationSchema`, `TaskSchema`, `ScanStatusSchema`, `ApiErrorBodySchema`; types `RequirementType`, `CoverageStatus`, `AnnotationType`, `TaskStatus`, `ScanState`, `RequirementStats`, `AnnotationStats`, `TaskStats`, `Stats`, `Requirement`, `RequirementDetail`, `Annotation`, `Task`, `ScanStatus`, `ApiErrorBody`. Scripts `pnpm test`, `pnpm test:contract`, `pnpm typecheck`.

- [ ] **Step 1: Install dependencies**

```bash
timeout 200 pnpm add zod@^4.6.5
timeout 200 pnpm add -D vitest@^5.0.1
```

Expected: `package.json` lists `zod` under `dependencies` and `vitest` under `devDependencies`.

- [ ] **Step 2: Add scripts to `package.json`**

In the `"scripts"` object, add after `"lint": "eslint",`:

```json
    "test": "vitest run",
    "test:contract": "CONTRACT=1 vitest run",
    "typecheck": "tsc --noEmit",
```

- [ ] **Step 3: Create `vitest.config.mts`**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests: *.test.ts. Live API contract tests: *.contract.ts (only with CONTRACT=1).
const contract = process.env.CONTRACT === "1";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: contract ? ["src/**/*.contract.ts"] : ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Create the five fixture files** with exactly this content (copied from the live API on 2026-09-25).

`data/stats.json`:

```json
{
  "requirements": {
    "total": 8,
    "byType": {
      "FR": 6,
      "AR": 2
    },
    "byStatus": {
      "covered": 5,
      "partial": 1,
      "missing": 2
    }
  },
  "annotations": {
    "total": 16,
    "impl": 10,
    "test": 6,
    "orphans": 2
  },
  "tasks": {
    "total": 6,
    "byStatus": {
      "done": 2,
      "in_progress": 1,
      "open": 3
    },
    "orphans": 1
  },
  "coverage": 62.5,
  "lastScanAt": "2026-03-01T10:15:00Z"
}
```

`data/requirements.json`:

```json
[
  {
    "id": "AR-PERF-001",
    "type": "AR",
    "title": "Scan completes under 5s for 10k files",
    "description": "Full codebase scan MUST complete within 5 seconds for repositories containing up to 10,000 source files.",
    "status": "missing",
    "createdAt": "2026-02-10T09:00:00Z",
    "updatedAt": "2026-02-10T09:00:00Z"
  },
  {
    "id": "AR-SEC-001",
    "type": "AR",
    "title": "Rate-limit /scan endpoint (10 req/min)",
    "description": "POST /scan MUST reject requests exceeding 10 per minute per client IP with HTTP 429.",
    "status": "missing",
    "createdAt": "2026-02-20T15:00:00Z",
    "updatedAt": "2026-02-20T15:00:00Z"
  },
  {
    "id": "FR-API-001",
    "type": "FR",
    "title": "List requirements with filters and sorting",
    "description": "GET /requirements MUST support filtering by type and status, sorting by id or updatedAt.",
    "status": "covered",
    "createdAt": "2026-02-14T10:00:00Z",
    "updatedAt": "2026-03-01T10:15:00Z"
  },
  {
    "id": "FR-API-002",
    "type": "FR",
    "title": "Requirement detail with linked artifacts",
    "description": "GET /requirements/{id} MUST return the requirement with all linked annotations and tasks.",
    "status": "covered",
    "createdAt": "2026-02-14T10:00:00Z",
    "updatedAt": "2026-02-25T16:00:00Z"
  },
  {
    "id": "FR-API-003",
    "type": "FR",
    "title": "Full-text search across requirements",
    "description": "Service SHOULD support substring matching across requirement id and title fields.",
    "status": "partial",
    "createdAt": "2026-02-18T13:00:00Z",
    "updatedAt": "2026-02-20T09:45:00Z"
  },
  {
    "id": "FR-SCAN-001",
    "type": "FR",
    "title": "Parse requirements.yaml",
    "description": "System MUST read requirements.yaml from repository root and validate that every entry contains id and title fields.",
    "status": "covered",
    "createdAt": "2026-02-10T09:00:00Z",
    "updatedAt": "2026-02-28T14:30:00Z"
  },
  {
    "id": "FR-SCAN-002",
    "type": "FR",
    "title": "Scan @req annotations in source files",
    "description": "Scanner MUST find all @req annotations in .rs, .ts, .py, .dart files and classify each as impl or test based on file path.",
    "status": "covered",
    "createdAt": "2026-02-10T09:00:00Z",
    "updatedAt": "2026-03-01T10:15:00Z"
  },
  {
    "id": "FR-SCAN-003",
    "type": "FR",
    "title": "Detect orphan annotations",
    "description": "Scanner MUST report annotations whose reqId does not match any entry in requirements.yaml.",
    "status": "covered",
    "createdAt": "2026-02-12T11:00:00Z",
    "updatedAt": "2026-02-28T14:30:00Z"
  }
]
```

`data/annotations.json`:

```json
[
  {
    "file": "src/api/legacy.rs",
    "line": 5,
    "reqId": "FR-LEGACY-001",
    "type": "impl",
    "snippet": "/// @req FR-LEGACY-001\nfn deprecated_handler() {"
  },
  {
    "file": "src/api/requirements.rs",
    "line": 10,
    "reqId": "FR-API-001",
    "type": "impl",
    "snippet": "/// @req FR-API-001\nasync fn list_requirements(query: Query<ReqFilter>) -> Json<Vec<Requirement>> {"
  },
  {
    "file": "src/api/requirements.rs",
    "line": 45,
    "reqId": "FR-API-002",
    "type": "impl",
    "snippet": "/// @req FR-API-002\nasync fn get_requirement(path: Path<String>) -> Json<RequirementDetail> {"
  },
  {
    "file": "src/api/search.rs",
    "line": 5,
    "reqId": "FR-API-003",
    "type": "impl",
    "snippet": "/// @req FR-API-003\nasync fn search_requirements(query: Query<SearchParams>) -> Json<Vec<Requirement>> {"
  },
  {
    "file": "src/api/stats.rs",
    "line": 8,
    "reqId": "FR-API-001",
    "type": "impl",
    "snippet": "/// @req FR-API-001\nasync fn get_stats() -> Json<Stats> {"
  },
  {
    "file": "src/parser.rs",
    "line": 15,
    "reqId": "FR-SCAN-001",
    "type": "impl",
    "snippet": "/// @req FR-SCAN-001\nfn parse_requirements(path: &Path) -> Result<Vec<Requirement>> {"
  },
  {
    "file": "src/parser.rs",
    "line": 58,
    "reqId": "FR-SCAN-001",
    "type": "impl",
    "snippet": "/// @req FR-SCAN-001\nfn validate_yaml_schema(doc: &Value) -> Result<()> {"
  },
  {
    "file": "src/scanner.rs",
    "line": 22,
    "reqId": "FR-SCAN-002",
    "type": "impl",
    "snippet": "/// @req FR-SCAN-002\nfn scan_file(path: &Path) -> Vec<Annotation> {"
  },
  {
    "file": "src/scanner.rs",
    "line": 67,
    "reqId": "FR-SCAN-002",
    "type": "impl",
    "snippet": "/// @req FR-SCAN-002\nfn classify_annotation(file: &Path) -> AnnotationType {"
  },
  {
    "file": "src/scanner.rs",
    "line": 89,
    "reqId": "FR-SCAN-003",
    "type": "impl",
    "snippet": "/// @req FR-SCAN-003\nfn detect_orphans(annotations: &[Annotation], reqs: &[Requirement]) -> Vec<Annotation> {"
  },
  {
    "file": "tests/api_test.rs",
    "line": 20,
    "reqId": "FR-API-001",
    "type": "test",
    "snippet": "/// @req FR-API-001\n#[tokio::test] async fn test_list_with_status_filter() {"
  },
  {
    "file": "tests/api_test.rs",
    "line": 55,
    "reqId": "FR-API-002",
    "type": "test",
    "snippet": "/// @req FR-API-002\n#[tokio::test] async fn test_get_requirement_detail() {"
  },
  {
    "file": "tests/api_test.rs",
    "line": 88,
    "reqId": "FR-API-099",
    "type": "test",
    "snippet": "/// @req FR-API-099\n#[tokio::test] async fn test_removed_endpoint() {"
  },
  {
    "file": "tests/parser_test.rs",
    "line": 12,
    "reqId": "FR-SCAN-001",
    "type": "test",
    "snippet": "/// @req FR-SCAN-001\n#[test] fn test_parse_valid_yaml() {"
  },
  {
    "file": "tests/scanner_test.rs",
    "line": 8,
    "reqId": "FR-SCAN-002",
    "type": "test",
    "snippet": "/// @req FR-SCAN-002\n#[test] fn test_scan_rust_file() {"
  },
  {
    "file": "tests/scanner_test.rs",
    "line": 34,
    "reqId": "FR-SCAN-003",
    "type": "test",
    "snippet": "/// @req FR-SCAN-003\n#[test] fn test_detect_orphan_annotations() {"
  }
]
```

`data/tasks.json`:

```json
[
  {
    "id": "TASK-001",
    "requirementId": "FR-SCAN-001",
    "title": "Implement YAML parser",
    "status": "done",
    "assignee": "alexey",
    "createdAt": "2026-02-10T09:00:00Z",
    "updatedAt": "2026-02-20T18:00:00Z"
  },
  {
    "id": "TASK-002",
    "requirementId": "FR-SCAN-002",
    "title": "Build annotation scanner",
    "status": "done",
    "assignee": "alexey",
    "createdAt": "2026-02-12T10:00:00Z",
    "updatedAt": "2026-02-25T15:00:00Z"
  },
  {
    "id": "TASK-003",
    "requirementId": "FR-API-001",
    "title": "Add filtering to requirements endpoint",
    "status": "in_progress",
    "assignee": "maria",
    "createdAt": "2026-02-18T09:00:00Z",
    "updatedAt": "2026-03-01T10:15:00Z"
  },
  {
    "id": "TASK-004",
    "requirementId": "FR-API-002",
    "title": "Write tests for requirement detail",
    "status": "open",
    "createdAt": "2026-02-20T11:00:00Z",
    "updatedAt": "2026-02-20T11:00:00Z"
  },
  {
    "id": "TASK-005",
    "requirementId": "AR-PERF-001",
    "title": "Benchmark scan on large repos",
    "status": "open",
    "createdAt": "2026-02-22T14:00:00Z",
    "updatedAt": "2026-02-22T14:00:00Z"
  },
  {
    "id": "TASK-006",
    "requirementId": "FR-EXPORT-001",
    "title": "Add CSV export",
    "status": "open",
    "createdAt": "2026-02-25T10:00:00Z",
    "updatedAt": "2026-02-25T10:00:00Z"
  }
]
```

`data/scan.json`:

```json
{
  "status": "completed",
  "startedAt": "2026-03-01T10:14:59Z",
  "completedAt": "2026-03-01T10:15:00Z",
  "duration": 340
}
```

- [ ] **Step 5: Write the failing fixture tests** — `src/lib/api/fixtures.test.ts`

```ts
// @req SCD-API-002
import { describe, expect, it } from "vitest";
import { z } from "zod";
import annotations from "../../../data/annotations.json";
import requirements from "../../../data/requirements.json";
import scan from "../../../data/scan.json";
import stats from "../../../data/stats.json";
import tasks from "../../../data/tasks.json";
import {
  AnnotationSchema,
  RequirementSchema,
  ScanStatusSchema,
  StatsSchema,
  TaskSchema,
} from "./schemas";

const conformance: Array<[string, z.ZodType, unknown]> = [
  ["stats.json", StatsSchema, stats],
  ["requirements.json", z.array(RequirementSchema), requirements],
  ["annotations.json", z.array(AnnotationSchema), annotations],
  ["tasks.json", z.array(TaskSchema), tasks],
  ["scan.json", ScanStatusSchema, scan],
];

describe("mock fixtures conform to the API schema", () => {
  it.each(conformance)("%s", (_name, schema, data) => {
    const result = schema.safeParse(data);
    expect(result.success ? [] : result.error.issues).toEqual([]);
  });
});

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const k = key(item);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

describe("stats.json agrees with the other fixtures", () => {
  const requirementIds = new Set(requirements.map((r) => r.id));

  it("matches the requirement counts", () => {
    expect(stats.requirements.total).toBe(requirements.length);
    expect(stats.requirements.byType).toEqual(countBy(requirements, (r) => r.type));
    expect(stats.requirements.byStatus).toEqual(countBy(requirements, (r) => r.status));
  });

  it("computes coverage as covered / total × 100", () => {
    const covered = requirements.filter((r) => r.status === "covered").length;
    expect(stats.coverage).toBeCloseTo((covered / requirements.length) * 100);
  });

  it("matches the annotation counts", () => {
    expect(stats.annotations).toEqual({
      total: annotations.length,
      impl: annotations.filter((a) => a.type === "impl").length,
      test: annotations.filter((a) => a.type === "test").length,
      orphans: annotations.filter((a) => !requirementIds.has(a.reqId)).length,
    });
  });

  it("matches the task counts", () => {
    expect(stats.tasks).toEqual({
      total: tasks.length,
      byStatus: countBy(tasks, (t) => t.status),
      orphans: tasks.filter((t) => !requirementIds.has(t.requirementId)).length,
    });
  });

  it.each(requirements.map((r) => [r.id, r] as const))(
    "%s has the status its annotations imply",
    (_id, requirement) => {
      const kinds = new Set(
        annotations.filter((a) => a.reqId === requirement.id).map((a) => a.type),
      );
      const expected =
        kinds.has("impl") && kinds.has("test") ? "covered" : kinds.has("impl") ? "partial" : "missing";
      expect(requirement.status).toBe(expected);
    },
  );

  it("matches the step-2 figures", () => {
    expect(stats).toMatchObject({
      coverage: 62.5,
      requirements: { total: 8, byType: { FR: 6, AR: 2 }, byStatus: { covered: 5, partial: 1, missing: 2 } },
      annotations: { total: 16, impl: 10, test: 6, orphans: 2 },
      tasks: { total: 6, byStatus: { done: 2, in_progress: 1, open: 3 }, orphans: 1 },
    });
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "./schemas"`.

- [ ] **Step 7: Write `src/lib/api/schemas.ts`**

```ts
// @req SCD-API-003
// Zod mirrors of the SDD Navigator OpenAPI v3.0.0 schemas
// (https://api.pdd.foreachpartners.com/spec/sdd-coverage-api.yaml).
// Types are inferred from these schemas; do not declare them separately.
import { z } from "zod";

export const RequirementTypeSchema = z.enum(["FR", "AR"]);
export const CoverageStatusSchema = z.enum(["covered", "partial", "missing"]);
export const AnnotationTypeSchema = z.enum(["impl", "test"]);
export const TaskStatusSchema = z.enum(["open", "in_progress", "done"]);
export const ScanStateSchema = z.enum(["idle", "scanning", "completed", "failed"]);

const timestamp = z.iso.datetime({ offset: true });
const count = z.number().int().nonnegative();

export const RequirementStatsSchema = z.object({
  total: count,
  byType: z.record(z.string(), count),
  byStatus: z.record(z.string(), count),
});

export const AnnotationStatsSchema = z.object({
  total: count,
  impl: count,
  test: count,
  orphans: count,
});

export const TaskStatsSchema = z.object({
  total: count,
  byStatus: z.record(z.string(), count),
  orphans: count,
});

export const StatsSchema = z.object({
  requirements: RequirementStatsSchema,
  annotations: AnnotationStatsSchema,
  tasks: TaskStatsSchema,
  coverage: z.number().min(0).max(100),
  lastScanAt: timestamp,
});

export const RequirementSchema = z.object({
  id: z.string().min(1),
  type: RequirementTypeSchema,
  title: z.string(),
  description: z.string(),
  status: CoverageStatusSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const AnnotationSchema = z.object({
  file: z.string(),
  line: z.number().int().positive(),
  reqId: z.string(),
  type: AnnotationTypeSchema,
  snippet: z.string(),
});

export const TaskSchema = z.object({
  id: z.string().min(1),
  requirementId: z.string(),
  title: z.string(),
  status: TaskStatusSchema,
  assignee: z.string().optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const RequirementDetailSchema = RequirementSchema.extend({
  annotations: z.array(AnnotationSchema),
  tasks: z.array(TaskSchema),
});

export const ScanStatusSchema = z.object({
  status: ScanStateSchema,
  startedAt: timestamp,
  completedAt: timestamp.optional(),
  duration: count.optional(),
});

export const ApiErrorBodySchema = z.object({
  error: z.string(),
  message: z.string(),
});

export type RequirementType = z.infer<typeof RequirementTypeSchema>;
export type CoverageStatus = z.infer<typeof CoverageStatusSchema>;
export type AnnotationType = z.infer<typeof AnnotationTypeSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type ScanState = z.infer<typeof ScanStateSchema>;
export type RequirementStats = z.infer<typeof RequirementStatsSchema>;
export type AnnotationStats = z.infer<typeof AnnotationStatsSchema>;
export type TaskStats = z.infer<typeof TaskStatsSchema>;
export type Stats = z.infer<typeof StatsSchema>;
export type Requirement = z.infer<typeof RequirementSchema>;
export type RequirementDetail = z.infer<typeof RequirementDetailSchema>;
export type Annotation = z.infer<typeof AnnotationSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type ScanStatus = z.infer<typeof ScanStatusSchema>;
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — 5 conformance tests, 5 count tests, 8 per-requirement status tests (18 total).

- [ ] **Step 9: Add the tests to the git hooks**

Replace the contents of both `.husky/pre-commit` and `.husky/pre-push` with:

```sh
pnpm test
pnpm build
```

- [ ] **Step 10: Typecheck and commit**

Run: `pnpm typecheck` — Expected: no output, exit 0.

```bash
git add package.json pnpm-lock.yaml vitest.config.mts .husky/pre-commit .husky/pre-push src/lib/api/schemas.ts src/lib/api/fixtures.test.ts data
git commit -m "feat(api): add zod schemas and mock fixtures for the sdd navigator api

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the pre-commit hook runs the tests and the build, then the commit succeeds.

---

### Task 2: Result type and API client core

**Files:**
- Create: `src/lib/api/errors.ts`
- Create: `src/lib/api/transport.ts` (types only in this task)
- Create: `src/lib/api/client.ts`
- Create: `src/lib/api/test-helpers.ts`
- Test: `src/lib/api/client.test.ts`

**Interfaces:**
- Consumes: schemas and types from Task 1.
- Produces:
  - `errors.ts`: `type ApiError`, `type Result<T>`, `ok<T>(data: T): Result<T>`, `err(error: ApiError): { ok: false; error: ApiError }`.
  - `transport.ts`: `type HttpMethod = "GET" | "POST"`, `interface TransportRequest { method: HttpMethod; path: string; query?: Record<string, string | undefined> }`, `interface TransportResponse { status: number; body: unknown }`, `interface Transport { send(request: TransportRequest): Promise<TransportResponse> }`.
  - `client.ts`: `type SortField = "id" | "updatedAt"`, `type SortOrder = "asc" | "desc"`, `interface RequirementFilters`, `interface AnnotationFilters`, `interface TaskFilters`, `interface ApiClient`, `createApiClient(transport: Transport): ApiClient`.
  - `test-helpers.ts`: `dataOf<T>(result: Result<T>): T`, `errorOf<T>(result: Result<T>): ApiError`.

- [ ] **Step 1: Write `src/lib/api/errors.ts`**

```ts
// @req SCD-API-003
// Expected failures are values, not exceptions: callers narrow on `ok`, then on `error.kind`.

export type ApiError =
  | { kind: "network"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "http"; status: number; message: string }
  | { kind: "invalid_response"; message: string; issues: string[] };

export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err(error: ApiError): { ok: false; error: ApiError } {
  return { ok: false, error };
}
```

- [ ] **Step 2: Write the transport types — `src/lib/api/transport.ts`**

```ts
// @req SCD-API-003
export type HttpMethod = "GET" | "POST";

export interface TransportRequest {
  method: HttpMethod;
  /** Path relative to the API root, already URL-encoded, e.g. "/requirements/FR-SCAN-001". */
  path: string;
  /** Undefined values are omitted from the query string. */
  query?: Record<string, string | undefined>;
}

export interface TransportResponse {
  status: number;
  /** Parsed JSON, the raw text if the body is not JSON, or null if it is empty. */
  body: unknown;
}

export interface Transport {
  /** Rejects only when no response was received (network failure, timeout). */
  send(request: TransportRequest): Promise<TransportResponse>;
}
```

- [ ] **Step 3: Write `src/lib/api/test-helpers.ts`**

```ts
// @req SCD-API-003
import type { ApiError, Result } from "./errors";

export function dataOf<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`Expected ok result, got ${JSON.stringify(result.error)}`);
  return result.data;
}

export function errorOf<T>(result: Result<T>): ApiError {
  if (result.ok) throw new Error("Expected an error result, got ok");
  return result.error;
}
```

- [ ] **Step 4: Write the failing tests — `src/lib/api/client.test.ts`**

```ts
// @req SCD-API-003
import { describe, expect, it } from "vitest";
import { createApiClient } from "./client";
import { dataOf, errorOf } from "./test-helpers";
import type { Transport, TransportRequest, TransportResponse } from "./transport";

function stubTransport(response: TransportResponse | Error) {
  const calls: TransportRequest[] = [];
  const transport: Transport = {
    async send(request) {
      calls.push(request);
      if (response instanceof Error) throw response;
      return response;
    },
  };
  return { api: createApiClient(transport), calls };
}

const requirement = {
  id: "FR-SCAN-001",
  type: "FR",
  title: "Parse requirements.yaml",
  description: "System MUST read requirements.yaml.",
  status: "covered",
  createdAt: "2026-02-10T09:00:00Z",
  updatedAt: "2026-02-28T14:30:00Z",
};

const task = {
  id: "TASK-004",
  requirementId: "FR-API-002",
  title: "Write tests for requirement detail",
  status: "open",
  createdAt: "2026-02-20T11:00:00Z",
  updatedAt: "2026-02-20T11:00:00Z",
};

describe("request building", () => {
  it("sends requirement filters as query params", async () => {
    const { api, calls } = stubTransport({ status: 200, body: [] });
    await api.listRequirements({ type: "AR", sort: "updatedAt", order: "desc" });
    expect(calls).toEqual([
      {
        method: "GET",
        path: "/requirements",
        query: { type: "AR", status: undefined, sort: "updatedAt", order: "desc" },
      },
    ]);
  });

  it("serialises boolean orphans filters", async () => {
    const { api, calls } = stubTransport({ status: 200, body: [] });
    await api.listAnnotations({ orphans: true });
    await api.listTasks({ status: "open", orphans: false });
    expect(calls[0].query).toEqual({ type: undefined, orphans: "true" });
    expect(calls[1].query).toEqual({ status: "open", orphans: "false", sort: undefined, order: undefined });
  });

  it("omits every filter when none are given", async () => {
    const { api, calls } = stubTransport({ status: 200, body: [] });
    await api.listTasks();
    expect(calls[0]).toEqual({
      method: "GET",
      path: "/tasks",
      query: { status: undefined, orphans: undefined, sort: undefined, order: undefined },
    });
  });

  it("URL-encodes requirement ids", async () => {
    const { api, calls } = stubTransport({ status: 404, body: null });
    await api.getRequirement("FR X/1");
    expect(calls[0].path).toBe("/requirements/FR%20X%2F1");
  });

  it("uses POST for triggerScan and GET for getScanStatus", async () => {
    const scan = { status: "scanning", startedAt: "2026-03-01T10:14:59Z" };
    const { api, calls } = stubTransport({ status: 202, body: scan });
    expect(dataOf(await api.triggerScan())).toEqual(scan);
    await api.getScanStatus();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /scan", "GET /scan"]);
  });
});

describe("successful responses", () => {
  it("returns parsed data", async () => {
    const { api } = stubTransport({ status: 200, body: [requirement] });
    expect(dataOf(await api.listRequirements())).toEqual([requirement]);
  });

  it("strips unknown fields instead of failing", async () => {
    const { api } = stubTransport({ status: 200, body: [{ ...requirement, priority: "high" }] });
    expect(dataOf(await api.listRequirements())[0]).not.toHaveProperty("priority");
  });

  it("accepts tasks without an assignee", async () => {
    const { api } = stubTransport({ status: 200, body: [task] });
    expect(dataOf(await api.listTasks())[0].assignee).toBeUndefined();
  });
});

describe("error mapping", () => {
  it("maps a rejected transport to a network error", async () => {
    const { api } = stubTransport(new Error("Failed to fetch"));
    expect(errorOf(await api.getStats())).toEqual({ kind: "network", message: "Failed to fetch" });
  });

  it("maps 404 to not_found using the API message", async () => {
    const { api } = stubTransport({
      status: 404,
      body: { error: "not_found", message: "Requirement 'FR-UNKNOWN-999' not found" },
    });
    expect(errorOf(await api.getRequirement("FR-UNKNOWN-999"))).toEqual({
      kind: "not_found",
      message: "Requirement 'FR-UNKNOWN-999' not found",
    });
  });

  it("maps 404 without an error body to a generic not_found", async () => {
    const { api } = stubTransport({ status: 404, body: null });
    expect(errorOf(await api.getStats())).toEqual({ kind: "not_found", message: "Resource not found" });
  });

  it("maps other non-2xx statuses to http errors with the API message", async () => {
    const { api } = stubTransport({ status: 500, body: { error: "internal", message: "Scanner crashed" } });
    expect(errorOf(await api.getStats())).toEqual({ kind: "http", status: 500, message: "Scanner crashed" });
  });

  it("maps a non-JSON error page to an http error", async () => {
    const { api } = stubTransport({ status: 502, body: "<html>Bad Gateway</html>" });
    expect(errorOf(await api.getStats())).toEqual({ kind: "http", status: 502, message: "HTTP 502" });
  });

  it("maps a schema mismatch to invalid_response with issue paths", async () => {
    const { api } = stubTransport({ status: 200, body: [{ ...requirement, status: "done" }] });
    const error = errorOf(await api.listRequirements());
    expect(error.kind).toBe("invalid_response");
    expect(error.kind === "invalid_response" && error.issues.some((i) => i.startsWith("0.status:"))).toBe(true);
  });

  it("maps a non-JSON success body to invalid_response", async () => {
    const { api } = stubTransport({ status: 200, body: "<html>Maintenance</html>" });
    expect(errorOf(await api.getStats()).kind).toBe("invalid_response");
  });

  it.each(["", "   "])("returns not_found for blank id %j without a request", async (id) => {
    const { api, calls } = stubTransport({ status: 200, body: [] });
    expect(errorOf(await api.getRequirement(id)).kind).toBe("not_found");
    expect(calls).toHaveLength(0);
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `pnpm test src/lib/api/client.test.ts`
Expected: FAIL — `Failed to resolve import "./client"`.

- [ ] **Step 6: Write `src/lib/api/client.ts`**

```ts
// @req SCD-API-003
import { z } from "zod";
import { err, ok, type Result } from "./errors";
import {
  AnnotationSchema,
  ApiErrorBodySchema,
  RequirementDetailSchema,
  RequirementSchema,
  ScanStatusSchema,
  StatsSchema,
  TaskSchema,
  type Annotation,
  type AnnotationType,
  type CoverageStatus,
  type Requirement,
  type RequirementDetail,
  type RequirementType,
  type ScanStatus,
  type Stats,
  type Task,
  type TaskStatus,
} from "./schemas";
import type { Transport, TransportRequest, TransportResponse } from "./transport";

export type SortField = "id" | "updatedAt";
export type SortOrder = "asc" | "desc";

export interface RequirementFilters {
  type?: RequirementType;
  status?: CoverageStatus;
  sort?: SortField;
  order?: SortOrder;
}

export interface AnnotationFilters {
  type?: AnnotationType;
  orphans?: boolean;
}

export interface TaskFilters {
  status?: TaskStatus;
  orphans?: boolean;
  sort?: SortField;
  order?: SortOrder;
}

export interface ApiClient {
  getStats(): Promise<Result<Stats>>;
  listRequirements(filters?: RequirementFilters): Promise<Result<Requirement[]>>;
  getRequirement(id: string): Promise<Result<RequirementDetail>>;
  listAnnotations(filters?: AnnotationFilters): Promise<Result<Annotation[]>>;
  listTasks(filters?: TaskFilters): Promise<Result<Task[]>>;
  triggerScan(): Promise<Result<ScanStatus>>;
  getScanStatus(): Promise<Result<ScanStatus>>;
}

function errorMessage(body: unknown): string | undefined {
  const parsed = ApiErrorBodySchema.safeParse(body);
  return parsed.success ? parsed.data.message : undefined;
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map(
    (issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`,
  );
}

async function request<T>(
  transport: Transport,
  req: TransportRequest,
  schema: z.ZodType<T>,
): Promise<Result<T>> {
  let response: TransportResponse;
  try {
    response = await transport.send(req);
  } catch (error) {
    return err({ kind: "network", message: error instanceof Error ? error.message : String(error) });
  }

  const { status, body } = response;
  if (status === 404) {
    return err({ kind: "not_found", message: errorMessage(body) ?? "Resource not found" });
  }
  if (status < 200 || status > 299) {
    return err({ kind: "http", status, message: errorMessage(body) ?? `HTTP ${status}` });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return err({
      kind: "invalid_response",
      message: `Unexpected response from ${req.method} ${req.path}`,
      issues: formatIssues(parsed.error),
    });
  }
  return ok(parsed.data);
}

const flag = (value: boolean | undefined) => (value === undefined ? undefined : String(value));

export function createApiClient(transport: Transport): ApiClient {
  return {
    getStats: () => request(transport, { method: "GET", path: "/stats" }, StatsSchema),

    listRequirements: (filters = {}) =>
      request(
        transport,
        {
          method: "GET",
          path: "/requirements",
          query: { type: filters.type, status: filters.status, sort: filters.sort, order: filters.order },
        },
        z.array(RequirementSchema),
      ),

    getRequirement: async (id) => {
      if (id.trim() === "") return err({ kind: "not_found", message: "Requirement id is empty" });
      return request(
        transport,
        { method: "GET", path: `/requirements/${encodeURIComponent(id)}` },
        RequirementDetailSchema,
      );
    },

    listAnnotations: (filters = {}) =>
      request(
        transport,
        { method: "GET", path: "/annotations", query: { type: filters.type, orphans: flag(filters.orphans) } },
        z.array(AnnotationSchema),
      ),

    listTasks: (filters = {}) =>
      request(
        transport,
        {
          method: "GET",
          path: "/tasks",
          query: {
            status: filters.status,
            orphans: flag(filters.orphans),
            sort: filters.sort,
            order: filters.order,
          },
        },
        z.array(TaskSchema),
      ),

    triggerScan: () => request(transport, { method: "POST", path: "/scan" }, ScanStatusSchema),

    getScanStatus: () => request(transport, { method: "GET", path: "/scan" }, ScanStatusSchema),
  };
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test src/lib/api/client.test.ts`
Expected: PASS — 17 tests.

- [ ] **Step 8: Typecheck and commit**

Run: `pnpm typecheck` — Expected: exit 0.

```bash
git add src/lib/api/errors.ts src/lib/api/transport.ts src/lib/api/client.ts src/lib/api/test-helpers.ts src/lib/api/client.test.ts
git commit -m "feat(api): add typed api client with result-based error handling

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: HTTP transport

**Files:**
- Modify: `src/lib/api/transport.ts` (append implementation)
- Test: `src/lib/api/transport.test.ts`

**Interfaces:**
- Consumes: `Transport`, `TransportRequest`, `TransportResponse` (Task 2); `createApiClient` (Task 2); `dataOf` (Task 2).
- Produces: `REQUEST_TIMEOUT_MS = 10_000`, `buildUrl(baseUrl: string, path: string, query?: Record<string, string | undefined>): string`, `httpTransport(baseUrl: string, fetchImpl?: typeof fetch): Transport`.

- [ ] **Step 1: Write the failing tests — `src/lib/api/transport.test.ts`**

```ts
// @req SCD-API-001, SCD-API-003
import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";
import { dataOf } from "./test-helpers";
import { buildUrl, httpTransport } from "./transport";

const BASE = "https://api.example.test";

function stubFetch(body: string, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(body, { status }));
}

describe("buildUrl", () => {
  it("joins base, path and defined query params", () => {
    expect(buildUrl(BASE, "/requirements", { type: "FR", status: undefined, order: "desc" })).toBe(
      `${BASE}/requirements?type=FR&order=desc`,
    );
  });

  it("strips whitespace and trailing slashes from the base URL", () => {
    expect(buildUrl(`  ${BASE}//  `, "/stats")).toBe(`${BASE}/stats`);
  });

  it("omits the query string when every param is undefined", () => {
    expect(buildUrl(BASE, "/tasks", { status: undefined })).toBe(`${BASE}/tasks`);
  });
});

describe("httpTransport", () => {
  it("sends method, Accept header and a timeout signal", async () => {
    const fetchImpl = stubFetch("{}", 202);
    await httpTransport(`${BASE}/`, fetchImpl).send({ method: "POST", path: "/scan" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BASE}/scan`);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ Accept: "application/json" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns status and parsed JSON", async () => {
    const response = await httpTransport(BASE, stubFetch('{"a":1}', 201)).send({ method: "GET", path: "/x" });
    expect(response).toEqual({ status: 201, body: { a: 1 } });
  });

  it("returns raw text for non-JSON bodies and null for empty ones", async () => {
    const html = await httpTransport(BASE, stubFetch("<html>Bad Gateway</html>", 502)).send({ method: "GET", path: "/x" });
    const empty = await httpTransport(BASE, stubFetch("", 200)).send({ method: "GET", path: "/x" });
    expect(html).toEqual({ status: 502, body: "<html>Bad Gateway</html>" });
    expect(empty).toEqual({ status: 200, body: null });
  });

  it("rejects when fetch rejects", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(httpTransport(BASE, fetchImpl).send({ method: "GET", path: "/stats" })).rejects.toThrow(
      "Failed to fetch",
    );
  });

  it("puts encoded ids and filters on the wire through the client", async () => {
    const fetchImpl = stubFetch("[]");
    const api = createApiClient(httpTransport(BASE, fetchImpl));
    await api.getRequirement("FR X/1");
    dataOf(await api.listAnnotations({ type: "test", orphans: true }));
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      `${BASE}/requirements/FR%20X%2F1`,
      `${BASE}/annotations?type=test&orphans=true`,
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/api/transport.test.ts`
Expected: FAIL — `buildUrl` / `httpTransport` are not exported.

- [ ] **Step 3: Append the implementation to `src/lib/api/transport.ts`**

```ts
export const REQUEST_TIMEOUT_MS = 10_000;

export function buildUrl(
  baseUrl: string,
  path: string,
  query: Record<string, string | undefined> = {},
): string {
  const url = `${baseUrl.trim().replace(/\/+$/, "")}${path}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value);
  }
  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function httpTransport(
  baseUrl: string,
  // Wrapped so the global is looked up per call (keeps `this` correct and lets tests stub it).
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Transport {
  return {
    async send({ method, path, query }) {
      const response = await fetchImpl(buildUrl(baseUrl, path, query), {
        method,
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      return { status: response.status, body: await readBody(response) };
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/api/transport.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck` — Expected: exit 0.

```bash
git add src/lib/api/transport.ts src/lib/api/transport.test.ts
git commit -m "feat(api): add fetch-based http transport with timeout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Mock transport

**Files:**
- Create: `src/lib/api/mock.ts`
- Test: `src/lib/api/mock.test.ts`

**Interfaces:**
- Consumes: `Transport`, `TransportRequest`, `TransportResponse` (Task 2); `createApiClient`, `dataOf`, `errorOf` (Task 2); fixtures in `data/` (Task 1).
- Produces: `MOCK_DELAY_MS = 300`, `MOCK_SCAN_DURATION_MS = 1500`, `interface MockOptions { delayMs?: number; now?: () => number }`, `mockTransport(options?: MockOptions): Transport`.

- [ ] **Step 1: Write the failing tests — `src/lib/api/mock.test.ts`**

```ts
// @req SCD-API-001, SCD-API-002
import { afterEach, describe, expect, it, vi } from "vitest";
import stats from "../../../data/stats.json";
import { createApiClient } from "./client";
import { MOCK_SCAN_DURATION_MS, mockTransport } from "./mock";
import { dataOf, errorOf } from "./test-helpers";

const api = createApiClient(mockTransport({ delayMs: 0 }));
const ids = <T extends { id: string }>(rows: T[]) => rows.map((row) => row.id);

describe("mock /stats", () => {
  it("returns the stats fixture", async () => {
    expect(dataOf(await api.getStats())).toEqual(stats);
  });
});

describe("mock /requirements", () => {
  it("sorts by id ascending by default", async () => {
    expect(ids(dataOf(await api.listRequirements()))).toEqual([
      "AR-PERF-001", "AR-SEC-001", "FR-API-001", "FR-API-002",
      "FR-API-003", "FR-SCAN-001", "FR-SCAN-002", "FR-SCAN-003",
    ]);
  });

  it("sorts by id descending", async () => {
    expect(ids(dataOf(await api.listRequirements({ order: "desc" })))[0]).toBe("FR-SCAN-003");
  });

  it("sorts by updatedAt, breaking ties by id", async () => {
    expect(ids(dataOf(await api.listRequirements({ sort: "updatedAt" })))).toEqual([
      "AR-PERF-001", "FR-API-003", "AR-SEC-001", "FR-API-002",
      "FR-SCAN-001", "FR-SCAN-003", "FR-API-001", "FR-SCAN-002",
    ]);
    expect(ids(dataOf(await api.listRequirements({ sort: "updatedAt", order: "desc" })))).toEqual([
      "FR-SCAN-002", "FR-API-001", "FR-SCAN-003", "FR-SCAN-001",
      "FR-API-002", "AR-SEC-001", "FR-API-003", "AR-PERF-001",
    ]);
  });

  it("filters by type, status and both", async () => {
    expect(ids(dataOf(await api.listRequirements({ type: "AR" })))).toEqual(["AR-PERF-001", "AR-SEC-001"]);
    expect(ids(dataOf(await api.listRequirements({ status: "covered" })))).toHaveLength(5);
    expect(ids(dataOf(await api.listRequirements({ type: "FR", status: "partial" })))).toEqual(["FR-API-003"]);
    expect(dataOf(await api.listRequirements({ type: "AR", status: "covered" }))).toEqual([]);
  });
});

describe("mock /requirements/{id}", () => {
  it("joins annotations (by file, line) and tasks", async () => {
    const detail = dataOf(await api.getRequirement("FR-SCAN-001"));
    expect(detail.status).toBe("covered");
    expect(detail.annotations.map((a) => `${a.file}:${a.line}:${a.type}`)).toEqual([
      "src/parser.rs:15:impl",
      "src/parser.rs:58:impl",
      "tests/parser_test.rs:12:test",
    ]);
    expect(ids(detail.tasks)).toEqual(["TASK-001"]);
  });

  it("returns empty chains for an unaddressed requirement", async () => {
    const detail = dataOf(await api.getRequirement("AR-SEC-001"));
    expect(detail.annotations).toEqual([]);
    expect(detail.tasks).toEqual([]);
  });

  it("returns not_found in the API's wording, decoding the id", async () => {
    expect(errorOf(await api.getRequirement("FR-UNKNOWN-999"))).toEqual({
      kind: "not_found",
      message: "Requirement 'FR-UNKNOWN-999' not found",
    });
    expect(errorOf(await api.getRequirement("FR X/1"))).toEqual({
      kind: "not_found",
      message: "Requirement 'FR X/1' not found",
    });
  });
});

describe("mock /annotations", () => {
  it("returns all 16 sorted by file then line", async () => {
    const rows = dataOf(await api.listAnnotations());
    expect(rows).toHaveLength(16);
    expect(`${rows[0].file}:${rows[0].line}`).toBe("src/api/legacy.rs:5");
    expect(`${rows[15].file}:${rows[15].line}`).toBe("tests/scanner_test.rs:34");
  });

  it("filters orphans and type", async () => {
    expect(dataOf(await api.listAnnotations({ orphans: true })).map((a) => a.reqId)).toEqual([
      "FR-LEGACY-001",
      "FR-API-099",
    ]);
    expect(dataOf(await api.listAnnotations({ type: "test" }))).toHaveLength(6);
    expect(dataOf(await api.listAnnotations({ type: "test", orphans: true })).map((a) => a.reqId)).toEqual([
      "FR-API-099",
    ]);
    expect(dataOf(await api.listAnnotations({ orphans: false }))).toHaveLength(16);
  });
});

describe("mock /tasks", () => {
  it("filters by status and orphans", async () => {
    expect(ids(dataOf(await api.listTasks({ status: "open" })))).toEqual(["TASK-004", "TASK-005", "TASK-006"]);
    expect(ids(dataOf(await api.listTasks({ orphans: true })))).toEqual(["TASK-006"]);
  });

  it("sorts by updatedAt descending", async () => {
    expect(ids(dataOf(await api.listTasks({ sort: "updatedAt", order: "desc" })))).toEqual([
      "TASK-003", "TASK-002", "TASK-006", "TASK-005", "TASK-001", "TASK-004",
    ]);
  });
});

describe("mock /scan", () => {
  it("runs a scan lifecycle against the injected clock", async () => {
    let clock = Date.parse("2026-09-25T12:00:00Z");
    const scanApi = createApiClient(mockTransport({ delayMs: 0, now: () => clock }));

    expect(dataOf(await scanApi.getScanStatus()).status).toBe("completed");

    const started = dataOf(await scanApi.triggerScan());
    expect(started).toEqual({ status: "scanning", startedAt: "2026-09-25T12:00:00.000Z" });

    clock += 500;
    expect(dataOf(await scanApi.triggerScan()).startedAt).toBe(started.startedAt);

    clock += MOCK_SCAN_DURATION_MS - 501;
    expect(dataOf(await scanApi.getScanStatus()).status).toBe("scanning");

    clock += 1;
    expect(dataOf(await scanApi.getScanStatus())).toEqual({
      status: "completed",
      startedAt: "2026-09-25T12:00:00.000Z",
      completedAt: "2026-09-25T12:00:01.500Z",
      duration: MOCK_SCAN_DURATION_MS,
    });
  });
});

describe("mock transport", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("delays responses by delayMs", async () => {
    vi.useFakeTimers();
    let settled = false;
    const pending = mockTransport({ delayMs: 300 })
      .send({ method: "GET", path: "/stats" })
      .then(() => {
        settled = true;
      });
    await vi.advanceTimersByTimeAsync(299);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toBe(true);
  });

  it("answers unknown routes with 404", async () => {
    const response = await mockTransport({ delayMs: 0 }).send({ method: "GET", path: "/nope" });
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/api/mock.test.ts`
Expected: FAIL — `Failed to resolve import "./mock"`.

- [ ] **Step 3: Write `src/lib/api/mock.ts`**

```ts
// @req SCD-API-001, SCD-API-002
// In-process implementation of the SDD Navigator API over data/*.json. Returns raw
// JSON exactly as the live API would, so responses go through the same validation.
import annotationsData from "../../../data/annotations.json";
import requirementsData from "../../../data/requirements.json";
import scanData from "../../../data/scan.json";
import statsData from "../../../data/stats.json";
import tasksData from "../../../data/tasks.json";
import type { Transport, TransportRequest, TransportResponse } from "./transport";

export const MOCK_DELAY_MS = 300;
export const MOCK_SCAN_DURATION_MS = 1500;

export interface MockOptions {
  /** Artificial latency per response so loading states are visible. */
  delayMs?: number;
  /** Clock used for the scan lifecycle. */
  now?: () => number;
}

interface ScanRecord {
  status: string;
  startedAt: string;
  completedAt?: string;
  duration?: number;
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function sortRows<T extends { id: string; updatedAt: string }>(
  rows: readonly T[],
  sort: string | undefined,
  order: string | undefined,
): T[] {
  const field = sort === "updatedAt" ? "updatedAt" : "id";
  const direction = order === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => direction * (compareText(a[field], b[field]) || compareText(a.id, b.id)));
}

const sortedAnnotations = [...annotationsData].sort(
  (a, b) => compareText(a.file, b.file) || a.line - b.line,
);
const requirementIds = new Set(requirementsData.map((r) => r.id));

const respond = (status: number, body: unknown): TransportResponse => ({ status, body });
const notFound = (message: string) => respond(404, { error: "not_found", message });

export function mockTransport({ delayMs = MOCK_DELAY_MS, now = Date.now }: MockOptions = {}): Transport {
  let scan: ScanRecord = { ...scanData };

  function currentScan(): ScanRecord {
    const startedAt = Date.parse(scan.startedAt);
    if (scan.status === "scanning" && now() - startedAt >= MOCK_SCAN_DURATION_MS) {
      scan = {
        status: "completed",
        startedAt: scan.startedAt,
        completedAt: new Date(startedAt + MOCK_SCAN_DURATION_MS).toISOString(),
        duration: MOCK_SCAN_DURATION_MS,
      };
    }
    return scan;
  }

  function route({ method, path, query = {} }: TransportRequest): TransportResponse {
    if (method === "GET" && path === "/stats") return respond(200, statsData);

    if (method === "GET" && path === "/requirements") {
      const rows = requirementsData.filter(
        (r) => (!query.type || r.type === query.type) && (!query.status || r.status === query.status),
      );
      return respond(200, sortRows(rows, query.sort, query.order));
    }

    const detail = method === "GET" ? /^\/requirements\/([^/]+)$/.exec(path) : null;
    if (detail) {
      const id = decodeURIComponent(detail[1]);
      const requirement = requirementsData.find((r) => r.id === id);
      if (!requirement) return notFound(`Requirement '${id}' not found`);
      return respond(200, {
        ...requirement,
        annotations: sortedAnnotations.filter((a) => a.reqId === id),
        tasks: sortRows(
          tasksData.filter((t) => t.requirementId === id),
          undefined,
          undefined,
        ),
      });
    }

    if (method === "GET" && path === "/annotations") {
      const rows = sortedAnnotations.filter(
        (a) =>
          (!query.type || a.type === query.type) &&
          (query.orphans !== "true" || !requirementIds.has(a.reqId)),
      );
      return respond(200, rows);
    }

    if (method === "GET" && path === "/tasks") {
      const rows = tasksData.filter(
        (t) =>
          (!query.status || t.status === query.status) &&
          (query.orphans !== "true" || !requirementIds.has(t.requirementId)),
      );
      return respond(200, sortRows(rows, query.sort, query.order));
    }

    if (path === "/scan") {
      if (method === "POST") {
        if (currentScan().status !== "scanning") {
          scan = { status: "scanning", startedAt: new Date(now()).toISOString() };
        }
        return respond(202, scan);
      }
      return respond(200, currentScan());
    }

    return notFound(`No mock route for ${method} ${path}`);
  }

  return {
    async send(request) {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return route(request);
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/api/mock.test.ts`
Expected: PASS — 15 tests.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck` — Expected: exit 0.

```bash
git add src/lib/api/mock.ts src/lib/api/mock.test.ts
git commit -m "feat(api): add mock transport backed by local fixtures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Mode selection, public entry point and live contract test

**Files:**
- Create: `src/lib/api/config.ts`
- Create: `src/lib/api/index.ts`
- Test: `src/lib/api/config.test.ts`
- Create: `src/lib/api/live.contract.ts`

**Interfaces:**
- Consumes: `createApiClient`, `ApiClient` and filter types (Task 2); `httpTransport`, `Transport` (Task 3); `mockTransport` (Task 4); schema types (Task 1).
- Produces (the app's import surface, `@/lib/api`): `getStats`, `listRequirements`, `getRequirement`, `listAnnotations`, `listTasks`, `triggerScan`, `getScanStatus`, `dataMode`, `apiBaseUrl`, and the types `DataMode`, `ApiError`, `Result`, `ApiClient`, `RequirementFilters`, `AnnotationFilters`, `TaskFilters`, `SortField`, `SortOrder` and all schema types. From `config.ts`: `resolveApiBaseUrl(value: string | undefined): string | undefined`, `createTransport(baseUrl: string | undefined): Transport`.

- [ ] **Step 1: Write the failing tests — `src/lib/api/config.test.ts`**

```ts
// @req SCD-API-001, SCD-API-003
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";
import { createTransport, resolveApiBaseUrl } from "./config";
import * as api from "./index";
import { dataOf } from "./test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveApiBaseUrl", () => {
  it.each([undefined, "", "   "])("treats %j as unset (mock mode)", (value) => {
    expect(resolveApiBaseUrl(value)).toBeUndefined();
  });

  it("trims a configured URL", () => {
    expect(resolveApiBaseUrl("  https://api.example.test/  ")).toBe("https://api.example.test/");
  });
});

describe("createTransport", () => {
  it("serves fixtures when no base URL is configured", async () => {
    const stats = dataOf(await createApiClient(createTransport(undefined)).getStats());
    expect(stats.coverage).toBe(62.5);
  });

  it("calls the configured API when a base URL is set", async () => {
    const fetchStub = vi.fn<typeof fetch>(async () => new Response("[]"));
    vi.stubGlobal("fetch", fetchStub);
    dataOf(await createApiClient(createTransport("https://api.example.test/")).listTasks());
    expect(fetchStub.mock.calls[0][0]).toBe("https://api.example.test/tasks");
  });
});

describe("@/lib/api entry point", () => {
  it("runs in mock mode when NEXT_PUBLIC_API_URL is unset", () => {
    expect(api.dataMode).toBe("mock");
    expect(api.apiBaseUrl).toBeUndefined();
  });

  it("exports all seven endpoint functions", () => {
    for (const fn of [
      api.getStats, api.listRequirements, api.getRequirement, api.listAnnotations,
      api.listTasks, api.triggerScan, api.getScanStatus,
    ]) {
      expect(fn).toBeTypeOf("function");
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/api/config.test.ts`
Expected: FAIL — `Failed to resolve import "./config"`.

- [ ] **Step 3: Write `src/lib/api/config.ts`**

```ts
// @req SCD-API-001
import { mockTransport } from "./mock";
import { httpTransport, type Transport } from "./transport";

export type DataMode = "api" | "mock";

export function resolveApiBaseUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// Must be read as the literal `process.env.NEXT_PUBLIC_API_URL` so Next.js inlines it at build time.
export const apiBaseUrl = resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
export const dataMode: DataMode = apiBaseUrl ? "api" : "mock";

export function createTransport(baseUrl: string | undefined): Transport {
  return baseUrl ? httpTransport(baseUrl) : mockTransport();
}
```

- [ ] **Step 4: Write `src/lib/api/index.ts`**

```ts
// @req SCD-API-001, SCD-API-003
// The app's only entry point for data: import from "@/lib/api".
import { createApiClient } from "./client";
import { apiBaseUrl, createTransport } from "./config";

const client = createApiClient(createTransport(apiBaseUrl));

export const {
  getStats,
  listRequirements,
  getRequirement,
  listAnnotations,
  listTasks,
  triggerScan,
  getScanStatus,
} = client;

export { apiBaseUrl, dataMode, type DataMode } from "./config";
export type { ApiError, Result } from "./errors";
export type {
  AnnotationFilters,
  ApiClient,
  RequirementFilters,
  SortField,
  SortOrder,
  TaskFilters,
} from "./client";
export type {
  Annotation,
  AnnotationStats,
  AnnotationType,
  ApiErrorBody,
  CoverageStatus,
  Requirement,
  RequirementDetail,
  RequirementStats,
  RequirementType,
  ScanState,
  ScanStatus,
  Stats,
  Task,
  TaskStats,
  TaskStatus,
} from "./schemas";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test src/lib/api/config.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 6: Write the opt-in live contract test — `src/lib/api/live.contract.ts`**

```ts
// @req SCD-API-002
// Checks the live API still matches our schemas. Run with `pnpm test:contract`;
// never part of `pnpm test` or the git hooks. Does not call POST /scan.
import { describe, expect, it } from "vitest";
import { createApiClient } from "./client";
import type { Result } from "./errors";
import { httpTransport } from "./transport";

const baseUrl = process.env.CONTRACT_API_URL ?? "https://api.pdd.foreachpartners.com";
const api = createApiClient(httpTransport(baseUrl));

const calls: Array<[string, () => Promise<Result<unknown>>]> = [
  ["GET /stats", () => api.getStats()],
  ["GET /requirements", () => api.listRequirements()],
  ["GET /requirements?type=AR&sort=updatedAt&order=desc", () => api.listRequirements({ type: "AR", sort: "updatedAt", order: "desc" })],
  ["GET /requirements/FR-SCAN-001", () => api.getRequirement("FR-SCAN-001")],
  ["GET /annotations?orphans=true", () => api.listAnnotations({ orphans: true })],
  ["GET /tasks", () => api.listTasks()],
  ["GET /scan", () => api.getScanStatus()],
];

describe(`live API contract (${baseUrl})`, () => {
  it.each(calls)("%s matches the schema", async (_name, call) => {
    const result = await call();
    expect(result.ok ? null : result.error).toBeNull();
  }, 20_000);

  it("answers an unknown requirement with not_found", async () => {
    const result = await api.getRequirement("FR-UNKNOWN-999");
    expect(result.ok ? null : result.error.kind).toBe("not_found");
  }, 20_000);
});
```

- [ ] **Step 7: Run the full suite and the contract test**

Run: `pnpm test`
Expected: PASS — 5 files (`fixtures`, `client`, `transport`, `mock`, `config`), 66 tests; `live.contract.ts` is not collected.

Run: `pnpm test:contract`
Expected: PASS — 8 tests (needs network; if the registry-style network flakiness hits, rerun once).

- [ ] **Step 8: Typecheck, lint and commit**

Run: `pnpm typecheck && pnpm lint` — Expected: exit 0, no lint errors.

```bash
git add src/lib/api/config.ts src/lib/api/index.ts src/lib/api/config.test.ts src/lib/api/live.contract.ts
git commit -m "feat(api): select api or mock mode from NEXT_PUBLIC_API_URL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
