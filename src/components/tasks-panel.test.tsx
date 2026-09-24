// @vitest-environment jsdom
// @req SCD-UI-005, SCD-FLT-003, SCD-STATE-003, SCD-A11Y-002
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/api";
import { axeViolations } from "@/test/axe";
import { loadFixtures } from "@/test/fixtures";
import { lastHref, resetNavigation, setSearch } from "@/test/navigation";
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
  return render(<TasksPanel tasks={rows} orphanTaskIds={orphanTaskIds} />);
}

const rowIds = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
const row = (id: string) => screen.getByRole("row", { name: new RegExp(`^${id}\\b`) });
const chip = (name: string) =>
  within(screen.getByRole("group", { name: "Filter by task status" })).getByRole("button", { name });

describe("TasksPanel", () => {
  it("renders every task with its columns", () => {
    renderPanel();
    expect(rowIds()).toEqual(["TASK-001", "TASK-002", "TASK-003", "TASK-004", "TASK-005", "TASK-006"]);
    expect(within(row("TASK-003")).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "TASK-003", "FR-API-001", "Add filtering to requirements endpoint", "in progress", "maria",
    ]);
  });

  it("highlights orphan tasks with a text marker and no requirement link", () => {
    renderPanel();
    const orphan = row("TASK-006");
    expect(orphan).toHaveAttribute("data-orphan", "true");
    expect(within(orphan).getByText("⚠ orphan")).toBeInTheDocument();
    expect(within(orphan).queryByRole("link")).toBeNull();
    expect(row("TASK-001")).not.toHaveAttribute("data-orphan");
    expect(within(row("TASK-001")).getByRole("link", { name: "FR-SCAN-001" })).toBeInTheDocument();
  });

  it("marks unassigned tasks", () => {
    renderPanel();
    expect(within(row("TASK-004")).getByText("Unassigned")).toBeInTheDocument();
  });

  it("filters by a status chip and syncs taskStatus", async () => {
    renderPanel();
    await userEvent.click(chip("open"));
    expect(lastHref()).toBe("/?taskStatus=open");
    expect(rowIds()).toEqual(["TASK-004", "TASK-005", "TASK-006"]);
  });

  it("restores a multi-select filter from the URL", () => {
    renderPanel("?taskStatus=done&taskStatus=in_progress");
    expect(rowIds()).toEqual(["TASK-001", "TASK-002", "TASK-003"]);
    expect(chip("in progress")).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the requirement filters when filtering tasks", async () => {
    renderPanel("?type=FR");
    await userEvent.click(chip("done"));
    expect(lastHref()).toBe("/?type=FR&taskStatus=done");
  });

  it("links requirement ids with the current query", () => {
    renderPanel("?type=FR");
    expect(screen.getByRole("link", { name: "FR-SCAN-001" })).toHaveAttribute("href", "/requirements/FR-SCAN-001?type=FR");
  });

  it("shows an empty state and clears the filter", async () => {
    renderPanel(
      "?taskStatus=done",
      tasks.filter((t) => t.status !== "done"),
    );
    expect(screen.getByText("No tasks match this filter.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(lastHref()).toBe("/");
    expect(rowIds()).toHaveLength(4);
  });

  it("has no axe violations", async () => {
    const { container } = renderPanel();
    expect(await axeViolations(container)).toEqual([]);
  });
});
