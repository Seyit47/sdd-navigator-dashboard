"use client";
// @req SCD-UI-005, SCD-UI-007, SCD-FLT-003, SCD-STATE-003, SCD-A11Y-001
import Link from "next/link";
import type { Task } from "@/lib/api";
import { formatLabel } from "@/lib/dashboard/format";
import { TASK_STATUSES } from "@/lib/dashboard/options";
import { applyTaskQuery, serializeDashboardQuery } from "@/lib/dashboard/query";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { SegmentedFilter } from "./SegmentedFilter";
import { useDashboardQuery } from "./useDashboardQuery";

const HEADERS = ["ID", "Requirement", "Title", "Status", "Assignee"];

export function TasksPanel({ tasks, total, orphanTaskIds }: { tasks: Task[]; total: number; orphanTaskIds: string[] }) {
  const { query, isPending, update } = useDashboardQuery();
  const rows = applyTaskQuery(tasks, query);
  const orphans = new Set(orphanTaskIds);
  const linkQuery = serializeDashboardQuery(query);

  return (
    <Card
      titleId="tasks-heading"
      title="Tasks"
      busy={isPending}
      meta={
        <p aria-live="polite" className="text-sm text-muted">
          Showing {rows.length} of {total} tasks
        </p>
      }
    >
      <div className="mt-4">
        <SegmentedFilter
          label="Filter by task status"
          legend="Status"
          options={TASK_STATUSES}
          selected={query.taskStatuses}
          onChange={(taskStatuses) => update({ taskStatuses })}
          format={formatLabel}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No tasks match this filter"
          hint="Choose another status or show all tasks."
          action={
            <button
              type="button"
              onClick={() => update({ taskStatuses: [] })}
              className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink hover:text-ink-2"
            >
              Clear filter
            </button>
          }
        />
      ) : (
        <div className="relative mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Tasks</caption>
            <thead>
              <tr className="text-xs text-muted">
                {HEADERS.map((header) => (
                  <th key={header} scope="col" className="px-3 py-2 font-medium">
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
                    className={`border-t border-hairline ${orphan ? "bg-critical-tint" : "transition-colors hover:bg-plane"}`}
                  >
                    <td className="px-3 py-3 font-mono whitespace-nowrap">{t.id}</td>
                    <td className="px-3 py-3 font-mono whitespace-nowrap">
                      {orphan ? (
                        <>
                          {t.requirementId}{" "}
                          <span className="ml-1 rounded-full bg-surface px-2 py-0.5 font-sans text-xs font-medium text-ink">
                            ⚠ Orphan
                          </span>
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
                    <td className="px-3 py-3">{t.title}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-ink-2">{formatLabel(t.status)}</td>
                    <td className="px-3 py-3 text-ink-2">
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
    </Card>
  );
}
