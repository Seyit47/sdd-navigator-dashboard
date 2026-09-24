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
