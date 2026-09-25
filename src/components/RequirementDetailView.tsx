// @req SCD-UI-004, SCD-UI-007, SCD-A11Y-001
import Link from "next/link";
import type { RequirementDetail } from "@/lib/api";
import { STATUS_PRESENTATION } from "@/lib/dashboard/coverage";
import { formatDate, formatLabel } from "@/lib/dashboard/format";
import { Card } from "./Card";
import { StatusPill } from "./StatusPill";

const TASK_HEADERS = ["ID", "Title", "Status", "Assignee", "Updated"];

export function RequirementDetailView({ requirement, backHref }: { requirement: RequirementDetail; backHref: string }) {
  return (
    <article aria-labelledby="requirement-title" className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-2 text-sm text-muted">
          <li>
            <Link href={backHref} className="text-link hover:underline">
              Requirements
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-mono text-ink-2">
            {requirement.id}
          </li>
        </ol>
      </nav>

      <header className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <h2 id="requirement-title" className="text-2xl font-semibold tracking-tight">
          {requirement.title}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill status={requirement.status} />
          <span className="text-sm font-medium text-ink-2">{STATUS_PRESENTATION[requirement.status].assessment}</span>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-label="Description" className="surface-card p-5">
          <p className="leading-relaxed">{requirement.description}</p>
        </section>
        <section aria-label="Details" className="surface-card p-5">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">ID</dt>
            <dd className="font-mono">{requirement.id}</dd>
            <dt className="text-muted">Type</dt>
            <dd>{requirement.type}</dd>
            <dt className="text-muted">Created</dt>
            <dd>
              <time dateTime={requirement.createdAt}>{formatDate(requirement.createdAt)}</time>
            </dd>
            <dt className="text-muted">Updated</dt>
            <dd>
              <time dateTime={requirement.updatedAt}>{formatDate(requirement.updatedAt)}</time>
            </dd>
          </dl>
        </section>
      </div>

      <Card titleId="annotations-heading" title={`Annotations (${requirement.annotations.length})`}>
        {requirement.annotations.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">No annotations reference this requirement.</p>
        ) : (
          <ul aria-label="Annotations" className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3">
            {requirement.annotations.map((a) => (
              <li key={`${a.file}:${a.line}`} className="overflow-hidden rounded-lg bg-surface-2">
                <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                  <span className="truncate font-mono text-ink-2">
                    {a.file}:{a.line}
                  </span>
                  <span className="rounded-full bg-surface px-2 py-0.5 font-medium text-ink">{a.type}</span>
                </div>
                <pre className="overflow-x-auto px-3 pb-3 text-xs">
                  <code>{a.snippet}</code>
                </pre>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card titleId="detail-tasks-heading" title={`Tasks (${requirement.tasks.length})`}>
        {requirement.tasks.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">No tasks reference this requirement.</p>
        ) : (
          <div className="relative mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Linked tasks</caption>
              <thead>
                <tr className="text-xs text-muted">
                  {TASK_HEADERS.map((header) => (
                    <th key={header} scope="col" className="px-3 py-2 font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requirement.tasks.map((t) => (
                  <tr key={t.id} className="border-t border-hairline">
                    <td className="px-3 py-3 font-mono">{t.id}</td>
                    <td className="px-3 py-3">{t.title}</td>
                    <td className="px-3 py-3 text-ink-2">{formatLabel(t.status)}</td>
                    <td className="px-3 py-3 text-ink-2">
                      {t.assignee ?? (
                        <>
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">Unassigned</span>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-muted">
                      <time dateTime={t.updatedAt}>{formatDate(t.updatedAt)}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </article>
  );
}
