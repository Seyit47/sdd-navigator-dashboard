// @req SCD-UI-002, SCD-A11Y-001
import { STATUS_PRESENTATION, share } from "@/lib/dashboard/coverage";
import { formatPercent } from "@/lib/dashboard/format";
import { COVERAGE_STATUSES } from "@/lib/dashboard/options";

export function StatusBars({ byStatus, total }: { byStatus: Record<string, number>; total: number }) {
  const rows = COVERAGE_STATUSES.map((status) => ({ status, count: byStatus[status] ?? 0 }));
  const max = Math.max(0, ...rows.map((row) => row.count));
  return (
    <figure className="mt-3 rounded-lg border border-hairline bg-surface p-4">
      <figcaption className="text-xs text-ink-2">Requirements by coverage status</figcaption>
      <ul className="mt-3 grid gap-2">
        {rows.map(({ status, count }) => {
          const p = STATUS_PRESENTATION[status];
          const summary = `${p.label}: ${count} of ${total} (${formatPercent(share(count, total))})`;
          return (
            <li
              key={status}
              data-status={status}
              title={summary}
              className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3 text-sm"
            >
              <span aria-hidden="true">
                {p.icon} {p.label}
              </span>
              <span aria-hidden="true" className="h-3">
                <span
                  data-bar
                  className="block h-full rounded-r"
                  style={{ width: `${max === 0 ? 0 : (count / max) * 100}%`, backgroundColor: p.color }}
                />
              </span>
              <span aria-hidden="true" className="text-right tabular-nums">
                {count}
              </span>
              <span className="sr-only">{summary}</span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
