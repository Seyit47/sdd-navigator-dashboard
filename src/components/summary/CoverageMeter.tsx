// @req SCD-UI-001, SCD-A11Y-001
import { formatPercent } from "@/lib/dashboard/format";

export function CoverageMeter({ value }: { value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="meter"
      aria-label="Coverage"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-valuetext={formatPercent(clamped)}
      className="mt-3 h-2.5 overflow-hidden rounded-full bg-accent-track"
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${clamped}%` }} />
    </div>
  );
}
