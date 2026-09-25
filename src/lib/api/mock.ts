// @req SCD-API-001, SCD-API-002
// In-process implementation of the SDD Navigator API over data/*.json. Returns raw
// JSON exactly as the live API would, so responses go through the same validation.
import annotationsData from "../../../data/annotations.json";
import requirementsData from "../../../data/requirements.json";
import scanData from "../../../data/scan.json";
import statsData from "../../../data/stats.json";
import tasksData from "../../../data/tasks.json";
import { compareAnnotations, compareRows } from "./sort";
import type { Transport, TransportRequest, TransportResponse } from "./transport";

const MOCK_DELAY_MS = 300;
export const MOCK_SCAN_DURATION_MS = 1500;

interface MockOptions {
  /** Artificial latency per response so loading states are visible. */
  delayMs?: number;
  /** Clock used for the scan lifecycle. */
  now?: () => number;
}

interface ScanRecord {
  status: string;
  startedAt: string;
  completedAt?: string;
  duration?: number;
}

function sortRows<T extends { id: string; updatedAt: string }>(
  rows: readonly T[],
  sort: string | undefined,
  order: string | undefined,
): T[] {
  return [...rows].sort(compareRows({ sort: sort === "updatedAt" ? "updatedAt" : "id", order: order === "desc" ? "desc" : "asc" }));
}

const sortedAnnotations = [...annotationsData].sort(compareAnnotations);
const requirementIds = new Set(requirementsData.map((r) => r.id));

const respond = (status: number, body: unknown): TransportResponse => ({ status, body });
const notFound = (message: string) => respond(404, { error: "not_found", message });

export function mockTransport({ delayMs = MOCK_DELAY_MS, now = Date.now }: MockOptions = {}): Transport {
  let scan: ScanRecord = { ...scanData };

  function currentScan(): ScanRecord {
    const startedAt = Date.parse(scan.startedAt);
    if (scan.status === "scanning" && now() - startedAt >= MOCK_SCAN_DURATION_MS) {
      scan = {
        status: "completed",
        startedAt: scan.startedAt,
        completedAt: new Date(startedAt + MOCK_SCAN_DURATION_MS).toISOString(),
        duration: MOCK_SCAN_DURATION_MS,
      };
    }
    return scan;
  }

  function route({ method, path, query = {} }: TransportRequest): TransportResponse {
    if (method === "GET" && path === "/stats") return respond(200, statsData);

    if (method === "GET" && path === "/requirements") {
      const rows = requirementsData.filter(
        (r) => (!query.type || r.type === query.type) && (!query.status || r.status === query.status),
      );
      return respond(200, sortRows(rows, query.sort, query.order));
    }

    const detail = method === "GET" ? /^\/requirements\/([^/]+)$/.exec(path) : null;
    if (detail) {
      const id = decodeURIComponent(detail[1]);
      const requirement = requirementsData.find((r) => r.id === id);
      if (!requirement) return notFound(`Requirement '${id}' not found`);
      return respond(200, {
        ...requirement,
        annotations: sortedAnnotations.filter((a) => a.reqId === id),
        tasks: sortRows(
          tasksData.filter((t) => t.requirementId === id),
          undefined,
          undefined,
        ),
      });
    }

    if (method === "GET" && path === "/annotations") {
      const rows = sortedAnnotations.filter(
        (a) =>
          (!query.type || a.type === query.type) &&
          (query.orphans !== "true" || !requirementIds.has(a.reqId)),
      );
      return respond(200, rows);
    }

    if (method === "GET" && path === "/tasks") {
      const rows = tasksData.filter(
        (t) =>
          (!query.status || t.status === query.status) &&
          (query.orphans !== "true" || !requirementIds.has(t.requirementId)),
      );
      return respond(200, sortRows(rows, query.sort, query.order));
    }

    if (path === "/scan") {
      if (method === "POST") {
        if (currentScan().status !== "scanning") {
          scan = { status: "scanning", startedAt: new Date(now()).toISOString() };
        }
        return respond(202, scan);
      }
      return respond(200, currentScan());
    }

    return notFound(`No mock route for ${method} ${path}`);
  }

  return {
    async send(request) {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return route(request);
    },
  };
}
