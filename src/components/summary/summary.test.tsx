// @vitest-environment jsdom
// @req SCD-UI-001, SCD-UI-002, SCD-UI-007, SCD-A11Y-002
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

const card = (name: string) => within(screen.getByRole("group", { name }));
const segment = (container: HTMLElement, status: string) => container.querySelector(`[data-status="${status}"]`);

describe("SummaryPanel", () => {
  it("shows the overview heading and the last scan", () => {
    render(<SummaryPanel stats={stats} />);
    expect(screen.getByRole("heading", { level: 2, name: "Coverage overview" })).toBeInTheDocument();
    expect(screen.getByText("1 Mar 2026, 10:15 UTC").closest("p")).toHaveTextContent("Last scan 1 Mar 2026, 10:15 UTC");
  });

  it("shows requirement, annotation and task counts", () => {
    render(<SummaryPanel stats={stats} />);
    expect(card("Coverage").getByText("62.5%")).toBeInTheDocument();
    expect(card("Coverage").getByText("5 of 8 requirements fully covered")).toBeInTheDocument();
    expect(card("Requirements").getByText("8")).toBeInTheDocument();
    expect(card("Requirements").getByText("6 FR · 2 AR")).toBeInTheDocument();
    expect(card("Orphans").getByText("3")).toBeInTheDocument();
    expect(card("Orphans").getByText("2 of 16 annotations · 1 of 6 tasks")).toBeInTheDocument();
    expect(card("Orphans").getByText("⚠ Needs attention")).toBeInTheDocument();
    expect(card("Orphans").getByRole("link", { name: "Review →" })).toHaveAttribute("href", "#orphans");
  });

  it("shows coverage as a meter with one segment per status", () => {
    const { container } = render(<SummaryPanel stats={stats} />);
    expect(screen.getByRole("meter", { name: "Coverage" })).toHaveAttribute("aria-valuenow", "62.5");
    expect(card("Coverage").getByText("5 covered · 1 partial · 2 missing")).toBeInTheDocument();
    expect(segment(container, "covered")).toHaveStyle({ flexGrow: "5" });
    expect(segment(container, "partial")).toHaveStyle({ flexGrow: "1" });
    expect(segment(container, "missing")).toHaveStyle({ flexGrow: "2" });
  });

  it("renders 0% coverage", () => {
    const none: Stats = { ...stats, coverage: 0, requirements: { ...stats.requirements, byStatus: { missing: 8 } } };
    const { container } = render(<SummaryPanel stats={none} />);
    expect(card("Coverage").getByText("0%")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Coverage" })).toHaveAttribute("aria-valuenow", "0");
    expect(segment(container, "covered")).toBeNull();
    expect(segment(container, "missing")).toHaveStyle({ flexGrow: "8" });
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
    expect(card("Coverage").getByText("100%")).toBeInTheDocument();
    expect(card("Orphans").getByText("None")).toBeInTheDocument();
    expect(card("Orphans").queryByText("⚠ Needs attention")).toBeNull();
    expect(card("Orphans").queryByRole("link")).toBeNull();
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
    expect(card("Requirements").getByText("0 FR · 0 AR")).toBeInTheDocument();
    expect(card("Coverage").getByText("0 covered · 0 partial · 0 missing")).toBeInTheDocument();
    expect(container.textContent).not.toContain("NaN");
  });

  it("has no axe violations", async () => {
    const { container } = render(<SummaryPanel stats={stats} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
