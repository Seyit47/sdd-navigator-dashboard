// @req SCD-FLT-001, SCD-FLT-003
import type { CoverageStatus, RequirementType, TaskStatus } from "@/lib/api";

export const REQUIREMENT_TYPES: readonly RequirementType[] = ["FR", "AR"];
export const COVERAGE_STATUSES: readonly CoverageStatus[] = ["covered", "partial", "missing"];
export const TASK_STATUSES: readonly TaskStatus[] = ["open", "in_progress", "done"];
