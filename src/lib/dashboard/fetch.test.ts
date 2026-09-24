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
