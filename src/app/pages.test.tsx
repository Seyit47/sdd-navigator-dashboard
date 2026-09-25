// @vitest-environment jsdom
// @req SCD-UI-001, SCD-UI-004, SCD-UI-005, SCD-UI-006, SCD-FLT-001, SCD-STATE-001, SCD-STATE-002
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetNavigation } from "@/test/navigation";
import DashboardLoading from "./loading";
import DashboardPage from "./page";
import RequirementLoading from "./requirements/[id]/loading";
import RequirementNotFound from "./requirements/[id]/not-found";
import RequirementPage from "./requirements/[id]/page";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);
vi.mock("next/server", () => ({ connection: async () => undefined }));

beforeEach(() => {
  resetNavigation();
});

const dashboard = (search: Record<string, string | string[]> = {}) =>
  DashboardPage({ params: Promise.resolve({}), searchParams: Promise.resolve(search) });

describe("dashboard page", () => {
  it("renders the summary, requirements, tasks and orphans from mock data", async () => {
    render(await dashboard());
    expect(screen.getByRole("group", { name: "Coverage" })).toHaveTextContent("62.5%");
    expect(screen.getByRole("region", { name: "Requirements" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Orphans" })).toBeInTheDocument();
  });

  it("fetches filtered data on the server from the URL", async () => {
    render(await dashboard({ type: "AR", status: ["missing"], taskStatus: "done" }));
    const requirements = within(screen.getByRole("region", { name: "Requirements" }));
    expect(requirements.getByText("Showing 2 of 8 requirements")).toBeInTheDocument();
    const tasks = within(screen.getByRole("region", { name: "Tasks" }));
    expect(tasks.getByText("Showing 2 of 6 tasks")).toBeInTheDocument();
  });
});

describe("requirement page", () => {
  it("renders the requirement and keeps only recognised filters in the breadcrumb", async () => {
    render(
      await RequirementPage({
        params: Promise.resolve({ id: "FR-API-002" }),
        searchParams: Promise.resolve({ type: "FR", status: ["covered", "partial"], bogus: "x" }),
      }),
    );
    expect(screen.getByRole("heading", { level: 2, name: "Requirement detail with linked artifacts" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Requirements" })).toHaveAttribute("href", "/?type=FR&status=covered&status=partial");
  });

  it("calls notFound for an unknown requirement", async () => {
    await expect(
      RequirementPage({ params: Promise.resolve({ id: "FR-UNKNOWN-999" }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("has a not-found state that links back", () => {
    render(<RequirementNotFound />);
    expect(screen.getByRole("heading", { name: "Requirement not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to requirements" })).toHaveAttribute("href", "/");
  });
});

// jsdom has no layout engine; these structural rules are what keep the views within a
// 360px phone viewport (verified in Chrome): grid tracks may shrink below their content's
// width, and wide tables scroll inside their own positioned box instead of widening the page.
function expectPhoneSafeLayout(container: HTMLElement) {
  const tables = Array.from(container.querySelectorAll("table"));
  expect(tables.length).toBeGreaterThan(0);
  for (const table of tables) expect(table.closest(".overflow-x-auto")).toHaveClass("relative");
  for (const grid of container.querySelectorAll(".grid")) expect(grid.className).toMatch(/\bgrid-cols-/);
  expect(container.firstElementChild).toHaveClass("grid-cols-[minmax(0,1fr)]");
}

describe("phone layout", () => {
  it("keeps the dashboard within the viewport", async () => {
    const { container } = render(await dashboard());
    expectPhoneSafeLayout(container);
  });

  it("keeps the requirement page within the viewport", async () => {
    const { container } = render(
      await RequirementPage({ params: Promise.resolve({ id: "FR-API-002" }), searchParams: Promise.resolve({}) }),
    );
    expectPhoneSafeLayout(container);
  });
});

describe("loading states", () => {
  it("announce loading for both routes", () => {
    const { unmount } = render(<DashboardLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading dashboard…");
    unmount();
    render(<RequirementLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading requirement…");
  });
});
