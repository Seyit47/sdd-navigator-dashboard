"use client";
// @req SCD-UI-003, SCD-UI-007, SCD-FLT-001, SCD-FLT-002, SCD-SORT-001, SCD-STATE-003, SCD-A11Y-001
import Link from "next/link";
import { useState } from "react";
import type { Requirement, SortField, SortOrder } from "@/lib/api";
import { formatDate, formatLabel } from "@/lib/dashboard/format";
import { COVERAGE_STATUSES, REQUIREMENT_TYPES } from "@/lib/dashboard/options";
import { applyRequirementQuery, serializeDashboardQuery, type DashboardQuery } from "@/lib/dashboard/query";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { SegmentedFilter } from "./SegmentedFilter";
import { StatusPill } from "./StatusPill";
import { useDashboardQuery } from "./useDashboardQuery";

export function RequirementsTable({ requirements, total }: { requirements: Requirement[]; total: number }) {
  const { query, isPending, update, setSearchText } = useDashboardQuery();
  // Local text keeps typing responsive; it adopts the URL's q when that changes from outside.
  const [search, setSearch] = useState(query.q);
  const [syncedQ, setSyncedQ] = useState(query.q);
  if (query.q !== syncedQ) {
    setSyncedQ(query.q);
    setSearch(query.q);
  }

  const effective: DashboardQuery = { ...query, q: search.trim() };
  // The server already applied the URL's filters; applying the pending ones here too makes
  // narrowing instant while the server re-fetches.
  const rows = applyRequirementQuery(requirements, effective);
  const linkQuery = serializeDashboardQuery(effective);
  const filtered = effective.q !== "" || query.types.length > 0 || query.statuses.length > 0;

  const set = (patch: Partial<DashboardQuery>) => update({ q: effective.q, ...patch });

  function sortBy(field: SortField) {
    set(query.sort === field ? { order: query.order === "asc" ? "desc" : "asc" } : { sort: field, order: "asc" });
  }

  function clearFilters() {
    setSearch("");
    update({ q: "", types: [], statuses: [] });
  }

  return (
    <Card
      titleId="requirements-heading"
      title="Requirements"
      busy={isPending}
      meta={
        <p aria-live="polite" className="text-sm text-muted">
          Showing {rows.length} of {total} requirements
        </p>
      }
    >
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <label className="w-full sm:w-64">
          <span className="sr-only">Search</span>
          <input
            type="search"
            value={search}
            placeholder="Search ID or title"
            onChange={(event) => {
              setSearch(event.target.value);
              setSearchText(event.target.value.trim());
            }}
            className="w-full rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-muted"
          />
        </label>
        <SegmentedFilter
          label="Filter by type"
          legend="Type"
          options={REQUIREMENT_TYPES}
          selected={query.types}
          onChange={(types) => set({ types })}
        />
        <SegmentedFilter
          label="Filter by coverage status"
          legend="Status"
          options={COVERAGE_STATUSES}
          selected={query.statuses}
          onChange={(statuses) => set({ statuses })}
          format={formatLabel}
        />
        {filtered && rows.length > 0 ? (
          <button type="button" onClick={clearFilters} className="text-sm text-link hover:underline">
            Clear filters
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No requirements match these filters"
          hint="Try removing a filter or changing the search."
          action={
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink hover:text-ink-2"
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <div className="relative mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Requirements</caption>
            <thead>
              <tr className="text-xs text-muted">
                <SortHeader field="id" label="ID" sort={query.sort} order={query.order} onSort={sortBy} />
                <th scope="col" className="px-3 py-2 font-medium">
                  Type
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Title
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Status
                </th>
                <SortHeader field="updatedAt" label="Updated" sort={query.sort} order={query.order} onSort={sortBy} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-hairline transition-colors hover:bg-plane">
                  <td className="px-3 py-3 font-mono whitespace-nowrap">
                    <Link href={`/requirements/${encodeURIComponent(r.id)}${linkQuery}`} className="text-link hover:underline">
                      {r.id}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-ink-2">{r.type}</td>
                  <td className="px-3 py-3">{r.title}</td>
                  <td className="px-3 py-3">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap tabular-nums text-muted">
                    <time dateTime={r.updatedAt}>{formatDate(r.updatedAt)}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SortHeader({
  field,
  label,
  sort,
  order,
  onSort,
}: {
  field: SortField;
  label: string;
  sort: SortField;
  order: SortOrder;
  onSort: (field: SortField) => void;
}) {
  const active = sort === field;
  return (
    <th
      scope="col"
      aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"}
      className="px-3 py-2 font-medium"
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        aria-label={`Sort by ${label}`}
        className="inline-flex items-center gap-1 hover:text-ink"
      >
        {label}
        {active ? <span aria-hidden="true">{order === "asc" ? "↑" : "↓"}</span> : null}
      </button>
    </th>
  );
}
