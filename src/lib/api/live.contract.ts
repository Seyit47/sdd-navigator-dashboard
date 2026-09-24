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
