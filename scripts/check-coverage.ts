// @req SCD-VAL-001
// Self-validation: compares requirements.yaml with the @req annotations in the source tree.
// Usage: node scripts/check-coverage.ts [--root <dir>] [--tasks <file.json>] [--strict]
// Exit codes: 0 = every requirement implemented, 1 = some requirement missing (with --strict also:
// partially covered, or orphan annotations/tasks), 2 = unreadable input.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { extractAnnotations } from "./coverage/annotations.ts";
import { computeCoverage } from "./coverage/compute.ts";
import { parseRequirements, parseTasks } from "./coverage/parse.ts";
import { formatReport } from "./coverage/report.ts";
import type { FoundAnnotation, TaskEntry } from "./coverage/types.ts";

const USAGE = "usage: node scripts/check-coverage.ts [--root <dir>] [--tasks <file.json>] [--strict]";
const SOURCE_DIRS = ["src", "scripts", ".husky", ".github"];
const SKIP_DIRS = new Set(["node_modules", ".next", "_"]);
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|css|ya?ml)$/;
const ROOT_CONFIG = /\.config\.[cm]?[jt]s$/;

function walk(dir: string, acceptEveryFile: boolean, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(path, acceptEveryFile, out);
    } else if (acceptEveryFile || SOURCE_FILE.test(name)) {
      out.push(path);
    }
  }
}

function collectSourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const dir of SOURCE_DIRS) {
    const path = join(root, dir);
    // Hook files have no extension, so every file under .husky counts.
    if (existsSync(path)) walk(path, dir === ".husky", files);
  }
  for (const name of readdirSync(root)) {
    if (ROOT_CONFIG.test(name)) files.push(join(root, name));
  }
  return files.sort();
}

function fail(message: string): number {
  console.error(`check-coverage: ${message}`);
  return 2;
}

function main(argv: string[]): number {
  let values: { root?: string; tasks?: string; strict?: boolean };
  try {
    ({ values } = parseArgs({ args: argv, options: { root: { type: "string" }, tasks: { type: "string" }, strict: { type: "boolean" } } }));
  } catch (error) {
    return fail(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
  }

  const root = resolve(values.root ?? process.cwd());
  const requirementsPath = join(root, "requirements.yaml");
  if (!existsSync(requirementsPath)) return fail(`${requirementsPath} not found`);
  const requirements = parseRequirements(readFileSync(requirementsPath, "utf8"));
  if (!requirements.ok) return fail(`requirements.yaml: ${requirements.error}`);

  let tasks: TaskEntry[] = [];
  if (values.tasks !== undefined) {
    const tasksPath = resolve(root, values.tasks);
    if (!existsSync(tasksPath)) return fail(`${tasksPath} not found`);
    const parsed = parseTasks(readFileSync(tasksPath, "utf8"));
    if (!parsed.ok) return fail(`${values.tasks}: ${parsed.error}`);
    tasks = parsed.data;
  }

  const annotations: FoundAnnotation[] = collectSourceFiles(root).flatMap((file) =>
    extractAnnotations(relative(root, file).split(sep).join("/"), readFileSync(file, "utf8")),
  );
  const result = computeCoverage(requirements.data, annotations, tasks);
  console.log(formatReport(result));

  const missing = result.requirements.filter((r) => r.status === "missing");
  if (missing.length > 0) {
    console.error(
      `\ncheck-coverage: ${missing.length} requirement(s) not implemented: ${missing.map((r) => r.id).join(", ")}`,
    );
    return 1;
  }
  if (values.strict) {
    const partial = result.requirements.filter((r) => r.status === "partial");
    const problems = [
      partial.length > 0 ? `${partial.length} requirement(s) not fully covered: ${partial.map((r) => r.id).join(", ")}` : "",
      result.orphanAnnotations.length > 0 ? `${result.orphanAnnotations.length} orphan annotation(s)` : "",
      result.orphanTasks.length > 0 ? `${result.orphanTasks.length} orphan task(s)` : "",
    ].filter(Boolean);
    if (problems.length > 0) {
      console.error(`\ncheck-coverage --strict: ${problems.join("; ")}`);
      return 1;
    }
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
