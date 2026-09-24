// @req SCD-API-003
import { z } from "zod";
import { err, ok, type Result } from "./errors";
import {
  AnnotationSchema,
  ApiErrorBodySchema,
  RequirementDetailSchema,
  RequirementSchema,
  ScanStatusSchema,
  StatsSchema,
  TaskSchema,
  type Annotation,
  type AnnotationType,
  type CoverageStatus,
  type Requirement,
  type RequirementDetail,
  type RequirementType,
  type ScanStatus,
  type Stats,
  type Task,
  type TaskStatus,
} from "./schemas";
import type { Transport, TransportRequest, TransportResponse } from "./transport";

export type SortField = "id" | "updatedAt";
export type SortOrder = "asc" | "desc";

export interface RequirementFilters {
  type?: RequirementType;
  status?: CoverageStatus;
  sort?: SortField;
  order?: SortOrder;
}

export interface AnnotationFilters {
  type?: AnnotationType;
  orphans?: boolean;
}

export interface TaskFilters {
  status?: TaskStatus;
  orphans?: boolean;
  sort?: SortField;
  order?: SortOrder;
}

export interface ApiClient {
  getStats(): Promise<Result<Stats>>;
  listRequirements(filters?: RequirementFilters): Promise<Result<Requirement[]>>;
  getRequirement(id: string): Promise<Result<RequirementDetail>>;
  listAnnotations(filters?: AnnotationFilters): Promise<Result<Annotation[]>>;
  listTasks(filters?: TaskFilters): Promise<Result<Task[]>>;
  triggerScan(): Promise<Result<ScanStatus>>;
  getScanStatus(): Promise<Result<ScanStatus>>;
}

function errorMessage(body: unknown): string | undefined {
  const parsed = ApiErrorBodySchema.safeParse(body);
  return parsed.success ? parsed.data.message : undefined;
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map(
    (issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`,
  );
}

async function request<T>(
  transport: Transport,
  req: TransportRequest,
  schema: z.ZodType<T>,
): Promise<Result<T>> {
  let response: TransportResponse;
  try {
    response = await transport.send(req);
  } catch (error) {
    return err({ kind: "network", message: error instanceof Error ? error.message : String(error) });
  }

  const { status, body } = response;
  if (status === 404) {
    return err({ kind: "not_found", message: errorMessage(body) ?? "Resource not found" });
  }
  if (status < 200 || status > 299) {
    return err({ kind: "http", status, message: errorMessage(body) ?? `HTTP ${status}` });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return err({
      kind: "invalid_response",
      message: `Unexpected response from ${req.method} ${req.path}`,
      issues: formatIssues(parsed.error),
    });
  }
  return ok(parsed.data);
}

const flag = (value: boolean | undefined) => (value === undefined ? undefined : String(value));

export function createApiClient(transport: Transport): ApiClient {
  return {
    getStats: () => request(transport, { method: "GET", path: "/stats" }, StatsSchema),

    listRequirements: (filters = {}) =>
      request(
        transport,
        {
          method: "GET",
          path: "/requirements",
          query: { type: filters.type, status: filters.status, sort: filters.sort, order: filters.order },
        },
        z.array(RequirementSchema),
      ),

    getRequirement: async (id) => {
      if (id.trim() === "") return err({ kind: "not_found", message: "Requirement id is empty" });
      return request(
        transport,
        { method: "GET", path: `/requirements/${encodeURIComponent(id)}` },
        RequirementDetailSchema,
      );
    },

    listAnnotations: (filters = {}) =>
      request(
        transport,
        { method: "GET", path: "/annotations", query: { type: filters.type, orphans: flag(filters.orphans) } },
        z.array(AnnotationSchema),
      ),

    listTasks: (filters = {}) =>
      request(
        transport,
        {
          method: "GET",
          path: "/tasks",
          query: {
            status: filters.status,
            orphans: flag(filters.orphans),
            sort: filters.sort,
            order: filters.order,
          },
        },
        z.array(TaskSchema),
      ),

    triggerScan: () => request(transport, { method: "POST", path: "/scan" }, ScanStatusSchema),

    getScanStatus: () => request(transport, { method: "GET", path: "/scan" }, ScanStatusSchema),
  };
}
