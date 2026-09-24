// @req SCD-VAL-001
export interface RequirementEntry {
  id: string;
  title: string;
}

export interface TaskEntry {
  id: string;
  requirementId: string;
  title: string;
}

export type AnnotationKind = "impl" | "test";

export interface FoundAnnotation {
  file: string;
  line: number;
  reqId: string;
  kind: AnnotationKind;
}

export type CoverageState = "covered" | "partial" | "missing";

export interface RequirementCoverage {
  id: string;
  title: string;
  status: CoverageState;
  impl: number;
  test: number;
}

export interface CoverageResult {
  requirements: RequirementCoverage[];
  counts: Record<CoverageState, number>;
  /** covered / total × 100 with one decimal; 0 when there are no requirements. */
  coverage: number;
  orphanAnnotations: FoundAnnotation[];
  orphanTasks: TaskEntry[];
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
