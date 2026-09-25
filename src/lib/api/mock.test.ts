// @req SCD-API-001, SCD-API-002
import { afterEach, describe, expect, it, vi } from "vitest";
import stats from "../../../data/stats.json";
import { createApiClient } from "./client";
import { MOCK_SCAN_DURATION_MS, mockTransport } from "./mock";
import { dataOf, errorOf } from "./test-helpers";

const api = createApiClient(mockTransport({ delayMs: 0 }));
const ids = <T extends { id: string }>(rows: T[]) => rows.map((row) => row.id);

// @req SCD-API-002
describe("mock /stats", () => {
  it("returns the stats fixture", async () => {
    expect(dataOf(await api.getStats())).toEqual(stats);
  });
});

// @req SCD-API-002, SCD-SORT-001
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

// @req SCD-API-002
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

// @req SCD-API-002
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

// @req SCD-API-002
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

// @req SCD-API-002
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

// @req SCD-API-002, SCD-STATE-001
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
