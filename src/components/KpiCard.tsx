// @req SCD-UI-001, SCD-UI-007
import type { ReactNode } from "react";

export function KpiCard({
  label,
  value,
  detail,
  className = "",
  children,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className={`rounded-xl bg-surface p-5 shadow-card ${className}`}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      {detail ? <p className="mt-1 text-sm text-ink-2">{detail}</p> : null}
      {children}
    </div>
  );
}
