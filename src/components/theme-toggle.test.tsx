// @vitest-environment jsdom
// @req SCD-THEME-001, SCD-A11Y-002
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { THEME_INIT_SCRIPT } from "@/lib/dashboard/theme";
import { axeViolations } from "@/test/axe";
import { ThemeToggle } from "./ThemeToggle";

function runInitScript(): void {
  new Function(THEME_INIT_SCRIPT)();
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

// @req SCD-THEME-001, SCD-A11Y-002
describe("ThemeToggle", () => {
  it("follows the OS preference on first visit", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("switches the theme and persists the choice in localStorage", async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    await userEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("starts from the stored choice applied by the init script", () => {
    localStorage.setItem("theme", "dark");
    runInitScript();
    expect(document.documentElement.dataset.theme).toBe("dark");
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });

  it("ignores invalid stored values", () => {
    localStorage.setItem("theme", "blue");
    runInitScript();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("has no axe violations", async () => {
    const { container } = render(<ThemeToggle />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
