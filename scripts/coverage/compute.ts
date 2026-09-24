// @req SCD-VAL-001
import type {
  CoverageResult,
  CoverageState,
  FoundAnnotation,
  RequirementCoverage,
  RequirementEntry,
  TaskEntry,
} from "./types.ts";

export function computeCoverage(
  requirements: RequirementEntry[],
  annotations: FoundAnnotation[],
  tasks: TaskEntry[] = [],
): CoverageResult {
  const known = new Set(requirements.map((r) => r.id));
  const rows: RequirementCoverage[] = requirements.map((requirement) => {
    const impl = annotations.filter((a) => a.reqId === requirement.id && a.kind === "impl").length;
    const test = annotations.filter((a) => a.reqId === requirement.id && a.kind === "test").length;
    const status: CoverageState = impl > 0 && test > 0 ? "covered" : impl > 0 ? "partial" : "missing";
    return { id: requirement.id, title: requirement.title, status, impl, test };
  });

  const counts: Record<CoverageState, number> = { covered: 0, partial: 0, missing: 0 };
  for (const row of rows) counts[row.status] += 1;

  return {
    requirements: rows,
    counts,
    coverage: rows.length === 0 ? 0 : Math.round((counts.covered / rows.length) * 1000) / 10,
    orphanAnnotations: annotations.filter((a) => !known.has(a.reqId)),
    orphanTasks: tasks.filter((t) => !known.has(t.requirementId)),
  };
}
