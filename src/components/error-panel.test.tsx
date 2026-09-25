// @vitest-environment jsdom
// @req SCD-STATE-002, SCD-STATE-001, SCD-A11Y-002
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "@/test/axe";
import { refresh, resetNavigation } from "@/test/navigation";
import { ErrorPanel } from "./ErrorPanel";
import { LoadingSkeleton } from "./LoadingSkeleton";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);

beforeEach(() => {
  resetNavigation();
});

// @req SCD-STATE-002, SCD-A11Y-002
describe("ErrorPanel", () => {
  it("shows the title and the API message as an alert", () => {
    render(<ErrorPanel title="Couldn't load project stats" error={{ kind: "http", status: 500, message: "Scanner crashed" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load project stats");
    expect(screen.getByRole("alert")).toHaveTextContent("Scanner crashed");
  });

  it("lists validation issues for invalid responses", () => {
    render(
      <ErrorPanel
        title="Couldn't load requirements"
        error={{ kind: "invalid_response", message: "Unexpected response", issues: ["0.status: Invalid option"] }}
      />,
    );
    expect(screen.getByText("0.status: Invalid option")).toBeInTheDocument();
  });

  it("retries by refreshing the route", async () => {
    render(<ErrorPanel title="Couldn't load tasks" error={{ kind: "network", message: "fetch failed" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("has no axe violations", async () => {
    const { container } = render(<ErrorPanel title="Couldn't load tasks" error={{ kind: "network", message: "fetch failed" }} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});

// @req SCD-STATE-001
describe("LoadingSkeleton", () => {
  it("announces loading with a status role", () => {
    render(<LoadingSkeleton label="Loading dashboard…" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading dashboard…");
  });
});
