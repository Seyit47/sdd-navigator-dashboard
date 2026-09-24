// @req SCD-API-003
import type { ApiError, Result } from "./errors";

export function dataOf<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`Expected ok result, got ${JSON.stringify(result.error)}`);
  return result.data;
}

export function errorOf<T>(result: Result<T>): ApiError {
  if (result.ok) throw new Error("Expected an error result, got ok");
  return result.error;
}
