// @req SCD-UI-002, SCD-UI-004, SCD-A11Y-001
import type { CoverageStatus } from "@/lib/api";

interface StatusPresentation {
  /** Short label used in the summary bars. */
  label: string;
  /** Coverage assessment shown on the detail page. */
  assessment: string;
  /** Always shown next to the colour so status never relies on colour alone. */
  icon: string;
  /** Theme token for marks (dots, bars); never used for text. */
  color: string;
  /** Soft background token for pills and highlighted rows; text on it is --ink. */
  tint: string;
}

export const STATUS_PRESENTATION: Record<CoverageStatus, StatusPresentation> = {
  covered: { label: "Covered", assessment: "Fully covered", icon: "✓", color: "var(--good)", tint: "var(--good-tint)" },
  partial: { label: "Partial", assessment: "Needs tests", icon: "◐", color: "var(--warning)", tint: "var(--warning-tint)" },
  missing: { label: "Missing", assessment: "Not implemented", icon: "✕", color: "var(--critical)", tint: "var(--critical-tint)" },
};

/** count / total as a percentage with one decimal; 0 when total is 0. */
export function share(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 1000) / 10;
}
