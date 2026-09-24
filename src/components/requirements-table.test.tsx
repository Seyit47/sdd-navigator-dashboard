// @vitest-environment jsdom
// @req SCD-UI-003, SCD-FLT-001, SCD-FLT-002, SCD-SORT-001, SCD-STATE-003, SCD-A11Y-002
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Requirement } from "@/lib/api";
import { axeViolations } from "@/test/axe";
import { loadFixtures } from "@/test/fixtures";
import { lastHref, resetNavigation, setSearch } from "@/test/navigation";
import { RequirementsTable } from "./RequirementsTable";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);

let requirements: Requirement[];

beforeAll(async () => {
  ({ requirements } = await loadFixtures());
});

beforeEach(() => {
  resetNavigation();
});

function renderTable(search = "", rows: Requirement[] = requirements) {
  setSearch(search);
  return render(<RequirementsTable requirements={rows} />);
}

const rowIds = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
const chip = (group: string, name: string) =>
  within(screen.getByRole("group", { name: group })).getByRole("button", { name });

describe("RequirementsTable", () => {
  it("renders every requirement with its columns, sorted by id", () => {
    renderTable();
    expect(rowIds()).toEqual([
      "AR-PERF-001", "AR-SEC-001", "FR-API-001", "FR-API-002",
      "FR-API-003", "FR-SCAN-001", "FR-SCAN-002", "FR-SCAN-003",
    ]);
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells.map((c) => c.textContent)).toEqual([
      "AR-PERF-001", "AR", "Scan completes under 5s for 10k files", "✕missing", "10 Feb 2026",
    ]);
    expect(screen.getByText("Showing 8 of 8 requirements")).toBeInTheDocument();
  });

  it("filters by a type chip and syncs the URL", async () => {
    renderTable();
    await userEvent.click(chip("Filter by type", "FR"));
    expect(lastHref()).toBe("/?type=FR");
    expect(rowIds()).toHaveLength(6);
    expect(chip("Filter by type", "FR")).toHaveAttribute("aria-pressed", "true");
  });

  it("combines chips: OR within a group, AND across groups", async () => {
    renderTable("?type=FR");
    await userEvent.click(chip("Filter by coverage status", "partial"));
    await userEvent.click(chip("Filter by coverage status", "missing"));
    expect(lastHref()).toBe("/?type=FR&status=partial&status=missing");
    expect(rowIds()).toEqual(["FR-API-003"]);
  });

  it("restores filters from a shared URL", () => {
    renderTable("?type=AR&status=missing");
    expect(rowIds()).toEqual(["AR-PERF-001", "AR-SEC-001"]);
    expect(chip("Filter by type", "AR")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Filter by type", "FR")).toHaveAttribute("aria-pressed", "false");
    expect(chip("Filter by coverage status", "missing")).toHaveAttribute("aria-pressed", "true");
  });

  it("ignores invalid query values", () => {
    renderTable("?type=XX&status=bogus&sort=title");
    expect(rowIds()).toHaveLength(8);
  });

  it("searches id and title and syncs q", async () => {
    renderTable();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "scan");
    expect(rowIds()).toEqual(["AR-PERF-001", "AR-SEC-001", "FR-SCAN-001", "FR-SCAN-002", "FR-SCAN-003"]);
    expect(lastHref()).toBe("/?q=scan");
  });

  it("sorts by Updated and toggles the direction", async () => {
    renderTable();
    await userEvent.click(screen.getByRole("button", { name: "Sort by Updated" }));
    expect(lastHref()).toBe("/?sort=updatedAt");
    expect(rowIds()).toEqual([
      "AR-PERF-001", "FR-API-003", "AR-SEC-001", "FR-API-002",
      "FR-SCAN-001", "FR-SCAN-003", "FR-API-001", "FR-SCAN-002",
    ]);
    expect(screen.getByRole("columnheader", { name: "Updated" })).toHaveAttribute("aria-sort", "ascending");
    await userEvent.click(screen.getByRole("button", { name: "Sort by Updated" }));
    expect(lastHref()).toBe("/?sort=updatedAt&order=desc");
    expect(rowIds()[0]).toBe("FR-SCAN-002");
    expect(screen.getByRole("columnheader", { name: "Updated" })).toHaveAttribute("aria-sort", "descending");
  });

  it("sorts by ID descending", async () => {
    renderTable();
    await userEvent.click(screen.getByRole("button", { name: "Sort by ID" }));
    expect(lastHref()).toBe("/?order=desc");
    expect(rowIds()[0]).toBe("FR-SCAN-003");
  });

  it("shows an empty state and clears the filters", async () => {
    renderTable("?type=AR&status=covered");
    expect(screen.getByText("No requirements match these filters.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(lastHref()).toBe("/");
    expect(rowIds()).toHaveLength(8);
  });

  it("links to detail pages with the current filters", () => {
    renderTable("?type=FR&sort=updatedAt");
    expect(screen.getByRole("link", { name: "FR-API-001" })).toHaveAttribute(
      "href",
      "/requirements/FR-API-001?type=FR&sort=updatedAt",
    );
  });

  it("encodes ids in detail links", () => {
    renderTable("", [{ ...requirements[0], id: "FR-X Y-001" }]);
    expect(screen.getByRole("link", { name: "FR-X Y-001" })).toHaveAttribute("href", "/requirements/FR-X%20Y-001");
  });

  it("has no axe violations", async () => {
    const { container } = renderTable("?type=FR");
    expect(await axeViolations(container)).toEqual([]);
  });
});
