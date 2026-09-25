// @req SCD-UI-001, SCD-UI-002, SCD-UI-007
import type { Stats } from "@/lib/api";
import { formatDateTime, formatPercent } from "@/lib/dashboard/format";
import { KpiCard } from "../KpiCard";
import { CoverageBar } from "./CoverageBar";

export function SummaryPanel({ stats }: { stats: Stats }) {
  const { requirements, annotations, tasks } = stats;
  const orphans = annotations.orphans + tasks.orphans;
  return (
    <section aria-labelledby="summary-heading" className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="summary-heading" className="text-xl font-semibold tracking-tight">
          Coverage overview
        </h2>
        <p className="text-sm text-muted">
          Last scan <time dateTime={stats.lastScanAt}>{formatDateTime(stats.lastScanAt)}</time>
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Coverage"
          className="sm:col-span-2"
          value={formatPercent(stats.coverage)}
          detail={`${requirements.byStatus.covered ?? 0} of ${requirements.total} requirements fully covered`}
        >
          <CoverageBar byStatus={requirements.byStatus} total={requirements.total} coverage={stats.coverage} />
        </KpiCard>
        <KpiCard
          label="Requirements"
          value={requirements.total}
          detail={`${requirements.byType.FR ?? 0} FR · ${requirements.byType.AR ?? 0} AR`}
        />
        <KpiCard
          label="Orphans"
          value={orphans > 0 ? orphans : "None"}
          detail={`${annotations.orphans} of ${annotations.total} annotations · ${tasks.orphans} of ${tasks.total} tasks`}
        >
          {orphans > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-full bg-warning-tint px-2 py-0.5 text-xs font-medium text-ink">⚠ Needs attention</span>
              <a href="#orphans" className="text-link hover:underline">
                Review →
              </a>
            </div>
          ) : null}
        </KpiCard>
      </div>
    </section>
  );
}
