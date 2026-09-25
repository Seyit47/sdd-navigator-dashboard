// @vitest-environment jsdom
// @req SCD-UI-004, SCD-UI-007, SCD-A11Y-002
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axeViolations } from "@/test/axe";
import { loadRequirement } from "@/test/fixtures";
import { RequirementDetailView } from "./RequirementDetailView";

async function renderDetail(id: string, backHref = "/") {
  const requirement = await loadRequirement(id);
  return render(<RequirementDetailView requirement={requirement} backHref={backHref} />);
}

// @req SCD-UI-004, SCD-UI-007, SCD-A11Y-002
describe("RequirementDetailView", () => {
  it("shows every field, the status and the assessment", async () => {
    await renderDetail("FR-API-002");
    expect(screen.getByRole("heading", { level: 2, name: "Requirement detail with linked artifacts" })).toBeInTheDocument();
    expect(screen.getByText("Covered")).toBeInTheDocument();
    expect(screen.getByText("Fully covered")).toBeInTheDocument();
    expect(
      screen.getByText("GET /requirements/{id} MUST return the requirement with all linked annotations and tasks."),
    ).toBeInTheDocument();
    const details = screen.getByRole("region", { name: "Details" });
    for (const text of ["IDFR-API-002", "TypeFR", "Created14 Feb 2026", "Updated25 Feb 2026"]) {
      expect(details).toHaveTextContent(text);
    }
  });

  it("lists linked annotations as code cards", async () => {
    await renderDetail("FR-API-002");
    const items = within(screen.getByRole("list", { name: "Annotations" })).getAllByRole("listitem");
    expect(within(items[0]).getByText("src/api/requirements.rs:45")).toBeInTheDocument();
    expect(within(items[0]).getByText("impl")).toBeInTheDocument();
    expect(within(items[1]).getByText("tests/api_test.rs:55")).toBeInTheDocument();
    expect(within(items[1]).getByText("test")).toBeInTheDocument();
    expect(within(items[0]).getByText(/async fn get_requirement/)).toBeInTheDocument();
  });

  it("lists linked tasks", async () => {
    await renderDetail("FR-API-002");
    const table = screen.getByRole("table", { name: "Linked tasks" });
    expect(within(within(table).getAllByRole("row")[1]).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "TASK-004", "Write tests for requirement detail", "Open", "—Unassigned", "20 Feb 2026",
    ]);
  });

  it.each([
    ["FR-API-002", "Fully covered"],
    ["FR-API-003", "Needs tests"],
    ["AR-SEC-001", "Not implemented"],
  ])("assesses %s as %s", async (id, label) => {
    await renderDetail(id);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("says when nothing is linked", async () => {
    await renderDetail("AR-SEC-001");
    expect(screen.getByText("No annotations reference this requirement.")).toBeInTheDocument();
    expect(screen.getByText("No tasks reference this requirement.")).toBeInTheDocument();
  });

  it("links back to the table with the given filters via the breadcrumb", async () => {
    await renderDetail("FR-API-002", "/?type=FR&status=covered");
    const breadcrumb = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(breadcrumb.getByRole("link", { name: "Requirements" })).toHaveAttribute("href", "/?type=FR&status=covered");
    expect(breadcrumb.getByText("FR-API-002")).toHaveAttribute("aria-current", "page");
  });

  it("has no axe violations", async () => {
    const { container } = await renderDetail("FR-API-002");
    expect(await axeViolations(container)).toEqual([]);
  });
});
