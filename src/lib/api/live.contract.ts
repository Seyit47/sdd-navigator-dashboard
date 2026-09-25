// @req SCD-API-002
// Checks the live API still matches our schemas. Run with `pnpm test:contract`;
// never part of `pnpm test` or the git hooks. Does not call POST /scan.
import { describe, expect, it } from "vitest";
import { fetchRequirements, fetchTasks } from "@/lib/dashboard/fetch";
import { DEFAULT_QUERY } from "@/lib/dashboard/query";
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

// @req SCD-API-002
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

// @req SCD-FLT-001, SCD-FLT-003, SCD-SORT-001
describe(`filters reach the live API (${baseUrl})`, () => {
  it("returns only requirements of the requested type", async () => {
    const result = await fetchRequirements({ ...DEFAULT_QUERY, types: ["AR"] }, api);
    const rows = result.ok ? result.data : [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.type === "AR")).toBe(true);
  }, 20_000);

  it("merges several statuses in the requested order", async () => {
    const result = await fetchRequirements(
      { ...DEFAULT_QUERY, statuses: ["partial", "missing"], sort: "updatedAt", order: "desc" },
      api,
    );
    const rows = result.ok ? result.data : [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.status === "partial" || r.status === "missing")).toBe(true);
    expect(rows.map((r) => r.updatedAt)).toEqual([...rows.map((r) => r.updatedAt)].sort().reverse());
  }, 20_000);

  it("returns only tasks with the requested status", async () => {
    const result = await fetchTasks({ ...DEFAULT_QUERY, taskStatuses: ["done"] }, api);
    const rows = result.ok ? result.data : [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((t) => t.status === "done")).toBe(true);
  }, 20_000);
});
