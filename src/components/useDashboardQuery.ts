"use client";
// @req SCD-FLT-001, SCD-FLT-002, SCD-FLT-003, SCD-SORT-001, SCD-UI-007
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { parseDashboardQuery, serializeDashboardQuery, type DashboardQuery } from "@/lib/dashboard/query";

/**
 * Dashboard view state from the URL.
 * - update(): filters and sort are fetched on the server, so they navigate with router.replace.
 *   The requested state is shown immediately (pending) and consecutive changes build on it;
 *   it clears as soon as the URL changes — when the navigation lands, or anything else moves it.
 * - setSearchText(): search is applied in the browser, so it only rewrites the URL in place.
 */
export function useDashboardQuery() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const urlQuery = parseDashboardQuery(params);
  const urlKey = serializeDashboardQuery(urlQuery);

  const [pending, setPending] = useState<DashboardQuery | null>(null);
  const [seenKey, setSeenKey] = useState(urlKey);
  if (urlKey !== seenKey) {
    setSeenKey(urlKey);
    setPending(null);
  }

  const query = pending ?? urlQuery;

  function update(patch: Partial<DashboardQuery>): void {
    const next = { ...query, ...patch };
    const nextKey = serializeDashboardQuery(next);
    if (nextKey === urlKey) {
      setPending(null);
      return;
    }
    setPending(next);
    router.replace(`${pathname}${nextKey}`, { scroll: false });
  }

  function setSearchText(q: string): void {
    window.history.replaceState(null, "", `${pathname}${serializeDashboardQuery({ ...query, q })}`);
  }

  return { query, isPending: pending !== null, update, setSearchText };
}
