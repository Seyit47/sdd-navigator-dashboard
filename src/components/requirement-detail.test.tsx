// @vitest-environment jsdom
// @req SCD-UI-004, SCD-A11Y-002
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axeViolations } from "@/test/axe";
import { loadRequirement } from "@/test/fixtures";
import { RequirementDetailView } from "./RequirementDetailView";

async function renderDetail(id: string, backHref = "/") {
  const requirement = await loadRequirement(id);
  return render(<RequirementDetailView requirement={requirement} backHref={backHref} />);
}

describe("RequirementDetailView", () => {
  it("shows every field and the coverage assessment", async () => {
    const { container } = await renderDetail("FR-API-002");
    expect(screen.getByText("FR-API-002 · FR")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Requirement detail with linked artifacts" })).toBeInTheDocument();
    expect(screen.getByText("Fully covered")).toBeInTheDocument();
    expect(
      screen.getByText("GET /requirements/{id} MUST return the requirement with all linked annotations and tasks."),
    ).toBeInTheDocument();
    const fields = container.querySelector("dl");
    expect(fields).toHaveTextContent("Statuscovered");
    expect(fields).toHaveTextContent("Created14 Feb 2026");
    expect(fields).toHaveTextContent("Updated25 Feb 2026");
  });

  it("lists linked annotations with file, line, type and snippet", async () => {
    await renderDetail("FR-API-002");
    const list = within(screen.getByRole("list", { name: "Annotations" }));
    expect(list.getAllByRole("listitem").map((item) => item.querySelector("p")?.textContent)).toEqual([
      "src/api/requirements.rs:45 · impl",
      "tests/api_test.rs:55 · test",
    ]);
    expect(list.getByText(/async fn get_requirement/)).toBeInTheDocument();
  });

  it("lists linked tasks", async () => {
    await renderDetail("FR-API-002");
    const table = screen.getByRole("table", { name: "Linked tasks" });
    const cells = within(within(table).getAllByRole("row")[1]).getAllByRole("cell").map((c) => c.textContent);
    expect(cells).toEqual(["TASK-004", "Write tests for requirement detail", "open", "—Unassigned", "20 Feb 2026"]);
  });

  it.each([
    ["FR-API-002", "Fully covered"],
    ["FR-API-003", "Needs tests"],
    ["AR-SEC-001", "Not implemented"],
  ])("labels %s as %s", async (id, label) => {
    await renderDetail(id);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("says when nothing is linked", async () => {
    await renderDetail("AR-SEC-001");
    expect(screen.getByText("No annotations reference this requirement.")).toBeInTheDocument();
    expect(screen.getByText("No tasks reference this requirement.")).toBeInTheDocument();
  });

  it("links back to the table with the given filters", async () => {
    await renderDetail("FR-API-002", "/?type=FR&status=covered");
    expect(screen.getByRole("link", { name: "← Back to requirements" })).toHaveAttribute("href", "/?type=FR&status=covered");
  });

  it("has no axe violations", async () => {
    const { container } = await renderDetail("FR-API-002");
    expect(await axeViolations(container)).toEqual([]);
  });
});
