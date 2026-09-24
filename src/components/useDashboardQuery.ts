"use client";
// @req SCD-FLT-001, SCD-FLT-003, SCD-SORT-001
import { usePathname, useSearchParams } from "next/navigation";
import { parseDashboardQuery, serializeDashboardQuery, type DashboardQuery } from "@/lib/dashboard/query";

/** The dashboard view state from the URL, and a way to change it. */
export function useDashboardQuery() {
  const params = useSearchParams();
  const pathname = usePathname();
  const query = parseDashboardQuery(params);

  function update(patch: Partial<DashboardQuery>): void {
    // Filtering happens in the browser, so rewrite the URL in place: no server render, no
    // history entry, and useSearchParams (which Next.js syncs with history.replaceState)
    // reflects the change straight away, so quick successive clicks build on each other.
    window.history.replaceState(null, "", `${pathname}${serializeDashboardQuery({ ...query, ...patch })}`);
  }

  return { query, update };
}
