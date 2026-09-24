// @req SCD-API-001, SCD-THEME-001
import Link from "next/link";
import { dataMode } from "@/lib/api";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  return (
    <header className="border-b border-hairline bg-surface">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <h1 className="text-lg font-semibold">
          <Link href="/">SDD Navigator</Link>
        </h1>
        <span className="rounded-full border border-hairline px-2 py-0.5 text-xs text-ink-2">
          {dataMode === "api" ? "Live API" : "Mock data"}
        </span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
