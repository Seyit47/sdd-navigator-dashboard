// @req SCD-UI-003, SCD-A11Y-001
import type { CoverageStatus } from "@/lib/api";
import { STATUS_PRESENTATION } from "@/lib/dashboard/coverage";

export function StatusBadge({ status }: { status: CoverageStatus }) {
  const p = STATUS_PRESENTATION[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
      <span aria-hidden="true">{p.icon}</span>
      {status}
    </span>
  );
}
