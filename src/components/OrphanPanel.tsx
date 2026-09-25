// @req SCD-UI-006, SCD-UI-007, SCD-A11Y-001
import type { Annotation, Task } from "@/lib/api";

export function OrphanPanel({ annotations, tasks }: { annotations: Annotation[]; tasks: Task[] }) {
  const total = annotations.length + tasks.length;
  return (
    <section id="orphans" aria-labelledby="orphans-heading" className="surface-card">
      <details open className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-5">
          <h2 id="orphans-heading" className="text-base font-semibold tracking-tight">
            Orphans
          </h2>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2">{total}</span>
          <span aria-hidden="true" className="ml-auto text-muted transition-transform group-open:rotate-180">
            ⌄
          </span>
        </summary>
        <div className="px-5 pb-5">
          <p className="text-sm text-ink-2">References to requirements that are not in requirements.yaml.</p>
          {total === 0 ? (
            <p className="mt-3 text-sm">No orphans — every reference points to a known requirement.</p>
          ) : (
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-6">
              <OrphanTable
                title={`Annotations (${annotations.length})`}
                headers={["File", "Line", "Unknown reqId", "Type"]}
                rows={annotations.map((a) => ({
                  key: `${a.file}:${a.line}:${a.reqId}`,
                  cells: [a.file, String(a.line), a.reqId, a.type],
                }))}
              />
              <OrphanTable
                title={`Tasks (${tasks.length})`}
                headers={["Task", "Title", "Unknown requirementId"]}
                rows={tasks.map((t) => ({ key: t.id, cells: [t.id, t.title, t.requirementId] }))}
              />
            </div>
          )}
        </div>
      </details>
    </section>
  );
}

function OrphanTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: { key: string; cells: string[] }[];
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm text-ink-2">None.</p>
      ) : (
        <div className="relative mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="text-xs text-muted">
                {headers.map((header) => (
                  <th key={header} scope="col" className="px-3 py-2 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-hairline">
                  {row.cells.map((cell, index) => (
                    <td key={headers[index]} className={`px-3 py-2.5 ${index === 0 ? "font-mono" : ""}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
