// @req SCD-API-001, SCD-API-003
// The app's only entry point for data: import from "@/lib/api".
import { createApiClient } from "./client";
import { apiBaseUrl, createTransport } from "./config";

const client = createApiClient(createTransport(apiBaseUrl));

export const {
  getStats,
  listRequirements,
  getRequirement,
  listAnnotations,
  listTasks,
  triggerScan,
  getScanStatus,
} = client;

export { apiBaseUrl, dataMode, type DataMode } from "./config";
export type { ApiError, Result } from "./errors";
export type {
  AnnotationFilters,
  ApiClient,
  RequirementFilters,
  SortField,
  SortOrder,
  TaskFilters,
} from "./client";
export type {
  Annotation,
  AnnotationStats,
  AnnotationType,
  ApiErrorBody,
  CoverageStatus,
  Requirement,
  RequirementDetail,
  RequirementStats,
  RequirementType,
  ScanState,
  ScanStatus,
  Stats,
  Task,
  TaskStats,
  TaskStatus,
} from "./schemas";
