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
