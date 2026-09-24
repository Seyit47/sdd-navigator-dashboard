// @req SCD-UI-001, SCD-UI-003, SCD-UI-005, SCD-UI-006, SCD-STATE-002
import { connection } from "next/server";
import { Suspense } from "react";
import { ErrorPanel } from "@/components/ErrorPanel";
import { OrphanPanel } from "@/components/OrphanPanel";
import { RequirementsTable } from "@/components/RequirementsTable";
import { SummaryPanel } from "@/components/summary/SummaryPanel";
import { TasksPanel } from "@/components/TasksPanel";
import { getStats, listAnnotations, listRequirements, listTasks, type ApiError, type Result } from "@/lib/api";

function firstError(...results: Result<unknown>[]): ApiError | null {
  for (const result of results) if (!result.ok) return result.error;
  return null;
}

export default async function DashboardPage() {
  // Render per request: never prerender build-time API data.
  await connection();
  const [stats, requirements, tasks, orphanTasks, orphanAnnotations] = await Promise.all([
    getStats(),
    listRequirements(),
    listTasks(),
    listTasks({ orphans: true }),
    listAnnotations({ orphans: true }),
  ]);
  const tasksError = firstError(tasks, orphanTasks);
  const orphansError = firstError(orphanAnnotations, orphanTasks);

  return (
    <div className="grid gap-6">
      {stats.ok ? <SummaryPanel stats={stats.data} /> : <ErrorPanel title="Couldn't load project stats" error={stats.error} />}

      <Suspense fallback={null}>
        {requirements.ok ? (
          <RequirementsTable requirements={requirements.data} />
        ) : (
          <ErrorPanel title="Couldn't load requirements" error={requirements.error} />
        )}
      </Suspense>

      <Suspense fallback={null}>
        {tasksError ? (
          <ErrorPanel title="Couldn't load tasks" error={tasksError} />
        ) : tasks.ok && orphanTasks.ok ? (
          <TasksPanel tasks={tasks.data} orphanTaskIds={orphanTasks.data.map((t) => t.id)} />
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
