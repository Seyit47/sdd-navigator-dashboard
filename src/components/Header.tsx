// @req SCD-API-001, SCD-THEME-001
import Link from "next/link";
import { dataMode } from "@/lib/api";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-hairline bg-plane/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <h1 className="text-base font-semibold tracking-tight">
          <Link href="/">SDD Navigator</Link>
        </h1>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">
          {dataMode === "api" ? "Live API" : "Mock data"}
        </span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
