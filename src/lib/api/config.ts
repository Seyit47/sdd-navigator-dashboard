// @req SCD-API-001
import { mockTransport } from "./mock";
import { httpTransport, type Transport } from "./transport";

export type DataMode = "api" | "mock";

export function resolveApiBaseUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// Must be read as the literal `process.env.NEXT_PUBLIC_API_URL` so Next.js inlines it at build time.
export const apiBaseUrl = resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
export const dataMode: DataMode = apiBaseUrl ? "api" : "mock";

export function createTransport(baseUrl: string | undefined): Transport {
  return baseUrl ? httpTransport(baseUrl) : mockTransport();
}
