"use client";
// @req SCD-FLT-001, SCD-FLT-003, SCD-UI-007, SCD-A11Y-001
import type { ReactNode } from "react";
import { toggleValue } from "@/lib/dashboard/query";

export function SegmentedFilter<T extends string>({
  label,
  legend,
  options,
  selected,
  onChange,
  format = (value) => value,
}: {
  /** Accessible group name, e.g. "Filter by type". */
  label: string;
  /** Short visible caption, e.g. "Type". */
  legend: string;
  options: readonly T[];
  selected: readonly T[];
  /** Receives the new selection; [] means "All" (also when every value ends up selected). */
  onChange: (next: T[]) => void;
  format?: (value: T) => string;
}) {
  function toggle(value: T) {
    const next = toggleValue(selected, value, options);
    onChange(next.length === options.length ? [] : next);
  }

  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="text-xs font-medium text-muted">
        {legend}
      </span>
      <div role="group" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-lg bg-surface-2 p-0.5">
        <Segment pressed={selected.length === 0} onClick={() => onChange([])}>
          All
        </Segment>
        {options.map((option) => (
          <Segment key={option} pressed={selected.includes(option)} onClick={() => toggle(option)}>
            {format(option)}
          </Segment>
        ))}
      </div>
    </div>
  );
}

function Segment({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-sm transition-colors ${
        pressed ? "surface-raised font-medium text-ink" : "text-ink-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
