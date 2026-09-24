# Data layer design — SDD Navigator Dashboard

Date: 2026-09-25 · Status: approved design, pending spec review

## Goal

A typed client for the SDD Navigator API (OpenAPI v3.0.0, https://api.pdd.foreachpartners.com/spec/sdd-coverage-api.yaml) that the
dashboard UI uses for all data access, working identically against the live API or local mock
data. Implements SCD-API-001, SCD-API-002, SCD-API-003 from `requirements.yaml`.

## Decisions

| Topic | Decision |
|---|---|
| Types + runtime validation | Zod schemas are the single source; TS types via `z.infer`. Every response (API and mock) is parsed. |
| Mode switch | `NEXT_PUBLIC_API_URL` non-empty → HTTP transport; unset/empty → mock transport. |
| Pipeline | Both modes share one path: build request → `Transport.send` → status check → Zod parse → `Result`. |
| Failure reporting | Expected failures return `Result` values; only programmer errors throw. |
| Mock data source | Copied from the live API (matches step-2 figures exactly). |
| Tests | Vitest; `pnpm test` runs in pre-commit and pre-push hooks. Live contract test is opt-in. |

## Module layout (`src/lib/api/`, imported as `@/lib/api`)

| File | Responsibility |
|---|---|
| `schemas.ts` | Zod schemas for `RequirementType`, `CoverageStatus`, `AnnotationType`, `TaskStatus`, `ScanState`, `RequirementStats`, `AnnotationStats`, `TaskStats`, `Stats`, `Requirement`, `RequirementDetail`, `Annotation`, `Task`, `ScanStatus`, `ApiErrorBody`; exported inferred types. |
| `errors.ts` | `ApiError`, `Result<T>`, helpers `ok()` / `err()`. |
| `transport.ts` | `Transport` interface and `httpTransport(baseUrl)`. |
| `mock.ts` | `mockTransport()` — in-process implementation of the API over `data/*.json`. |
| `config.ts` | `dataMode: "api" \| "mock"`, `apiBaseUrl`, `getTransport()`. |
| `index.ts` | Public functions and re-exported types. |

### Public functions

All return `Promise<Result<T>>`.

| Function | Request | `T` |
|---|---|---|
| `getStats()` | `GET /stats` | `Stats` |
| `listRequirements(filters?)` | `GET /requirements` — `type?`, `status?`, `sort?: "id" \| "updatedAt"`, `order?: "asc" \| "desc"` | `Requirement[]` |
| `getRequirement(id)` | `GET /requirements/{id}` (id URL-encoded) | `RequirementDetail` |
| `listAnnotations(filters?)` | `GET /annotations` — `type?`, `orphans?: boolean` | `Annotation[]` |
| `listTasks(filters?)` | `GET /tasks` — `status?`, `orphans?`, `sort?`, `order?` | `Task[]` |
| `triggerScan()` | `POST /scan` (API answers 202) | `ScanStatus` |
| `getScanStatus()` | `GET /scan` | `ScanStatus` |

Filter parameters are typed from the enums, so invalid values (which the live API answers with
`200 []`) cannot be sent. Undefined filters are omitted from the query string.

### Transport

```ts
interface TransportRequest {
  method: "GET" | "POST";
  path: string;                                   // e.g. "/requirements/FR-SCAN-001"
  query?: Record<string, string | undefined>;
}
interface TransportResponse { status: number; body: unknown }  // body: parsed JSON, or raw text if not JSON
interface Transport { send(req: TransportRequest): Promise<TransportResponse> }
```

`httpTransport` joins `baseUrl` (trailing slash stripped) with the path and query, calls `fetch`
with `AbortSignal.timeout(10_000)`, and returns the status with the parsed body. A rejected
`fetch` (offline, DNS, CORS, timeout) rejects the transport promise; the client maps it to a
`network` error.

## Errors

```ts
type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError };

type ApiError =
  | { kind: "network"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "http"; status: number; message: string }
  | { kind: "invalid_response"; message: string; issues: string[] };
```

| Condition | Result |
|---|---|
| Transport rejects (fetch failure, timeout) | `network` |
| Status 404 | `not_found`, message from the `{error, message}` body, else a generic message |
| Other non-2xx | `http` with status; message from the error body, else `HTTP <status>` |
| Body not JSON, or fails the Zod schema | `invalid_response` with Zod issue paths/messages |
| Any 2xx status and valid body | `{ ok: true, data }` |

## Mock mode

Data files at the repository root, each shaped exactly like the matching API response:

| File | Content |
|---|---|
| `data/stats.json` | `Stats`: 8 requirements (FR 6, AR 2; covered 5, partial 1, missing 2), 16 annotations (10 impl, 6 test, 2 orphans), 6 tasks (done 2, in_progress 1, open 3, 1 orphan), coverage 62.5 |
| `data/requirements.json` | 8 `Requirement`s: FR-SCAN-001..003, FR-API-001..003, AR-PERF-001, AR-SEC-001 |
| `data/annotations.json` | 16 `Annotation`s — 14 linked, 2 orphans (FR-LEGACY-001, FR-API-099) |
| `data/tasks.json` | 6 `Task`s — 5 linked, 1 orphan (TASK-006 → FR-EXPORT-001) |
| `data/scan.json` | Initial `ScanStatus` (completed) |

Files are imported statically so they work in server and client components.

`mockTransport` behaviour, matching the live API:

- `/requirements`: filter by `type` and `status`; sort by `id` (default) or `updatedAt`; `order` asc (default) or desc.
- `/requirements/{id}`: requirement joined with annotations where `reqId === id` and tasks where
  `requirementId === id`; unknown id → 404 with `{error: "not_found", message: "Requirement '<id>' not found"}`.
- `/annotations`: sorted by file then line; `type` filter; `orphans=true` → only annotations whose `reqId` is not a known requirement.
- `/tasks`: `status` filter, `orphans`, `sort`/`order` as for requirements.
- `POST /scan` → 202 `{status: "scanning", startedAt: now}`; `GET /scan` reports `completed` with
  `completedAt` and `duration` once ~1.5 s have passed. Scans do not change the data.
- Every response is delayed ~300 ms so loading states are visible.
- Unknown route → 404.

## Testing

Vitest, with `pnpm test` (unit, no network) and `pnpm test:contract` (live API, opt-in, excluded
from `pnpm test`). `pnpm typecheck` runs `tsc --noEmit`.

1. **Fixture conformance** (SCD-API-002): each `data/*.json` passes its schema.
2. **Fixture consistency**: `stats.json` equals the counts derived from the other files; `coverage = covered / total × 100`; each requirement's `status` matches its annotations (covered = impl + test, partial = impl only, missing = none).
3. **Mock behaviour**: all filter/sort/order combinations, `orphans`, detail join, 404, scan lifecycle (fake timers).
4. **HTTP transport and error mapping** (stubbed `fetch`): query building and encoding, network error, 404, 500 with and without an error body, non-JSON body, schema mismatch.
5. **Contract** (opt-in): every endpoint of the live API parses against the schemas.

The husky pre-commit and pre-push hooks run `pnpm test` in addition to `pnpm build`.

## Traceability

Source and test files carry `// @req SCD-…` annotations (e.g. `@req SCD-API-001` in `config.ts`,
`@req SCD-API-002` in the fixture tests) so the SDD Navigator scanner can report the dashboard's
own coverage.

## Out of scope

`/healthcheck`, caching, retries, React hooks/data fetching in components (UI step).
