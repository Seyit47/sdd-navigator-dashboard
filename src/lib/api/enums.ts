// @req SCD-API-003, SCD-FLT-001, SCD-FLT-003
// The API's enum values, listed once. The Zod schemas are built from these lists and the
// dashboard's filters use them directly, so the browser bundle does not need Zod for them.
export const REQUIREMENT_TYPES = ["FR", "AR"] as const;
export const COVERAGE_STATUSES = ["covered", "partial", "missing"] as const;
export const ANNOTATION_TYPES = ["impl", "test"] as const;
export const TASK_STATUSES = ["open", "in_progress", "done"] as const;
export const SCAN_STATES = ["idle", "scanning", "completed", "failed"] as const;
