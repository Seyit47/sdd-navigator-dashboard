// @req SCD-UI-001, SCD-UI-002
import type { Stats } from "@/lib/api";
import { formatDateTime, formatPercent } from "@/lib/dashboard/format";
import { CoverageMeter } from "./CoverageMeter";
import { StatTile } from "./StatTile";
import { StatusBars } from "./StatusBars";

export function SummaryPanel({ stats }: { stats: Stats }) {
  const { requirements, annotations, tasks } = stats;
  const orphans = annotations.orphans + tasks.orphans;
  return (
    <section aria-labelledby="summary-heading">
      <h2 id="summary-heading" className="sr-only">
        Summary
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Coverage"
          value={formatPercent(stats.coverage)}
          detail={`${requirements.byStatus.covered ?? 0} of ${requirements.total} fully covered`}
        >
          <CoverageMeter value={stats.coverage} />
        </StatTile>
        <StatTile
          label="Requirements"
          value={requirements.total}
          detail={`FR ${requirements.byType.FR ?? 0} · AR ${requirements.byType.AR ?? 0}`}
        />
        <StatTile
          label="Orphans"
          value={orphans > 0 ? `⚠ ${orphans}` : "✓ 0"}
          detail={`${annotations.orphans} of ${annotations.total} annotations · ${tasks.orphans} of ${tasks.total} tasks`}
        >
          {orphans > 0 ? (
            <a href="#orphans" className="mt-2 inline-block text-xs text-link underline">
              Review orphans
            </a>
          ) : null}
        </StatTile>
        <StatTile label="Last scan" value={<time dateTime={stats.lastScanAt}>{formatDateTime(stats.lastScanAt)}</time>} />
      </div>
      <StatusBars byStatus={requirements.byStatus} total={requirements.total} />
    </section>
  );
}
