// @req SCD-API-003
// Zod mirrors of the SDD Navigator OpenAPI v3.0.0 schemas
// (docs/api/sdd-coverage-api.yaml, from https://api.pdd.foreachpartners.com/spec/sdd-coverage-api.yaml).
// Types are inferred from these schemas; do not declare them separately.
import { z } from "zod";

export const RequirementTypeSchema = z.enum(["FR", "AR"]);
export const CoverageStatusSchema = z.enum(["covered", "partial", "missing"]);
export const AnnotationTypeSchema = z.enum(["impl", "test"]);
export const TaskStatusSchema = z.enum(["open", "in_progress", "done"]);
export const ScanStateSchema = z.enum(["idle", "scanning", "completed", "failed"]);

const timestamp = z.iso.datetime({ offset: true });
const count = z.number().int().nonnegative();

export const RequirementStatsSchema = z.object({
  total: count,
  byType: z.record(z.string(), count),
  byStatus: z.record(z.string(), count),
});

export const AnnotationStatsSchema = z.object({
  total: count,
  impl: count,
  test: count,
  orphans: count,
});

export const TaskStatsSchema = z.object({
  total: count,
  byStatus: z.record(z.string(), count),
  orphans: count,
});

export const StatsSchema = z.object({
  requirements: RequirementStatsSchema,
  annotations: AnnotationStatsSchema,
  tasks: TaskStatsSchema,
  coverage: z.number().min(0).max(100),
  lastScanAt: timestamp,
});

export const RequirementSchema = z.object({
  id: z.string().min(1),
  type: RequirementTypeSchema,
  title: z.string(),
  description: z.string(),
  status: CoverageStatusSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const AnnotationSchema = z.object({
  file: z.string(),
  line: z.number().int().positive(),
  reqId: z.string(),
  type: AnnotationTypeSchema,
  snippet: z.string(),
});

export const TaskSchema = z.object({
  id: z.string().min(1),
  requirementId: z.string(),
  title: z.string(),
  status: TaskStatusSchema,
  assignee: z.string().optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const RequirementDetailSchema = RequirementSchema.extend({
  annotations: z.array(AnnotationSchema),
  tasks: z.array(TaskSchema),
});

export const ScanStatusSchema = z.object({
  status: ScanStateSchema,
  startedAt: timestamp,
  completedAt: timestamp.optional(),
  duration: count.optional(),
});

export const ApiErrorBodySchema = z.object({
  error: z.string(),
  message: z.string(),
});

export type RequirementType = z.infer<typeof RequirementTypeSchema>;
export type CoverageStatus = z.infer<typeof CoverageStatusSchema>;
export type AnnotationType = z.infer<typeof AnnotationTypeSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type ScanState = z.infer<typeof ScanStateSchema>;
export type RequirementStats = z.infer<typeof RequirementStatsSchema>;
export type AnnotationStats = z.infer<typeof AnnotationStatsSchema>;
export type TaskStats = z.infer<typeof TaskStatsSchema>;
export type Stats = z.infer<typeof StatsSchema>;
export type Requirement = z.infer<typeof RequirementSchema>;
export type RequirementDetail = z.infer<typeof RequirementDetailSchema>;
export type Annotation = z.infer<typeof AnnotationSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type ScanStatus = z.infer<typeof ScanStatusSchema>;
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
