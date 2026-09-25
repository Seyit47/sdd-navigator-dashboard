// @req SCD-API-001, SCD-API-003
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";
import { createTransport, resolveApiBaseUrl } from "./config";
import * as api from "./index";
import { dataOf } from "./test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

// @req SCD-API-001
describe("resolveApiBaseUrl", () => {
  it.each([undefined, "", "   "])("treats %j as unset (mock mode)", (value) => {
    expect(resolveApiBaseUrl(value)).toBeUndefined();
  });

  it("trims a configured URL", () => {
    expect(resolveApiBaseUrl("  https://api.example.test/  ")).toBe("https://api.example.test/");
  });
});

// @req SCD-API-001
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

// @req SCD-API-001, SCD-API-003
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
