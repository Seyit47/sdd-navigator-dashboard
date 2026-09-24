// @req SCD-API-002
import { describe, expect, it } from "vitest";
import { z } from "zod";
import annotations from "../../../data/annotations.json";
import requirements from "../../../data/requirements.json";
import scan from "../../../data/scan.json";
import stats from "../../../data/stats.json";
import tasks from "../../../data/tasks.json";
import {
  AnnotationSchema,
  RequirementSchema,
  ScanStatusSchema,
  StatsSchema,
  TaskSchema,
} from "./schemas";

const conformance: Array<[string, z.ZodType, unknown]> = [
  ["stats.json", StatsSchema, stats],
  ["requirements.json", z.array(RequirementSchema), requirements],
  ["annotations.json", z.array(AnnotationSchema), annotations],
  ["tasks.json", z.array(TaskSchema), tasks],
  ["scan.json", ScanStatusSchema, scan],
];

describe("mock fixtures conform to the API schema", () => {
  it.each(conformance)("%s", (_name, schema, data) => {
    const result = schema.safeParse(data);
    expect(result.success ? [] : result.error.issues).toEqual([]);
  });
});

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const k = key(item);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

describe("stats.json agrees with the other fixtures", () => {
  const requirementIds = new Set(requirements.map((r) => r.id));

  it("matches the requirement counts", () => {
    expect(stats.requirements.total).toBe(requirements.length);
    expect(stats.requirements.byType).toEqual(countBy(requirements, (r) => r.type));
    expect(stats.requirements.byStatus).toEqual(countBy(requirements, (r) => r.status));
  });

  it("computes coverage as covered / total × 100", () => {
    const covered = requirements.filter((r) => r.status === "covered").length;
    expect(stats.coverage).toBeCloseTo((covered / requirements.length) * 100);
  });

  it("matches the annotation counts", () => {
    expect(stats.annotations).toEqual({
      total: annotations.length,
      impl: annotations.filter((a) => a.type === "impl").length,
      test: annotations.filter((a) => a.type === "test").length,
      orphans: annotations.filter((a) => !requirementIds.has(a.reqId)).length,
    });
  });

  it("matches the task counts", () => {
    expect(stats.tasks).toEqual({
      total: tasks.length,
      byStatus: countBy(tasks, (t) => t.status),
      orphans: tasks.filter((t) => !requirementIds.has(t.requirementId)).length,
    });
  });

  it.each(requirements.map((r) => [r.id, r] as const))(
    "%s has the status its annotations imply",
    (_id, requirement) => {
      const kinds = new Set(
        annotations.filter((a) => a.reqId === requirement.id).map((a) => a.type),
      );
      const expected =
        kinds.has("impl") && kinds.has("test") ? "covered" : kinds.has("impl") ? "partial" : "missing";
      expect(requirement.status).toBe(expected);
    },
  );

  it("matches the step-2 figures", () => {
    expect(stats).toMatchObject({
      coverage: 62.5,
      requirements: { total: 8, byType: { FR: 6, AR: 2 }, byStatus: { covered: 5, partial: 1, missing: 2 } },
      annotations: { total: 16, impl: 10, test: 6, orphans: 2 },
      tasks: { total: 6, byStatus: { done: 2, in_progress: 1, open: 3 }, orphans: 1 },
    });
  });
});
