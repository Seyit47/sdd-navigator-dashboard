// @vitest-environment jsdom
// @req SCD-UI-007, SCD-FLT-001, SCD-A11Y-002
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { formatLabel } from "@/lib/dashboard/format";
import { axeViolations } from "@/test/axe";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { SegmentedFilter } from "./SegmentedFilter";
import { StatusPill } from "./StatusPill";

const TYPES = ["FR", "AR"] as const;
const STATUSES = ["covered", "partial", "missing"] as const;

function renderFilter<T extends string>(options: readonly T[], selected: T[]) {
  const onChange = vi.fn<(next: T[]) => void>();
  const view = render(
    <SegmentedFilter label="Filter by x" legend="X" options={options} selected={selected} onChange={onChange} format={formatLabel} />,
  );
  const button = (name: string) => within(screen.getByRole("group", { name: "Filter by x" })).getByRole("button", { name });
  return { onChange, button, ...view };
}

// @req SCD-FLT-001, SCD-UI-007, SCD-A11Y-002
describe("SegmentedFilter", () => {
  it("presses All when nothing is selected", () => {
    const { button } = renderFilter(TYPES, []);
    expect(button("All")).toHaveAttribute("aria-pressed", "true");
    expect(button("FR")).toHaveAttribute("aria-pressed", "false");
  });

  it("adds a value", async () => {
    const { button, onChange } = renderFilter(STATUSES, ["missing"]);
    await userEvent.click(button("Covered"));
    expect(onChange).toHaveBeenCalledWith(["covered", "missing"]);
  });

  it("removes a selected value", async () => {
    const { button, onChange } = renderFilter(STATUSES, ["partial", "missing"]);
    await userEvent.click(button("Partial"));
    expect(onChange).toHaveBeenCalledWith(["missing"]);
  });

  it("treats selecting every value as All", async () => {
    const { button, onChange } = renderFilter(TYPES, ["FR"]);
    await userEvent.click(button("AR"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("clears the group with All", async () => {
    const { button, onChange } = renderFilter(STATUSES, ["missing"]);
    expect(button("All")).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button("All"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("has no axe violations", async () => {
    const { container } = renderFilter(STATUSES, ["partial"]);
    expect(await axeViolations(container)).toEqual([]);
  });
});

// @req SCD-UI-003, SCD-UI-007
describe("StatusPill", () => {
  it("shows a capitalised label on the status tint", () => {
    render(<StatusPill status="partial" />);
    const pill = screen.getByText("Partial");
    expect(pill).toHaveStyle({ backgroundColor: "var(--warning-tint)" });
  });
});

// @req SCD-UI-007
describe("Card", () => {
  it("is a region named by its title", () => {
    render(<Card titleId="t" title="Requirements">body</Card>);
    expect(screen.getByRole("region", { name: "Requirements" })).not.toHaveAttribute("aria-busy");
  });

  it("marks itself busy while pending", () => {
    render(<Card titleId="t" title="Requirements" busy>body</Card>);
    expect(screen.getByRole("region", { name: "Requirements" })).toHaveAttribute("aria-busy", "true");
  });
});

// @req SCD-STATE-003
describe("EmptyState", () => {
  it("shows the title, hint and action", () => {
    render(<EmptyState title="Nothing here" hint="Try again" action={<button type="button">Clear</button>} />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });
});
