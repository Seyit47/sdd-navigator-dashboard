// @req SCD-API-002
// Mock-mode data for tests, loaded through the real client so it is schema-validated.
import { createApiClient } from "@/lib/api/client";
import { mockTransport } from "@/lib/api/mock";
import { dataOf } from "@/lib/api/test-helpers";

const api = createApiClient(mockTransport({ delayMs: 0 }));

export async function loadFixtures() {
  const [stats, requirements, tasks, orphanTasks, orphanAnnotations] = await Promise.all([
    api.getStats(),
    api.listRequirements(),
    api.listTasks(),
    api.listTasks({ orphans: true }),
    api.listAnnotations({ orphans: true }),
  ]);
  return {
    stats: dataOf(stats),
    requirements: dataOf(requirements),
    tasks: dataOf(tasks),
    orphanTasks: dataOf(orphanTasks),
    orphanAnnotations: dataOf(orphanAnnotations),
  };
}

export async function loadRequirement(id: string) {
  return dataOf(await api.getRequirement(id));
}
