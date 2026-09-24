// @vitest-environment jsdom
// @req SCD-UI-001, SCD-UI-004, SCD-UI-005, SCD-UI-006, SCD-STATE-001, SCD-STATE-002
import { render, screen } from "@testing-library/react";
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

describe("dashboard page", () => {
  it("renders the summary, requirements, tasks and orphans from mock data", async () => {
    render(await DashboardPage());
    expect(screen.getByRole("group", { name: "Coverage" })).toHaveTextContent("62.5%");
    expect(screen.getByRole("heading", { name: "Requirements" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Orphans (3)" })).toBeInTheDocument();
  });
});

describe("requirement page", () => {
  it("renders the requirement and keeps only recognised filters in the back link", async () => {
    render(
      await RequirementPage({
        params: Promise.resolve({ id: "FR-API-002" }),
        searchParams: Promise.resolve({ type: "FR", status: ["covered", "partial"], bogus: "x" }),
      }),
    );
    expect(screen.getByRole("heading", { level: 2, name: "Requirement detail with linked artifacts" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Back to requirements" })).toHaveAttribute(
      "href",
      "/?type=FR&status=covered&status=partial",
    );
  });

  it("calls notFound for an unknown requirement", async () => {
    await expect(
      RequirementPage({ params: Promise.resolve({ id: "FR-UNKNOWN-999" }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("has a not-found state that links back", () => {
    render(<RequirementNotFound />);
    expect(screen.getByRole("heading", { name: "Requirement not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Back to requirements" })).toHaveAttribute("href", "/");
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
