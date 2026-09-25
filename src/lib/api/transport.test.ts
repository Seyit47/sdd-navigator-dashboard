// @req SCD-API-001, SCD-API-003
import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";
import { dataOf } from "./test-helpers";
import { buildUrl, httpTransport } from "./transport";

const BASE = "https://api.example.test";

function stubFetch(body: string, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(body, { status }));
}

// @req SCD-API-001
describe("buildUrl", () => {
  it("joins base, path and defined query params", () => {
    expect(buildUrl(BASE, "/requirements", { type: "FR", status: undefined, order: "desc" })).toBe(
      `${BASE}/requirements?type=FR&order=desc`,
    );
  });

  it("strips whitespace and trailing slashes from the base URL", () => {
    expect(buildUrl(`  ${BASE}//  `, "/stats")).toBe(`${BASE}/stats`);
  });

  it("omits the query string when every param is undefined", () => {
    expect(buildUrl(BASE, "/tasks", { status: undefined })).toBe(`${BASE}/tasks`);
  });
});

// @req SCD-API-001, SCD-API-003
describe("httpTransport", () => {
  it("sends method, Accept header and a timeout signal", async () => {
    const fetchImpl = stubFetch("{}", 202);
    await httpTransport(`${BASE}/`, fetchImpl).send({ method: "POST", path: "/scan" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BASE}/scan`);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ Accept: "application/json" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns status and parsed JSON", async () => {
    const response = await httpTransport(BASE, stubFetch('{"a":1}', 201)).send({ method: "GET", path: "/x" });
    expect(response).toEqual({ status: 201, body: { a: 1 } });
  });

  it("returns raw text for non-JSON bodies and null for empty ones", async () => {
    const html = await httpTransport(BASE, stubFetch("<html>Bad Gateway</html>", 502)).send({ method: "GET", path: "/x" });
    const empty = await httpTransport(BASE, stubFetch("", 200)).send({ method: "GET", path: "/x" });
    expect(html).toEqual({ status: 502, body: "<html>Bad Gateway</html>" });
    expect(empty).toEqual({ status: 200, body: null });
  });

  it("rejects when fetch rejects", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(httpTransport(BASE, fetchImpl).send({ method: "GET", path: "/stats" })).rejects.toThrow(
      "Failed to fetch",
    );
  });

  it("puts encoded ids and filters on the wire through the client", async () => {
    const fetchImpl = stubFetch("[]");
    const api = createApiClient(httpTransport(BASE, fetchImpl));
    await api.getRequirement("FR X/1");
    dataOf(await api.listAnnotations({ type: "test", orphans: true }));
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      `${BASE}/requirements/FR%20X%2F1`,
      `${BASE}/annotations?type=test&orphans=true`,
    ]);
  });
});
