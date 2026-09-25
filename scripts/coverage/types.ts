// @req SCD-VAL-001
// The coverage script reuses the app's model types (type-only imports, erased at runtime).
import type { AnnotationType, CoverageStatus, Requirement, Task } from "../../src/lib/api/schemas.ts";

export type RequirementEntry = Pick<Requirement, "id" | "title">;

export type TaskEntry = Pick<Task, "id" | "requirementId" | "title">;

export type AnnotationKind = AnnotationType;

export interface FoundAnnotation {
  file: string;
  line: number;
  reqId: string;
  kind: AnnotationKind;
}

export interface RequirementCoverage {
  id: string;
  title: string;
  status: CoverageStatus;
  impl: number;
  test: number;
}

export interface CoverageResult {
  requirements: RequirementCoverage[];
  counts: Record<CoverageStatus, number>;
  /** covered / total × 100 with one decimal; 0 when there are no requirements. */
  coverage: number;
  orphanAnnotations: FoundAnnotation[];
  orphanTasks: TaskEntry[];
}
