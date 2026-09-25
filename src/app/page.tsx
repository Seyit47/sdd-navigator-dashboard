// @req SCD-UI-001, SCD-UI-003, SCD-UI-005, SCD-UI-006, SCD-FLT-001, SCD-FLT-003, SCD-STATE-002
import { connection } from "next/server";
import { Suspense } from "react";
import { ErrorPanel } from "@/components/ErrorPanel";
import { OrphanPanel } from "@/components/OrphanPanel";
import { RequirementsTable } from "@/components/RequirementsTable";
import { SummaryPanel } from "@/components/summary/SummaryPanel";
import { TasksPanel } from "@/components/TasksPanel";
import { getStats, listAnnotations, listTasks, type ApiError, type Result } from "@/lib/api";
import { fetchRequirements, fetchTasks } from "@/lib/dashboard/fetch";
import { parseDashboardQuery, searchParamsFromRecord } from "@/lib/dashboard/query";

function firstError(...results: Result<unknown>[]): ApiError | null {
  for (const result of results) if (!result.ok) return result.error;
  return null;
}

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  // Render per request: filters come from the URL and go to the data source.
  await connection();
  const query = parseDashboardQuery(searchParamsFromRecord(await searchParams));
  const [stats, requirements, tasks, orphanTasks, orphanAnnotations] = await Promise.all([
    getStats(),
    fetchRequirements(query),
    fetchTasks(query),
    listTasks({ orphans: true }),
    listAnnotations({ orphans: true }),
  ]);
  const tasksError = firstError(tasks, orphanTasks);
  const orphansError = firstError(orphanAnnotations, orphanTasks);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {stats.ok ? <SummaryPanel stats={stats.data} /> : <ErrorPanel title="Couldn't load project stats" error={stats.error} />}

      <Suspense fallback={null}>
        {requirements.ok ? (
          <RequirementsTable
            requirements={requirements.data}
            total={stats.ok ? stats.data.requirements.total : requirements.data.length}
          />
        ) : (
          <ErrorPanel title="Couldn't load requirements" error={requirements.error} />
        )}
      </Suspense>

      <Suspense fallback={null}>
        {tasksError ? (
          <ErrorPanel title="Couldn't load tasks" error={tasksError} />
        ) : tasks.ok && orphanTasks.ok ? (
          <TasksPanel
            tasks={tasks.data}
            total={stats.ok ? stats.data.tasks.total : tasks.data.length}
            orphanTaskIds={orphanTasks.data.map((t) => t.id)}
          />
        ) : null}
      </Suspense>

      {orphansError ? (
        <ErrorPanel title="Couldn't load orphans" error={orphansError} />
      ) : orphanAnnotations.ok && orphanTasks.ok ? (
        <OrphanPanel annotations={orphanAnnotations.data} tasks={orphanTasks.data} />
      ) : null}
    </div>
  );
}
