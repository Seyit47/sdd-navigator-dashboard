// @req SCD-UI-001, SCD-UI-002, SCD-A11Y-001
import { STATUS_PRESENTATION, share } from "@/lib/dashboard/coverage";
import { formatLabel, formatPercent } from "@/lib/dashboard/format";
import { COVERAGE_STATUSES } from "@/lib/dashboard/options";

export function CoverageBar({
  byStatus,
  total,
  coverage,
}: {
  byStatus: Record<string, number>;
  total: number;
  coverage: number;
}) {
  const rows = COVERAGE_STATUSES.map((status) => ({ status, count: byStatus[status] ?? 0 }));
  const value = Math.min(100, Math.max(0, coverage));
  return (
    <>
      <div
        role="meter"
        aria-label="Coverage"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={`${formatPercent(value)} fully covered`}
        className="mt-4 flex h-2 gap-0.5"
      >
        {total === 0 ? (
          <span className="h-full flex-1 rounded-full bg-surface-2" />
        ) : (
          rows
            .filter((row) => row.count > 0)
            .map((row) => (
              <span
                key={row.status}
                data-status={row.status}
                title={`${formatLabel(row.status)}: ${row.count} of ${total} (${formatPercent(share(row.count, total))})`}
                className="h-full rounded-full"
                style={{ flexGrow: row.count, flexBasis: 0, backgroundColor: STATUS_PRESENTATION[row.status].color }}
              />
            ))
        )}
      </div>
      <p className="mt-2 text-sm text-ink-2">{rows.map((row) => `${row.count} ${row.status}`).join(" · ")}</p>
    </>
  );
}
