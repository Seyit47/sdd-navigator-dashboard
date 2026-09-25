// @vitest-environment jsdom
// @req SCD-UI-003, SCD-UI-007, SCD-FLT-001, SCD-FLT-002, SCD-SORT-001, SCD-STATE-003, SCD-A11Y-002
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Requirement } from "@/lib/api";
import { axeViolations } from "@/test/axe";
import { loadFixtures } from "@/test/fixtures";
import { commitNavigation, lastHref, lastNavigation, replace, resetNavigation, setSearch } from "@/test/navigation";
import { RequirementsTable } from "./RequirementsTable";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);

let requirements: Requirement[];

beforeAll(async () => {
  ({ requirements } = await loadFixtures());
});

beforeEach(() => {
  resetNavigation();
});

function renderTable(search = "", rows: Requirement[] = requirements, total = 8) {
  setSearch(search);
  return render(<RequirementsTable requirements={rows} total={total} />);
}

const region = () => screen.getByRole("region", { name: "Requirements" });
const rowIds = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
const segment = (group: string, name: string) =>
  within(screen.getByRole("group", { name: group })).getByRole("button", { name });

describe("RequirementsTable", () => {
  it("renders the rows it is given, sorted by id", () => {
    renderTable();
    expect(rowIds()).toEqual([
      "AR-PERF-001", "AR-SEC-001", "FR-API-001", "FR-API-002",
      "FR-API-003", "FR-SCAN-001", "FR-SCAN-002", "FR-SCAN-003",
    ]);
    expect(within(screen.getAllByRole("row")[1]).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "AR-PERF-001", "AR", "Scan completes under 5s for 10k files", "Missing", "10 Feb 2026",
    ]);
    expect(screen.getByText("Showing 8 of 8 requirements")).toBeInTheDocument();
  });

  it("counts against the project total", () => {
    renderTable("?type=AR", requirements.filter((r) => r.type === "AR"));
    expect(screen.getByText("Showing 2 of 8 requirements")).toBeInTheDocument();
  });

  it("requests a filter from the server and shows it as pending until the URL lands", async () => {
    renderTable();
    await userEvent.click(segment("Filter by type", "FR"));
    expect(replace).toHaveBeenLastCalledWith("/?type=FR", { scroll: false });
    expect(segment("Filter by type", "FR")).toHaveAttribute("aria-pressed", "true");
    expect(region()).toHaveAttribute("aria-busy", "true");
    expect(rowIds()).toHaveLength(6);
    act(() => commitNavigation());
    expect(region()).not.toHaveAttribute("aria-busy");
    expect(segment("Filter by type", "FR")).toHaveAttribute("aria-pressed", "true");
  });

  it("composes quick consecutive clicks before the URL lands", async () => {
    renderTable();
    await userEvent.click(segment("Filter by type", "FR"));
    await userEvent.click(segment("Filter by coverage status", "Partial"));
    await userEvent.click(segment("Filter by coverage status", "Missing"));
    expect(lastNavigation()).toBe("/?type=FR&status=partial&status=missing");
    expect(rowIds()).toEqual(["FR-API-003"]);
  });

  it("clears a group with All", async () => {
    renderTable("?status=missing", requirements.filter((r) => r.status === "missing"));
    await userEvent.click(segment("Filter by coverage status", "All"));
    expect(lastNavigation()).toBe("/");
  });

  it("treats selecting every type as All", async () => {
    renderTable("?type=FR", requirements.filter((r) => r.type === "FR"));
    await userEvent.click(segment("Filter by type", "AR"));
    expect(lastNavigation()).toBe("/");
    expect(segment("Filter by type", "All")).toHaveAttribute("aria-pressed", "true");
  });

  it("does not navigate when nothing changes", async () => {
    renderTable();
    await userEvent.click(segment("Filter by type", "All"));
    expect(replace).not.toHaveBeenCalled();
    expect(region()).not.toHaveAttribute("aria-busy");
  });

  it("clears the pending state when the URL changes elsewhere", async () => {
    renderTable();
    await userEvent.click(segment("Filter by type", "FR"));
    expect(region()).toHaveAttribute("aria-busy", "true");
    act(() => setSearch("?status=missing"));
    expect(region()).not.toHaveAttribute("aria-busy");
    expect(segment("Filter by coverage status", "Missing")).toHaveAttribute("aria-pressed", "true");
  });

  it("restores and ignores URL values", () => {
    renderTable("?type=AR&status=missing&status=bogus&sort=title");
    expect(segment("Filter by type", "AR")).toHaveAttribute("aria-pressed", "true");
    expect(segment("Filter by coverage status", "Missing")).toHaveAttribute("aria-pressed", "true");
    expect(segment("Filter by coverage status", "Covered")).toHaveAttribute("aria-pressed", "false");
  });

  it("searches in the browser without a server navigation", async () => {
    renderTable();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "scan");
    expect(rowIds()).toEqual(["AR-PERF-001", "AR-SEC-001", "FR-SCAN-001", "FR-SCAN-002", "FR-SCAN-003"]);
    expect(lastHref()).toBe("/?q=scan");
    expect(replace).not.toHaveBeenCalled();
  });

  it("keeps the search text when a filter changes", async () => {
    renderTable();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "scan");
    await userEvent.click(segment("Filter by type", "FR"));
    expect(lastNavigation()).toBe("/?q=scan&type=FR");
    expect(rowIds()).toEqual(["FR-SCAN-001", "FR-SCAN-002", "FR-SCAN-003"]);
  });

  it("follows the search text when the URL changes from outside", () => {
    renderTable("?q=scan");
    const searchbox = screen.getByRole("searchbox", { name: "Search" });
    expect(searchbox).toHaveValue("scan");
    act(() => setSearch(""));
    expect(searchbox).toHaveValue("");
  });

  it("sorts immediately and requests the sort from the server", async () => {
    renderTable();
    await userEvent.click(screen.getByRole("button", { name: "Sort by Updated" }));
    expect(lastNavigation()).toBe("/?sort=updatedAt");
    expect(rowIds()).toEqual([
      "AR-PERF-001", "FR-API-003", "AR-SEC-001", "FR-API-002",
      "FR-SCAN-001", "FR-SCAN-003", "FR-API-001", "FR-SCAN-002",
    ]);
    expect(screen.getByRole("columnheader", { name: "Updated" })).toHaveAttribute("aria-sort", "ascending");
    act(() => commitNavigation());
    await userEvent.click(screen.getByRole("button", { name: "Sort by Updated" }));
    expect(lastNavigation()).toBe("/?sort=updatedAt&order=desc");
    expect(rowIds()[0]).toBe("FR-SCAN-002");
  });

  it("shows an empty state that clears the filters", async () => {
    renderTable("?type=AR&status=covered", []);
    expect(screen.getByText("No requirements match these filters")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(lastNavigation()).toBe("/");
  });

  it("links to detail pages with the current filters, encoding ids", () => {
    renderTable("?type=FR&sort=updatedAt", [...requirements.filter((r) => r.type === "FR"), { ...requirements[2], id: "FR-X Y-001" }]);
    expect(screen.getByRole("link", { name: "FR-API-001" })).toHaveAttribute("href", "/requirements/FR-API-001?type=FR&sort=updatedAt");
    expect(screen.getByRole("link", { name: "FR-X Y-001" })).toHaveAttribute("href", "/requirements/FR-X%20Y-001?type=FR&sort=updatedAt");
  });

  it("has no axe violations", async () => {
    const { container } = renderTable("?type=FR", requirements.filter((r) => r.type === "FR"));
    expect(await axeViolations(container)).toEqual([]);
  });
});
