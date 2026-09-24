// @req SCD-API-003
export type HttpMethod = "GET" | "POST";

export interface TransportRequest {
  method: HttpMethod;
  /** Path relative to the API root, already URL-encoded, e.g. "/requirements/FR-SCAN-001". */
  path: string;
  /** Undefined values are omitted from the query string. */
  query?: Record<string, string | undefined>;
}

export interface TransportResponse {
  status: number;
  /** Parsed JSON, the raw text if the body is not JSON, or null if it is empty. */
  body: unknown;
}

export interface Transport {
  /** Rejects only when no response was received (network failure, timeout). */
  send(request: TransportRequest): Promise<TransportResponse>;
}

export const REQUEST_TIMEOUT_MS = 10_000;

export function buildUrl(
  baseUrl: string,
  path: string,
  query: Record<string, string | undefined> = {},
): string {
  const url = `${baseUrl.trim().replace(/\/+$/, "")}${path}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value);
  }
  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function httpTransport(
  baseUrl: string,
  // Wrapped so the global is looked up per call (keeps `this` correct and lets tests stub it).
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Transport {
  return {
    async send({ method, path, query }) {
      const response = await fetchImpl(buildUrl(baseUrl, path, query), {
        method,
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      return { status: response.status, body: await readBody(response) };
    },
  };
}
