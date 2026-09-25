// @vitest-environment jsdom
// @req SCD-UI-005, SCD-UI-007, SCD-FLT-003, SCD-STATE-003, SCD-A11Y-002
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/api";
import { axeViolations } from "@/test/axe";
import { loadFixtures } from "@/test/fixtures";
import { commitNavigation, lastNavigation, resetNavigation, setSearch } from "@/test/navigation";
import { TasksPanel } from "./TasksPanel";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);

let tasks: Task[];
let orphanTaskIds: string[];

beforeAll(async () => {
  const fixtures = await loadFixtures();
  tasks = fixtures.tasks;
  orphanTaskIds = fixtures.orphanTasks.map((t) => t.id);
});

beforeEach(() => {
  resetNavigation();
});

function renderPanel(search = "", rows: Task[] = tasks) {
  setSearch(search);
  return render(<TasksPanel tasks={rows} total={6} orphanTaskIds={orphanTaskIds} />);
}

const region = () => screen.getByRole("region", { name: "Tasks" });
const rowIds = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
const row = (id: string) => screen.getByRole("row", { name: new RegExp(`^${id}\\b`) });
const segment = (name: string) =>
  within(screen.getByRole("group", { name: "Filter by task status" })).getByRole("button", { name });

// @req SCD-UI-005, SCD-FLT-003, SCD-STATE-003, SCD-UI-007, SCD-A11Y-002
describe("TasksPanel", () => {
  it("renders every task with its columns", () => {
    renderPanel();
    expect(rowIds()).toEqual(["TASK-001", "TASK-002", "TASK-003", "TASK-004", "TASK-005", "TASK-006"]);
    expect(within(row("TASK-003")).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "TASK-003", "FR-API-001", "Add filtering to requirements endpoint", "In progress", "maria",
    ]);
    expect(screen.getByText("Showing 6 of 6 tasks")).toBeInTheDocument();
  });

  it("highlights orphan tasks with a text marker and no requirement link", () => {
    renderPanel();
    expect(row("TASK-006")).toHaveAttribute("data-orphan", "true");
    expect(within(row("TASK-006")).getByText("⚠ Orphan")).toBeInTheDocument();
    expect(within(row("TASK-006")).queryByRole("link")).toBeNull();
    expect(within(row("TASK-001")).getByRole("link", { name: "FR-SCAN-001" })).toBeInTheDocument();
  });

  it("marks unassigned tasks", () => {
    renderPanel();
    expect(within(row("TASK-004")).getByText("Unassigned")).toBeInTheDocument();
  });

  it("requests a status filter from the server with pending feedback", async () => {
    renderPanel();
    await userEvent.click(segment("Open"));
    expect(lastNavigation()).toBe("/?taskStatus=open");
    expect(segment("Open")).toHaveAttribute("aria-pressed", "true");
    expect(region()).toHaveAttribute("aria-busy", "true");
    expect(rowIds()).toEqual(["TASK-004", "TASK-005", "TASK-006"]);
    act(() => commitNavigation());
    expect(region()).not.toHaveAttribute("aria-busy");
  });

  it("restores a multi-select filter from the URL", () => {
    renderPanel("?taskStatus=done&taskStatus=in_progress", tasks.filter((t) => t.status !== "open"));
    expect(segment("Done")).toHaveAttribute("aria-pressed", "true");
    expect(segment("In progress")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Showing 3 of 6 tasks")).toBeInTheDocument();
  });

  it("keeps the requirement filters when filtering tasks", async () => {
    renderPanel("?type=FR");
    await userEvent.click(segment("Done"));
    expect(lastNavigation()).toBe("/?type=FR&taskStatus=done");
  });

  it("links requirement ids with the current query", () => {
    renderPanel("?type=FR");
    expect(screen.getByRole("link", { name: "FR-SCAN-001" })).toHaveAttribute("href", "/requirements/FR-SCAN-001?type=FR");
  });

  it("shows an empty state that clears the filter", async () => {
    renderPanel("?taskStatus=done", []);
    expect(screen.getByText("No tasks match this filter")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(lastNavigation()).toBe("/");
  });

  it("has no axe violations", async () => {
    const { container } = renderPanel();
    expect(await axeViolations(container)).toEqual([]);
  });
});
