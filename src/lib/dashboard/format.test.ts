// @req SCD-UI-001, SCD-UI-002, SCD-UI-004
import { describe, expect, it } from "vitest";
import { STATUS_PRESENTATION, share } from "./coverage";
import { formatDate, formatDateTime, formatLabel, formatPercent } from "./format";

// @req SCD-UI-003, SCD-UI-004
describe("formatDate", () => {
  it("formats an ISO timestamp as a UTC date", () => {
    expect(formatDate("2026-03-01T10:15:00Z")).toBe("1 Mar 2026");
  });

  it("uses UTC, not the local timezone", () => {
    expect(formatDate("2026-02-28T23:59:59Z")).toBe("28 Feb 2026");
  });

  it("returns unparseable input unchanged", () => {
    expect(formatDate("not a date")).toBe("not a date");
  });
});

// @req SCD-UI-001
describe("formatDateTime", () => {
  it("formats date, 24-hour time and the UTC suffix", () => {
    expect(formatDateTime("2026-03-01T10:15:00Z")).toBe("1 Mar 2026, 10:15 UTC");
  });
});

// @req SCD-UI-001
describe("formatPercent", () => {
  it.each([
    [62.5, "62.5%"],
    [0, "0%"],
    [100, "100%"],
    [33.333, "33.3%"],
  ])("%d → %s", (value, text) => {
    expect(formatPercent(value)).toBe(text);
  });
});

// @req SCD-UI-002
describe("share", () => {
  it.each([
    [5, 8, 62.5],
    [0, 0, 0],
    [1, 3, 33.3],
  ])("%d of %d is %d%%", (count, total, expected) => {
    expect(share(count, total)).toBe(expected);
  });
});

// @req SCD-UI-002, SCD-UI-004
describe("STATUS_PRESENTATION", () => {
  it("maps each coverage status to its assessment label and icon", () => {
    expect(
      Object.entries(STATUS_PRESENTATION).map(([status, p]) => [status, p.assessment, p.icon, p.label]),
    ).toEqual([
      ["covered", "Fully covered", "✓", "Covered"],
      ["partial", "Needs tests", "◐", "Partial"],
      ["missing", "Not implemented", "✕", "Missing"],
    ]);
  });
});

// @req SCD-UI-005, SCD-FLT-001
describe("formatLabel", () => {
  it("capitalises and replaces underscores", () => {
    expect(["covered", "in_progress", "FR"].map((v) => formatLabel(v))).toEqual(["Covered", "In progress", "FR"]);
  });
});
