// @req SCD-STATE-003, SCD-UI-007
import type { ReactNode } from "react";

export function EmptyState({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="mt-4 flex flex-col items-center gap-1 rounded-lg bg-plane px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      <p className="text-sm text-ink-2">{hint}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
