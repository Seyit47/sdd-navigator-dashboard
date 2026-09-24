// @vitest-environment jsdom
// @req SCD-UI-006, SCD-A11Y-002
import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import type { Annotation, Task } from "@/lib/api";
import { axeViolations } from "@/test/axe";
import { loadFixtures } from "@/test/fixtures";
import { OrphanPanel } from "./OrphanPanel";

let annotations: Annotation[];
let tasks: Task[];

beforeAll(async () => {
  const fixtures = await loadFixtures();
  annotations = fixtures.orphanAnnotations;
  tasks = fixtures.orphanTasks;
});

const cells = (table: HTMLElement) =>
  within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell").map((c) => c.textContent));

describe("OrphanPanel", () => {
  it("lists orphan annotations and orphan tasks together", () => {
    render(<OrphanPanel annotations={annotations} tasks={tasks} />);
    expect(cells(screen.getByRole("table", { name: "Annotations (2)" }))).toEqual([
      ["src/api/legacy.rs", "5", "FR-LEGACY-001", "impl"],
      ["tests/api_test.rs", "88", "FR-API-099", "test"],
    ]);
    expect(cells(screen.getByRole("table", { name: "Tasks (1)" }))).toEqual([
      ["TASK-006", "Add CSV export", "FR-EXPORT-001"],
    ]);
  });

  it("is a collapsible section, open by default, with the total in its heading", () => {
    const { container } = render(<OrphanPanel annotations={annotations} tasks={tasks} />);
    expect(screen.getByRole("heading", { name: "Orphans (3)" })).toBeInTheDocument();
    expect(container.querySelector("section#orphans details")).toHaveAttribute("open");
  });

  it("says so when there are no orphans", () => {
    render(<OrphanPanel annotations={[]} tasks={[]} />);
    expect(screen.getByText("No orphans — every reference points to a known requirement.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("marks an empty sub-list with None", () => {
    render(<OrphanPanel annotations={annotations} tasks={[]} />);
    expect(screen.getByRole("heading", { name: "Tasks (0)" })).toBeInTheDocument();
    expect(screen.getByText("None.")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<OrphanPanel annotations={annotations} tasks={tasks} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
