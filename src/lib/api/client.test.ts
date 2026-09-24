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
