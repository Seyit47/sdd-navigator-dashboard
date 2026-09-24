// @req SCD-UI-004, SCD-A11Y-001
import Link from "next/link";
import type { RequirementDetail } from "@/lib/api";
import { STATUS_PRESENTATION } from "@/lib/dashboard/coverage";
import { formatDate, formatTaskStatus } from "@/lib/dashboard/format";

const TASK_HEADERS = ["ID", "Title", "Status", "Assignee", "Updated"];

export function RequirementDetailView({ requirement, backHref }: { requirement: RequirementDetail; backHref: string }) {
  const p = STATUS_PRESENTATION[requirement.status];
  return (
    <article aria-labelledby="requirement-title" className="grid gap-4">
      <p>
        <Link href={backHref} className="text-sm text-link hover:underline">
          ← Back to requirements
        </Link>
      </p>

      <section className="rounded-lg border border-hairline bg-surface p-4">
        <p className="font-mono text-sm text-ink-2">
          {requirement.id} · {requirement.type}
        </p>
        <h2 id="requirement-title" className="mt-1 text-xl font-semibold">
          {requirement.title}
        </h2>
        <p className="mt-2 inline-flex items-center gap-2 font-semibold">
          <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span aria-hidden="true">{p.icon}</span>
          <span>{p.assessment}</span>
        </p>
        <p className="mt-3">{requirement.description}</p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-2">Status</dt>
          <dd>{requirement.status}</dd>
          <dt className="text-ink-2">Created</dt>
          <dd>
            <time dateTime={requirement.createdAt}>{formatDate(requirement.createdAt)}</time>
          </dd>
          <dt className="text-ink-2">Updated</dt>
          <dd>
            <time dateTime={requirement.updatedAt}>{formatDate(requirement.updatedAt)}</time>
          </dd>
        </dl>
      </section>

      <section aria-labelledby="annotations-heading" className="rounded-lg border border-hairline bg-surface p-4">
        <h3 id="annotations-heading" className="text-base font-semibold">
          Annotations ({requirement.annotations.length})
        </h3>
        {requirement.annotations.length === 0 ? (
          <p className="mt-2 text-sm text-ink-2">No annotations reference this requirement.</p>
        ) : (
          <ul aria-label="Annotations" className="mt-2 grid gap-3">
            {requirement.annotations.map((a) => (
              <li key={`${a.file}:${a.line}`}>
                <p className="text-sm">
                  <span className="font-mono">
                    {a.file}:{a.line}
                  </span>{" "}
                  · {a.type}
                </p>
                <pre className="mt-1 overflow-x-auto rounded-md border border-hairline bg-code-bg p-2 text-xs">
                  <code>{a.snippet}</code>
                </pre>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="detail-tasks-heading" className="rounded-lg border border-hairline bg-surface p-4">
        <h3 id="detail-tasks-heading" className="text-base font-semibold">
          Tasks ({requirement.tasks.length})
        </h3>
        {requirement.tasks.length === 0 ? (
          <p className="mt-2 text-sm text-ink-2">No tasks reference this requirement.</p>
        ) : (
          <table className="mt-2 w-full text-left text-sm">
            <caption className="sr-only">Linked tasks</caption>
            <thead className="text-ink-2">
              <tr>
                {TASK_HEADERS.map((header) => (
                  <th key={header} scope="col" className="px-2 py-2 font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requirement.tasks.map((t) => (
                <tr key={t.id} className="border-t border-grid">
                  <td className="px-2 py-2 font-mono">{t.id}</td>
                  <td className="px-2 py-2">{t.title}</td>
                  <td className="px-2 py-2">{formatTaskStatus(t.status)}</td>
                  <td className="px-2 py-2">
                    {t.assignee ?? (
                      <>
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">Unassigned</span>
                      </>
                    )}
                  </td>
                  <td className="px-2 py-2 tabular-nums text-ink-2">
                    <time dateTime={t.updatedAt}>{formatDate(t.updatedAt)}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </article>
  );
}
