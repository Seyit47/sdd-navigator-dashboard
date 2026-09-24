// @req SCD-VAL-001
import type { CoverageResult } from "./types.ts";

export function formatReport(result: CoverageResult): string {
  const idWidth = Math.max(2, ...result.requirements.map((r) => r.id.length));
  const lines = [
    "Requirement coverage",
    "",
    `${"ID".padEnd(idWidth)}  ${"STATUS".padEnd(8)}  IMPL  TEST  TITLE`,
    ...result.requirements.map(
      (r) =>
        `${r.id.padEnd(idWidth)}  ${r.status.padEnd(8)}  ${String(r.impl).padStart(4)}  ${String(r.test).padStart(4)}  ${r.title}`,
    ),
  ];

  if (result.orphanAnnotations.length > 0) {
    lines.push("", `Orphan annotations (${result.orphanAnnotations.length}):`);
    for (const a of result.orphanAnnotations) lines.push(`  ${a.file}:${a.line}  ${a.reqId} (${a.kind})`);
  }
  if (result.orphanTasks.length > 0) {
    lines.push("", `Orphan tasks (${result.orphanTasks.length}):`);
    for (const t of result.orphanTasks) lines.push(`  ${t.id}  ${t.requirementId}  ${t.title}`);
  }

  const { covered, partial, missing } = result.counts;
  lines.push(
    "",
    `Coverage: ${result.coverage}% (${covered}/${result.requirements.length} covered, ${partial} partial, ${missing} missing)`,
  );
  return lines.join("\n");
}
