// @req SCD-FLT-001, SCD-FLT-002, SCD-FLT-003, SCD-SORT-001
// The dashboard's view state lives in the URL; these pure functions read, write and apply it.
import type {
  CoverageStatus,
  Requirement,
  RequirementType,
  SortField,
  SortOrder,
  Task,
  TaskStatus,
} from "@/lib/api";
import { COVERAGE_STATUSES, REQUIREMENT_TYPES, TASK_STATUSES } from "./options";

export interface DashboardQuery {
  q: string;
  types: RequirementType[];
  statuses: CoverageStatus[];
  sort: SortField;
  order: SortOrder;
  taskStatuses: TaskStatus[];
}

export const DEFAULT_QUERY: DashboardQuery = {
  q: "",
  types: [],
  statuses: [],
  sort: "id",
  order: "asc",
  taskStatuses: [],
};

/** The subset of URLSearchParams / ReadonlyURLSearchParams we read. */
export interface QueryParams {
  get(name: string): string | null;
  getAll(name: string): string[];
}

/** Keeps allowed values only, without duplicates, in the canonical order of `allowed`. */
function pick<T extends string>(values: readonly string[], allowed: readonly T[]): T[] {
  return allowed.filter((value) => values.includes(value));
}

export function parseDashboardQuery(params: QueryParams): DashboardQuery {
  return {
    q: (params.get("q") ?? "").trim(),
    types: pick(params.getAll("type"), REQUIREMENT_TYPES),
    statuses: pick(params.getAll("status"), COVERAGE_STATUSES),
    sort: params.get("sort") === "updatedAt" ? "updatedAt" : "id",
    order: params.get("order") === "desc" ? "desc" : "asc",
    taskStatuses: pick(params.getAll("taskStatus"), TASK_STATUSES),
  };
}

/** Returns "" for the default query, otherwise "?…" with defaults omitted. */
export function serializeDashboardQuery(query: DashboardQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  for (const type of query.types) params.append("type", type);
  for (const status of query.statuses) params.append("status", status);
  if (query.sort !== "id") params.set("sort", query.sort);
  if (query.order !== "asc") params.set("order", query.order);
  for (const status of query.taskStatuses) params.append("taskStatus", status);
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** Converts Next.js `searchParams` into URLSearchParams. */
export function searchParamsFromRecord(record: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) for (const item of value) params.append(key, item);
    else if (value !== undefined) params.append(key, value);
  }
  return params;
}

export function toggleValue<T extends string>(selected: readonly T[], value: T, allowed: readonly T[]): T[] {
  const next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
  return pick(next, allowed);
}

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

export function applyTaskQuery(rows: readonly Task[], query: DashboardQuery): Task[] {
  return rows.filter((t) => query.taskStatuses.length === 0 || query.taskStatuses.includes(t.status));
}
