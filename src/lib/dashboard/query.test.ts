// @req SCD-FLT-001, SCD-FLT-002, SCD-FLT-003, SCD-SORT-001
import { beforeAll, describe, expect, it } from "vitest";
import type { Requirement, Task } from "@/lib/api";
import { loadFixtures } from "@/test/fixtures";
import { COVERAGE_STATUSES, REQUIREMENT_TYPES } from "./options";
import {
  DEFAULT_QUERY,
  applyRequirementQuery,
  applyTaskQuery,
  parseDashboardQuery,
  searchParamsFromRecord,
  serializeDashboardQuery,
  toggleValue,
  type DashboardQuery,
} from "./query";

let requirements: Requirement[];
let tasks: Task[];

beforeAll(async () => {
  ({ requirements, tasks } = await loadFixtures());
});

const parse = (search: string) => parseDashboardQuery(new URLSearchParams(search));
const query = (patch: Partial<DashboardQuery>): DashboardQuery => ({ ...DEFAULT_QUERY, ...patch });
const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

// @req SCD-FLT-001, SCD-FLT-002, SCD-FLT-003, SCD-SORT-001
describe("parseDashboardQuery", () => {
  it("returns the defaults for an empty query", () => {
    expect(parse("")).toEqual(DEFAULT_QUERY);
  });

  it("reads repeated params in canonical order", () => {
    expect(parse("?status=missing&type=AR&status=covered&type=FR&taskStatus=done&taskStatus=open")).toEqual(
      query({ types: ["FR", "AR"], statuses: ["covered", "missing"], taskStatuses: ["open", "done"] }),
    );
  });

  it("drops unknown values, duplicates and bad sort/order", () => {
    expect(parse("?type=fr&type=XX&status=bogus&status=missing&status=missing&sort=title&order=sideways")).toEqual(
      query({ statuses: ["missing"] }),
    );
  });

  it("trims the search text", () => {
    expect(parse("?q=%20%20scan%20").q).toBe("scan");
  });

  it("reads sort and order", () => {
    expect(parse("?sort=updatedAt&order=desc")).toEqual(query({ sort: "updatedAt", order: "desc" }));
  });

  it("takes the first sort param when it is repeated", () => {
    expect(parse("?sort=updatedAt&sort=id").sort).toBe("updatedAt");
  });
});

// @req SCD-FLT-001, SCD-FLT-002, SCD-FLT-003, SCD-SORT-001
describe("serializeDashboardQuery", () => {
  it("is empty for the default query", () => {
    expect(serializeDashboardQuery(DEFAULT_QUERY)).toBe("");
  });

  it("omits defaults and repeats multi-value params", () => {
    expect(
      serializeDashboardQuery(
        query({ types: ["FR"], statuses: ["covered", "partial"], order: "desc", taskStatuses: ["open"] }),
      ),
    ).toBe("?type=FR&status=covered&status=partial&order=desc&taskStatus=open");
  });

  it("round-trips through parseDashboardQuery", () => {
    const original = query({
      q: "needs tests",
      types: ["AR"],
      sort: "updatedAt",
      order: "desc",
      taskStatuses: ["in_progress", "done"],
    });
    expect(parse(serializeDashboardQuery(original))).toEqual(original);
  });
});

// @req SCD-UI-004
describe("searchParamsFromRecord", () => {
  it("expands arrays and skips undefined values", () => {
    expect(searchParamsFromRecord({ type: "FR", status: ["covered", "partial"], q: undefined }).toString()).toBe(
      "type=FR&status=covered&status=partial",
    );
  });
});

// @req SCD-FLT-001
describe("toggleValue", () => {
  it("adds a value in canonical order", () => {
    expect(toggleValue(["missing"], "covered", COVERAGE_STATUSES)).toEqual(["covered", "missing"]);
  });

  it("removes a selected value", () => {
    expect(toggleValue(["FR", "AR"], "FR", REQUIREMENT_TYPES)).toEqual(["AR"]);
  });
});

// @req SCD-FLT-001, SCD-FLT-002, SCD-SORT-001
describe("applyRequirementQuery", () => {
  it("returns every row sorted by id by default", () => {
    expect(ids(applyRequirementQuery(requirements, DEFAULT_QUERY))).toEqual([
      "AR-PERF-001", "AR-SEC-001", "FR-API-001", "FR-API-002",
      "FR-API-003", "FR-SCAN-001", "FR-SCAN-002", "FR-SCAN-003",
    ]);
  });

  it("filters by one type", () => {
    expect(ids(applyRequirementQuery(requirements, query({ types: ["AR"] })))).toEqual(["AR-PERF-001", "AR-SEC-001"]);
  });

  it("ORs values within a group and ANDs across groups", () => {
    expect(ids(applyRequirementQuery(requirements, query({ statuses: ["covered", "partial"] })))).toHaveLength(6);
    expect(ids(applyRequirementQuery(requirements, query({ types: ["FR"], statuses: ["partial", "missing"] })))).toEqual([
      "FR-API-003",
    ]);
  });

  it("searches id and title case-insensitively", () => {
    expect(ids(applyRequirementQuery(requirements, query({ q: "SCAN" })))).toEqual([
      "AR-PERF-001", "AR-SEC-001", "FR-SCAN-001", "FR-SCAN-002", "FR-SCAN-003",
    ]);
    expect(ids(applyRequirementQuery(requirements, query({ q: "yaml" })))).toEqual(["FR-SCAN-001"]);
  });

  it("treats regex characters literally", () => {
    expect(ids(applyRequirementQuery(requirements, query({ q: "(10 req/min)" })))).toEqual(["AR-SEC-001"]);
  });

  it("sorts by updatedAt with an id tie-break in both directions", () => {
    expect(ids(applyRequirementQuery(requirements, query({ sort: "updatedAt" })))).toEqual([
      "AR-PERF-001", "FR-API-003", "AR-SEC-001", "FR-API-002",
      "FR-SCAN-001", "FR-SCAN-003", "FR-API-001", "FR-SCAN-002",
    ]);
    expect(ids(applyRequirementQuery(requirements, query({ sort: "updatedAt", order: "desc" })))).toEqual([
      "FR-SCAN-002", "FR-API-001", "FR-SCAN-003", "FR-SCAN-001",
      "FR-API-002", "AR-SEC-001", "FR-API-003", "AR-PERF-001",
    ]);
  });

  it("does not mutate its input", () => {
    const before = ids(requirements);
    applyRequirementQuery(requirements, query({ order: "desc" }));
    expect(ids(requirements)).toEqual(before);
  });

  it("returns an empty list when nothing matches", () => {
    expect(applyRequirementQuery(requirements, query({ types: ["AR"], statuses: ["covered"] }))).toEqual([]);
  });
});

// @req SCD-FLT-003
describe("applyTaskQuery", () => {
  it("returns every task without a filter", () => {
    expect(applyTaskQuery(tasks, DEFAULT_QUERY)).toHaveLength(6);
  });

  it("ORs task statuses", () => {
    expect(ids(applyTaskQuery(tasks, query({ taskStatuses: ["done", "in_progress"] })))).toEqual([
      "TASK-001", "TASK-002", "TASK-003",
    ]);
  });
});
