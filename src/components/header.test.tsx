// @vitest-environment jsdom
// @req SCD-API-001, SCD-A11Y-002
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axeViolations } from "@/test/axe";
import { Header } from "./Header";

// @req SCD-API-001, SCD-A11Y-002
describe("Header", () => {
  it("shows the title, the active data mode and the theme toggle", () => {
    render(<Header />);
    expect(screen.getByRole("heading", { level: 1, name: "SDD Navigator" })).toBeInTheDocument();
    expect(screen.getByText("Mock data")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /theme/ })).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<Header />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
