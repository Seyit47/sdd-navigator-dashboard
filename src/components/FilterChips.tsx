"use client";
// @req SCD-FLT-001, SCD-FLT-003, SCD-A11Y-001
export function FilterChips<T extends string>({
  label,
  legend,
  options,
  selected,
  onToggle,
  format = (value) => value,
}: {
  /** Accessible group name, e.g. "Filter by type". */
  label: string;
  /** Short visible caption, e.g. "Type". */
  legend: string;
  options: readonly T[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  format?: (value: T) => string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span aria-hidden="true" className="mr-1 text-xs text-ink-2">
        {legend}
      </span>
      {options.map((option) => {
        const pressed = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={pressed}
            onClick={() => onToggle(option)}
            className={`rounded-full border px-2.5 py-0.5 text-sm text-ink ${
              pressed ? "border-accent bg-chip font-semibold" : "border-hairline bg-surface"
            }`}
          >
            {pressed ? <span aria-hidden="true">✓ </span> : null}
            {format(option)}
          </button>
        );
      })}
    </div>
  );
}
