// @req SCD-UI-001
import type { ReactNode } from "react";

export function StatTile({
  label,
  value,
  detail,
  children,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="rounded-lg border border-hairline bg-surface p-4">
      <p className="text-xs text-ink-2">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}
      {children}
    </div>
  );
}
