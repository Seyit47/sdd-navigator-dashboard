"use client";
// @req SCD-UI-003, SCD-FLT-001, SCD-FLT-002, SCD-SORT-001, SCD-STATE-003, SCD-A11Y-001
import Link from "next/link";
import { useState } from "react";
import type { Requirement, SortField, SortOrder } from "@/lib/api";
import { formatDate } from "@/lib/dashboard/format";
import { COVERAGE_STATUSES, REQUIREMENT_TYPES } from "@/lib/dashboard/options";
import {
  applyRequirementQuery,
  serializeDashboardQuery,
  toggleValue,
  type DashboardQuery,
} from "@/lib/dashboard/query";
import { FilterChips } from "./FilterChips";
import { StatusBadge } from "./StatusBadge";
import { useDashboardQuery } from "./useDashboardQuery";

export function RequirementsTable({ requirements }: { requirements: Requirement[] }) {
  const { query, update } = useDashboardQuery();
  // Local state keeps typing responsive; every keystroke is also written to the URL.
  const [search, setSearch] = useState(query.q);
  // When q changes from outside (a link, the back button), adopt the URL's value.
  const [syncedQ, setSyncedQ] = useState(query.q);
  if (query.q !== syncedQ) {
    setSyncedQ(query.q);
    setSearch(query.q);
  }
  const effective: DashboardQuery = { ...query, q: search.trim() };
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
    <section aria-labelledby="requirements-heading" className="rounded-lg border border-hairline bg-surface p-4">
      <h2 id="requirements-heading" className="text-base font-semibold">
        Requirements
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-2">Search</span>
          <input
            type="search"
            value={search}
            placeholder="ID or title"
            onChange={(event) => {
              setSearch(event.target.value);
              set({ q: event.target.value.trim() });
            }}
            className="w-48 rounded-md border border-hairline bg-plane px-2 py-1 text-ink"
          />
        </label>
        <FilterChips
          label="Filter by type"
          legend="Type"
          options={REQUIREMENT_TYPES}
          selected={query.types}
          onToggle={(type) => set({ types: toggleValue(query.types, type, REQUIREMENT_TYPES) })}
        />
        <FilterChips
          label="Filter by coverage status"
          legend="Status"
          options={COVERAGE_STATUSES}
          selected={query.statuses}
          onToggle={(status) => set({ statuses: toggleValue(query.statuses, status, COVERAGE_STATUSES) })}
        />
        {filtered && rows.length > 0 ? (
          <button type="button" onClick={clearFilters} className="text-sm text-link underline">
            Clear filters
          </button>
        ) : null}
      </div>

      <p aria-live="polite" className="mt-3 text-sm text-ink-2">
        Showing {rows.length} of {requirements.length} requirements
      </p>

      {rows.length === 0 ? (
        <div className="mt-3 rounded-md border border-dashed border-hairline p-6 text-center">
          <p>No requirements match these filters.</p>
          <button type="button" onClick={clearFilters} className="mt-2 text-sm text-link underline">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Requirements</caption>
            <thead className="text-ink-2">
              <tr>
                <SortHeader field="id" label="ID" sort={query.sort} order={query.order} onSort={sortBy} />
                <th scope="col" className="px-2 py-2 font-semibold">
                  Type
                </th>
                <th scope="col" className="px-2 py-2 font-semibold">
                  Title
                </th>
                <th scope="col" className="px-2 py-2 font-semibold">
                  Status
                </th>
                <SortHeader field="updatedAt" label="Updated" sort={query.sort} order={query.order} onSort={sortBy} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-grid">
                  <td className="px-2 py-2 font-mono whitespace-nowrap">
                    <Link href={`/requirements/${encodeURIComponent(r.id)}${linkQuery}`} className="text-link hover:underline">
                      {r.id}
                    </Link>
                  </td>
                  <td className="px-2 py-2">{r.type}</td>
                  <td className="px-2 py-2">{r.title}</td>
                  <td className="px-2 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap tabular-nums text-ink-2">
                    <time dateTime={r.updatedAt}>{formatDate(r.updatedAt)}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
      className="px-2 py-2 font-semibold"
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        aria-label={`Sort by ${label}`}
        className="inline-flex items-center gap-1 hover:text-ink"
      >
        {label}
        <span aria-hidden="true">{active ? (order === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}
