// @req SCD-VAL-001
import { parse as parseYaml } from "yaml";
import type { Parsed, RequirementEntry, TaskEntry } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function parseRequirements(text: string): Parsed<RequirementEntry[]> {
  if (text.trim() === "") return { ok: false, error: "requirements file is empty" };
  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch (error) {
    return { ok: false, error: `invalid YAML: ${message(error)}` };
  }
  if (!Array.isArray(doc)) return { ok: false, error: "requirements file must be a YAML list of requirements" };

  const entries: RequirementEntry[] = [];
  const seen = new Set<string>();
  for (const [index, item] of doc.entries()) {
    if (!isRecord(item) || typeof item.id !== "string" || item.id.trim() === "" || typeof item.title !== "string") {
      return { ok: false, error: `entry ${index + 1} must have string "id" and "title"` };
    }
    if (seen.has(item.id)) return { ok: false, error: `duplicate requirement id ${item.id}` };
    seen.add(item.id);
    entries.push({ id: item.id, title: item.title });
  }
  return { ok: true, value: entries };
}

export function parseTasks(text: string): Parsed<TaskEntry[]> {
  if (text.trim() === "") return { ok: false, error: "tasks file is empty" };
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `invalid JSON: ${message(error)}` };
  }
  if (!Array.isArray(doc)) return { ok: false, error: "tasks file must be a JSON array" };

  const tasks: TaskEntry[] = [];
  for (const [index, item] of doc.entries()) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.requirementId !== "string" ||
      typeof item.title !== "string"
    ) {
      return { ok: false, error: `task ${index + 1} must have string "id", "requirementId" and "title"` };
    }
    tasks.push({ id: item.id, requirementId: item.requirementId, title: item.title });
  }
  return { ok: true, value: tasks };
}
