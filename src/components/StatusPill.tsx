// @req SCD-UI-003, SCD-UI-007, SCD-A11Y-001
import type { CoverageStatus } from "@/lib/api";
import { STATUS_PRESENTATION } from "@/lib/dashboard/coverage";
import { formatLabel } from "@/lib/dashboard/format";

export function StatusPill({ status }: { status: CoverageStatus }) {
  const p = STATUS_PRESENTATION[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium text-ink"
      style={{ backgroundColor: p.tint }}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: p.color }} />
      {formatLabel(status)}
    </span>
  );
}
