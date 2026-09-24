// @vitest-environment jsdom
// @req SCD-UI-001, SCD-UI-002, SCD-A11Y-002
import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import type { Stats } from "@/lib/api";
import { axeViolations } from "@/test/axe";
import { loadFixtures } from "@/test/fixtures";
import { SummaryPanel } from "./SummaryPanel";

let stats: Stats;

beforeAll(async () => {
  ({ stats } = await loadFixtures());
});

const tile = (name: string) => within(screen.getByRole("group", { name }));
const bar = (container: HTMLElement, status: string) =>
  container.querySelector(`[data-status="${status}"] [data-bar]`);

describe("SummaryPanel", () => {
  it("shows requirement, annotation and task counts", () => {
    render(<SummaryPanel stats={stats} />);
    expect(tile("Requirements").getByText("8")).toBeInTheDocument();
    expect(tile("Requirements").getByText("FR 6 · AR 2")).toBeInTheDocument();
    expect(tile("Coverage").getByText("62.5%")).toBeInTheDocument();
    expect(tile("Coverage").getByText("5 of 8 fully covered")).toBeInTheDocument();
    expect(tile("Orphans").getByText("⚠ 3")).toBeInTheDocument();
    expect(tile("Orphans").getByText("2 of 16 annotations · 1 of 6 tasks")).toBeInTheDocument();
    expect(tile("Orphans").getByRole("link", { name: "Review orphans" })).toHaveAttribute("href", "#orphans");
    expect(tile("Last scan").getByText("1 Mar 2026, 10:15 UTC")).toBeInTheDocument();
  });

  it("shows coverage on a meter", () => {
    render(<SummaryPanel stats={stats} />);
    expect(screen.getByRole("meter", { name: "Coverage" })).toHaveAttribute("aria-valuenow", "62.5");
  });

  it("draws one bar per status with count and share", () => {
    const { container } = render(<SummaryPanel stats={stats} />);
    expect(screen.getByText("Covered: 5 of 8 (62.5%)")).toBeInTheDocument();
    expect(screen.getByText("Partial: 1 of 8 (12.5%)")).toBeInTheDocument();
    expect(screen.getByText("Missing: 2 of 8 (25%)")).toBeInTheDocument();
    expect(bar(container, "covered")).toHaveStyle({ width: "100%" });
    expect(bar(container, "partial")).toHaveStyle({ width: "20%" });
    expect(bar(container, "missing")).toHaveStyle({ width: "40%" });
  });

  it("renders 0% coverage", () => {
    const none: Stats = {
      ...stats,
      coverage: 0,
      requirements: { ...stats.requirements, byStatus: { missing: 8 } },
    };
    const { container } = render(<SummaryPanel stats={none} />);
    expect(tile("Coverage").getByText("0%")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Coverage" })).toHaveAttribute("aria-valuenow", "0");
    expect(bar(container, "covered")).toHaveStyle({ width: "0%" });
    expect(bar(container, "missing")).toHaveStyle({ width: "100%" });
  });

  it("renders 100% coverage without orphans", () => {
    const full: Stats = {
      ...stats,
      coverage: 100,
      requirements: { ...stats.requirements, byStatus: { covered: 8 } },
      annotations: { ...stats.annotations, orphans: 0 },
      tasks: { ...stats.tasks, orphans: 0 },
    };
    render(<SummaryPanel stats={full} />);
    expect(tile("Coverage").getByText("100%")).toBeInTheDocument();
    expect(tile("Coverage").getByText("8 of 8 fully covered")).toBeInTheDocument();
    expect(tile("Orphans").getByText("✓ 0")).toBeInTheDocument();
    expect(tile("Orphans").queryByRole("link")).toBeNull();
  });

  it("renders an empty project without NaN", () => {
    const empty: Stats = {
      requirements: { total: 0, byType: {}, byStatus: {} },
      annotations: { total: 0, impl: 0, test: 0, orphans: 0 },
      tasks: { total: 0, byStatus: {}, orphans: 0 },
      coverage: 0,
      lastScanAt: "2026-03-01T10:15:00Z",
    };
    const { container } = render(<SummaryPanel stats={empty} />);
    expect(tile("Requirements").getByText("FR 0 · AR 0")).toBeInTheDocument();
    expect(screen.getByText("Covered: 0 of 0 (0%)")).toBeInTheDocument();
    expect(container.textContent).not.toContain("NaN");
  });

  it("has no axe violations", async () => {
    const { container } = render(<SummaryPanel stats={stats} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
