// @req SCD-API-003
// Expected failures are values, not exceptions: callers narrow on `ok`, then on `error.kind`.

export type ApiError =
  | { kind: "network"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "http"; status: number; message: string }
  | { kind: "invalid_response"; message: string; issues: string[] };

export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err(error: ApiError): { ok: false; error: ApiError } {
  return { ok: false, error };
}
