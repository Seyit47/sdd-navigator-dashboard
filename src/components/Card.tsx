// @req SCD-UI-007
import type { ReactNode } from "react";

export function Card({
  titleId,
  title,
  meta,
  busy = false,
  children,
}: {
  titleId: string;
  title: ReactNode;
  meta?: ReactNode;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
      className={`surface-card p-5 transition-opacity ${busy ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={titleId} className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        {meta}
      </div>
      {children}
    </section>
  );
}
