"use client";
// @req SCD-UI-005, SCD-FLT-003, SCD-STATE-003, SCD-A11Y-001
import Link from "next/link";
import type { Task } from "@/lib/api";
import { formatTaskStatus } from "@/lib/dashboard/format";
import { TASK_STATUSES } from "@/lib/dashboard/options";
import { applyTaskQuery, serializeDashboardQuery, toggleValue } from "@/lib/dashboard/query";
import { FilterChips } from "./FilterChips";
import { useDashboardQuery } from "./useDashboardQuery";

const HEADERS = ["ID", "Requirement", "Title", "Status", "Assignee"];

export function TasksPanel({ tasks, orphanTaskIds }: { tasks: Task[]; orphanTaskIds: string[] }) {
  const { query, update } = useDashboardQuery();
  const rows = applyTaskQuery(tasks, query);
  const orphans = new Set(orphanTaskIds);
  const linkQuery = serializeDashboardQuery(query);

  return (
    <section aria-labelledby="tasks-heading" className="rounded-lg border border-hairline bg-surface p-4">
      <h2 id="tasks-heading" className="text-base font-semibold">
        Tasks
      </h2>
      <div className="mt-3">
        <FilterChips
          label="Filter by task status"
          legend="Status"
          options={TASK_STATUSES}
          selected={query.taskStatuses}
          onToggle={(status) => update({ taskStatuses: toggleValue(query.taskStatuses, status, TASK_STATUSES) })}
          format={formatTaskStatus}
        />
      </div>

      <p aria-live="polite" className="mt-3 text-sm text-ink-2">
        Showing {rows.length} of {tasks.length} tasks
      </p>

      {rows.length === 0 ? (
        <div className="mt-3 rounded-md border border-dashed border-hairline p-6 text-center">
          <p>No tasks match this filter.</p>
          <button type="button" onClick={() => update({ taskStatuses: [] })} className="mt-2 text-sm text-link underline">
            Clear filter
          </button>
        </div>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Tasks</caption>
            <thead className="text-ink-2">
              <tr>
                {HEADERS.map((header) => (
                  <th key={header} scope="col" className="px-2 py-2 font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const orphan = orphans.has(t.id);
                return (
                  <tr
                    key={t.id}
                    data-orphan={orphan || undefined}
                    className={`border-t border-grid ${orphan ? "bg-orphan-tint" : ""}`}
                  >
                    <td className="px-2 py-2 font-mono whitespace-nowrap">{t.id}</td>
                    <td className="px-2 py-2 font-mono whitespace-nowrap">
                      {orphan ? (
                        <>
                          {t.requirementId}{" "}
                          <span className="ml-1 rounded border border-critical px-1 font-sans text-xs text-ink">⚠ orphan</span>
                        </>
                      ) : (
                        <Link
                          href={`/requirements/${encodeURIComponent(t.requirementId)}${linkQuery}`}
                          className="text-link hover:underline"
                        >
                          {t.requirementId}
                        </Link>
                      )}
                    </td>
                    <td className="px-2 py-2">{t.title}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{formatTaskStatus(t.status)}</td>
                    <td className="px-2 py-2">
                      {t.assignee ?? (
                        <>
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">Unassigned</span>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
