// @req SCD-UI-001, SCD-UI-003, SCD-UI-004
// Fixed locale and timezone so server and client render identical text (no hydration mismatch).
const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

function parse(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(iso: string): string {
  const date = parse(iso);
  return date ? DATE.format(date) : iso;
}

export function formatDateTime(iso: string): string {
  const date = parse(iso);
  return date ? `${DATE_TIME.format(date)} UTC` : iso;
}

export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

export function formatTaskStatus(status: string): string {
  return status.replaceAll("_", " ");
}
