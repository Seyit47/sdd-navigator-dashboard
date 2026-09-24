"use client";
// @req SCD-FLT-001, SCD-FLT-003, SCD-SORT-001
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseDashboardQuery, serializeDashboardQuery, type DashboardQuery } from "@/lib/dashboard/query";

/** The dashboard view state from the URL, and a way to change it without scrolling or history entries. */
export function useDashboardQuery() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = parseDashboardQuery(params);

  function update(patch: Partial<DashboardQuery>): void {
    router.replace(`${pathname}${serializeDashboardQuery({ ...query, ...patch })}`, { scroll: false });
  }

  return { query, update };
}
