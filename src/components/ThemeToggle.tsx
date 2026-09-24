"use client";
// @req SCD-THEME-001, SCD-A11Y-001
import { useSyncExternalStore } from "react";
import { getTheme, setTheme, subscribeTheme, type Theme } from "@/lib/dashboard/theme";

// On the server the theme is unknown; the client value arrives after hydration.
const getServerTheme = (): Theme | null => null;

export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme | null>(subscribeTheme, getTheme, getServerTheme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={theme === null ? "Toggle colour theme" : `Switch to ${next} theme`}
      className="rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
    </button>
  );
}
