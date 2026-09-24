# Dashboard, Tests and Self-Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the coverage dashboard UI (summary, requirements table, detail page, tasks, orphans, theme), its test suite, and a self-validation script plus CI that enforce that every requirement in `requirements.yaml` is implemented.

**Architecture:** Server components fetch through the existing `@/lib/api` data layer; client components filter and sort the loaded rows in memory and keep the view in the URL via a small `useDashboardQuery` hook over pure functions in `src/lib/dashboard/`. All colours are CSS tokens in `globals.css`. A Node-run TypeScript script (`scripts/check-coverage.ts`, pure logic in `scripts/coverage/`) parses `requirements.yaml`, scans the source tree for `@req` annotations and gates CI through `pnpm validate`.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript 5 strict, Tailwind CSS 4, Zod 4, Vitest 5, React Testing Library 16 + jsdom 30, axe-core 4, `yaml` 2, Node 24, pnpm 12.

**Spec:** `docs/superpowers/specs/2026-09-25-dashboard-design.md` (data layer: `docs/superpowers/specs/2026-09-25-data-layer-design.md`).

## Global Constraints

- TypeScript strict; no `any` (explicit or `as any`) anywhere, including tests.
- New dev dependencies, exactly: `yaml@^2.9.1`, `@testing-library/react@^16.3.3`, `@testing-library/dom@^10.4.2`, `@testing-library/user-event@^14.6.7`, `@testing-library/jest-dom@^7.0.1`, `jsdom@^30.1.1`, `axe-core@^4.13.0`. No other packages.
- Every source and test file carries a `// @req SCD-…` comment (`# @req` in shell hooks, `/* @req */` in CSS). In jsdom test files the first line is `// @vitest-environment jsdom` and the `@req` comment follows it. In client components the first line is `"use client";` and the `@req` comment follows it.
- Test code that needs annotation text builds it at runtime (`const TAG = "@" + "req";`) so the coverage scanner never counts it.
- Components never hard-code colours: use the Tailwind utilities mapped from tokens (`bg-surface`, `text-ink-2`, …) or `var(--token)` in inline styles. A test enforces this for `src/components/`.
- Dates are rendered only through `src/lib/dashboard/format.ts` (`en-GB`, `timeZone: "UTC"`).
- URL params: `q`, `type` (repeatable), `status` (repeatable), `sort` (`id`|`updatedAt`, default `id`), `order` (`asc`|`desc`, default `asc`), `taskStatus` (repeatable). Defaults are omitted; invalid values are ignored; updates use `router.replace(href, { scroll: false })`.
- Coverage-script exit codes: `0` no missing requirement, `1` some requirement missing, `2` unreadable input.
- Work on branch `feat/dashboard`. Conventional Commit messages ending with the `Co-Authored-By` line. Never `--no-verify`.
- Package registry access is intermittent: run `pnpm add` with `timeout 200` and retry once if it hangs.
- `pnpm typecheck` is `next typegen && tsc --noEmit` from Task 2 on, so Next's route types exist before type checking.

## Review Focus

1. **Search text with regex characters or stray spaces** — `(10 req/min)` or `"  scan "` must match literally after trimming, never throw. Pinned in Task 3 (`treats regex characters literally`, `trims the search text`) and Task 6 (`searches id and title`).
2. **Hand-edited or stale URLs** — lower-case `type=fr`, unknown statuses, `sort=title`, repeated `sort` must fall back to defaults and show the full list. Pinned in Task 3 (`drops unknown values…`, `takes the first sort param`) and Task 6 (`ignores invalid query values`).
3. **Stats with zero totals or missing keys** — an empty project must render `0 of 0 (0%)`, `FR 0 · AR 0`, no `NaN`, no warning. Pinned in Task 5 (`renders an empty project without NaN`).
4. **Annotation syntax edge cases** — trailing commas, lower-case ids, `@request`, CRLF files, `#` and `/* */` comments must be parsed precisely. Pinned in Task 1 (`extractAnnotations` tests).
5. **Detail page opened with unknown query params** — the back link must keep only recognised filters. Pinned in Task 8 (`keeps only recognised filters in the back link`).

---

### Task 1: Coverage analysis core

**Files:**
- Modify: `package.json` (dev dependency `yaml`)
- Modify: `tsconfig.json` (add `"allowImportingTsExtensions": true`)
- Modify: `vitest.config.mts` (test include globs)
- Create: `scripts/coverage/types.ts`, `scripts/coverage/parse.ts`, `scripts/coverage/annotations.ts`, `scripts/coverage/compute.ts`, `scripts/coverage/report.ts`
- Test: `scripts/coverage/coverage.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (reads `requirements.yaml` and `data/tasks.json` in tests).
- Produces:
  - `types.ts`: `RequirementEntry { id; title }`, `TaskEntry { id; requirementId; title }`, `AnnotationKind = "impl" | "test"`, `FoundAnnotation { file; line; reqId; kind }`, `CoverageState = "covered" | "partial" | "missing"`, `RequirementCoverage { id; title; status; impl; test }`, `CoverageResult { requirements; counts; coverage; orphanAnnotations; orphanTasks }`, `Parsed<T> = { ok: true; value: T } | { ok: false; error: string }`.
  - `parse.ts`: `parseRequirements(text: string): Parsed<RequirementEntry[]>`, `parseTasks(text: string): Parsed<TaskEntry[]>`.
  - `annotations.ts`: `classifyFile(path: string): AnnotationKind`, `extractAnnotations(path: string, text: string): FoundAnnotation[]`.
  - `compute.ts`: `computeCoverage(requirements: RequirementEntry[], annotations: FoundAnnotation[], tasks?: TaskEntry[]): CoverageResult`.
  - `report.ts`: `formatReport(result: CoverageResult): string`.
  - Scripts import each other with explicit `.ts` extensions (Node type stripping requires it).

- [ ] **Step 1: Install `yaml` and allow `.ts` import extensions**

```bash
timeout 200 pnpm add -D yaml@^2.9.1
```

In `tsconfig.json`, add after `"noEmit": true,`:

```json
    "allowImportingTsExtensions": true,
```

In `vitest.config.mts`, replace the `include` line with:

```ts
    include: contract ? ["src/**/*.contract.ts"] : ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
```

- [ ] **Step 2: Write the types — `scripts/coverage/types.ts`**

```ts
// @req SCD-VAL-001
export interface RequirementEntry {
  id: string;
  title: string;
}

export interface TaskEntry {
  id: string;
  requirementId: string;
  title: string;
}

export type AnnotationKind = "impl" | "test";

export interface FoundAnnotation {
  file: string;
  line: number;
  reqId: string;
  kind: AnnotationKind;
}

export type CoverageState = "covered" | "partial" | "missing";

export interface RequirementCoverage {
  id: string;
  title: string;
  status: CoverageState;
  impl: number;
  test: number;
}

export interface CoverageResult {
  requirements: RequirementCoverage[];
  counts: Record<CoverageState, number>;
  /** covered / total × 100 with one decimal; 0 when there are no requirements. */
  coverage: number;
  orphanAnnotations: FoundAnnotation[];
  orphanTasks: TaskEntry[];
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
```

- [ ] **Step 3: Write the failing tests — `scripts/coverage/coverage.test.ts`**

```ts
// @req SCD-VAL-001
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyFile, extractAnnotations } from "./annotations.ts";
import { computeCoverage } from "./compute.ts";
import { parseRequirements, parseTasks } from "./parse.ts";
import { formatReport } from "./report.ts";
import type { AnnotationKind, FoundAnnotation, RequirementEntry, TaskEntry } from "./types.ts";

// Built at runtime so this file never contains an annotation the scanner would count.
const TAG = "@" + "req";

const requirements: RequirementEntry[] = [
  { id: "FR-A-001", title: "First" },
  { id: "FR-A-002", title: "Second" },
  { id: "AR-B-001", title: "Third" },
];

function annotation(reqId: string, kind: AnnotationKind): FoundAnnotation {
  return { file: kind === "test" ? "src/a.test.ts" : "src/a.ts", line: 1, reqId, kind };
}

describe("parseRequirements", () => {
  it("parses id and title, ignoring other fields", () => {
    const text = "- id: FR-A-001\n  type: FR\n  title: First\n  description: >-\n    MUST do it.\n";
    expect(parseRequirements(text)).toEqual({ ok: true, value: [{ id: "FR-A-001", title: "First" }] });
  });

  it("parses this repository's requirements.yaml", () => {
    const result = parseRequirements(readFileSync("requirements.yaml", "utf8"));
    expect(result.ok && result.value.length).toBeGreaterThanOrEqual(19);
    expect(result.ok && result.value[0].id).toBe("SCD-API-001");
  });

  it.each(["", "   \n"])("rejects an empty file %j", (text) => {
    expect(parseRequirements(text)).toEqual({ ok: false, error: "requirements file is empty" });
  });

  it("rejects a file with only comments", () => {
    expect(parseRequirements("# nothing here\n")).toEqual({
      ok: false,
      error: "requirements file must be a YAML list of requirements",
    });
  });

  it("rejects a mapping instead of a list", () => {
    expect(parseRequirements("id: FR-A-001\ntitle: First\n")).toEqual({
      ok: false,
      error: "requirements file must be a YAML list of requirements",
    });
  });

  it("reports malformed YAML", () => {
    const result = parseRequirements("- id: FR-A-001\n  title: [unclosed\n");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/^invalid YAML: /);
  });

  it("rejects entries without a string id and title", () => {
    expect(parseRequirements("- id: FR-A-001\n  title: First\n- id: FR-A-002\n")).toEqual({
      ok: false,
      error: 'entry 2 must have string "id" and "title"',
    });
  });

  it("rejects duplicate ids", () => {
    expect(parseRequirements("- id: FR-A-001\n  title: One\n- id: FR-A-001\n  title: Two\n")).toEqual({
      ok: false,
      error: "duplicate requirement id FR-A-001",
    });
  });
});

describe("parseTasks", () => {
  it("parses tasks, ignoring extra fields", () => {
    const result = parseTasks(readFileSync("data/tasks.json", "utf8"));
    expect(result.ok && result.value).toHaveLength(6);
    expect(result.ok && result.value[5]).toEqual({ id: "TASK-006", requirementId: "FR-EXPORT-001", title: "Add CSV export" });
  });

  it("rejects an empty file", () => {
    expect(parseTasks("  ")).toEqual({ ok: false, error: "tasks file is empty" });
  });

  it("reports malformed JSON", () => {
    const result = parseTasks('[{"id": "TASK-1",');
    expect(!result.ok && result.error).toMatch(/^invalid JSON: /);
  });

  it("rejects a non-array document", () => {
    expect(parseTasks("{}")).toEqual({ ok: false, error: "tasks file must be a JSON array" });
  });

  it("rejects tasks without a requirementId", () => {
    expect(parseTasks('[{"id": "TASK-1", "title": "No link"}]')).toEqual({
      ok: false,
      error: 'task 1 must have string "id", "requirementId" and "title"',
    });
  });
});

describe("classifyFile", () => {
  it.each([
    ["src/a.test.ts", "test"],
    ["src/components/table.test.tsx", "test"],
    ["src/lib/api/live.contract.ts", "test"],
    ["src/lib/api/test-helpers.ts", "impl"],
    [".husky/pre-push", "impl"],
  ] as const)("%s is %s", (path, kind) => {
    expect(classifyFile(path)).toBe(kind);
  });
});

describe("extractAnnotations", () => {
  it("finds a single annotation with its line number", () => {
    expect(extractAnnotations("src/a.ts", `import x from "y";\n// ${TAG} FR-A-001\n`)).toEqual([
      { file: "src/a.ts", line: 2, reqId: "FR-A-001", kind: "impl" },
    ]);
  });

  it("splits comma-separated ids", () => {
    expect(extractAnnotations("src/a.test.ts", `// ${TAG} FR-A-001, AR-B-001`).map((a) => [a.reqId, a.kind])).toEqual([
      ["FR-A-001", "test"],
      ["AR-B-001", "test"],
    ]);
  });

  it("counts lines in CRLF files", () => {
    expect(extractAnnotations("src/a.ts", `a\r\nb\r\n// ${TAG} FR-A-002\r\n`)[0].line).toBe(3);
  });

  it("reads shell and CSS comments", () => {
    const found = extractAnnotations("x", `# ${TAG} FR-A-001\n/* ${TAG} FR-A-002 */`);
    expect(found.map((a) => a.reqId)).toEqual(["FR-A-001", "FR-A-002"]);
  });

  it("ignores a trailing comma", () => {
    expect(extractAnnotations("src/a.ts", `// ${TAG} FR-A-001,`).map((a) => a.reqId)).toEqual(["FR-A-001"]);
  });

  it("ignores text that is not an annotation", () => {
    const text = [`// ${TAG}uest FR-A-001`, `// ${TAG} fr-a-001`, `// ${TAG}`, "// FR-A-001 without a tag"].join("\n");
    expect(extractAnnotations("src/a.ts", text)).toEqual([]);
  });
});

describe("computeCoverage", () => {
  it("reports 0% when nothing is annotated", () => {
    const result = computeCoverage(requirements, []);
    expect(result.coverage).toBe(0);
    expect(result.counts).toEqual({ covered: 0, partial: 0, missing: 3 });
  });

  it("reports 100% when every requirement has impl and test annotations", () => {
    const all = requirements.flatMap((r) => [annotation(r.id, "impl"), annotation(r.id, "test")]);
    const result = computeCoverage(requirements, all);
    expect(result.coverage).toBe(100);
    expect(result.requirements.every((r) => r.status === "covered")).toBe(true);
  });

  it("classifies partial coverage: impl only is partial, test only is missing", () => {
    const result = computeCoverage(requirements, [
      annotation("FR-A-001", "impl"),
      annotation("FR-A-001", "test"),
      annotation("FR-A-002", "impl"),
      annotation("AR-B-001", "test"),
    ]);
    expect(result.requirements.map((r) => [r.id, r.status])).toEqual([
      ["FR-A-001", "covered"],
      ["FR-A-002", "partial"],
      ["AR-B-001", "missing"],
    ]);
    expect(result.coverage).toBe(33.3);
  });

  it("counts every annotation per requirement", () => {
    const result = computeCoverage(requirements, [
      annotation("FR-A-001", "impl"),
      annotation("FR-A-001", "impl"),
      annotation("FR-A-001", "test"),
    ]);
    expect(result.requirements[0]).toMatchObject({ impl: 2, test: 1 });
  });

  it("handles an empty requirement list", () => {
    const result = computeCoverage([], [annotation("FR-A-001", "impl")]);
    expect(result.coverage).toBe(0);
    expect(result.counts).toEqual({ covered: 0, partial: 0, missing: 0 });
  });

  it("reports orphan annotations without counting them", () => {
    const orphan = annotation("FR-Z-999", "impl");
    const result = computeCoverage(requirements, [orphan]);
    expect(result.orphanAnnotations).toEqual([orphan]);
    expect(result.counts.missing).toBe(3);
  });

  it("reports orphan tasks", () => {
    const tasks: TaskEntry[] = [
      { id: "TASK-1", requirementId: "FR-A-001", title: "Linked" },
      { id: "TASK-2", requirementId: "FR-Z-999", title: "Orphan" },
    ];
    expect(computeCoverage(requirements, [], tasks).orphanTasks).toEqual([tasks[1]]);
  });
});

describe("formatReport", () => {
  it("prints rows, orphans and the summary line", () => {
    const report = formatReport(
      computeCoverage(
        requirements,
        [annotation("FR-A-001", "impl"), annotation("FR-A-001", "test"), annotation("FR-A-002", "impl"), annotation("FR-Z-999", "impl")],
        [{ id: "TASK-2", requirementId: "FR-Z-998", title: "Orphan task" }],
      ),
    );
    expect(report).toContain("FR-A-001  covered      1     1  First");
    expect(report).toContain("AR-B-001  missing      0     0  Third");
    expect(report).toContain("Orphan annotations (1):\n  src/a.ts:1  FR-Z-999 (impl)");
    expect(report).toContain("Orphan tasks (1):\n  TASK-2  FR-Z-998  Orphan task");
    expect(report).toContain("Coverage: 33.3% (1/3 covered, 1 partial, 1 missing)");
  });

  it("omits orphan sections when there are none", () => {
    const report = formatReport(computeCoverage(requirements, []));
    expect(report).not.toContain("Orphan");
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm test scripts/coverage`
Expected: FAIL — `Cannot find module './annotations.ts'`.

- [ ] **Step 5: Write `scripts/coverage/parse.ts`**

```ts
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
```

- [ ] **Step 6: Write `scripts/coverage/annotations.ts`**

```ts
// @req SCD-VAL-001
import type { AnnotationKind, FoundAnnotation } from "./types.ts";

const ID = "[A-Z]+-[A-Z0-9]+-\\d{3}";
// The tag, whitespace, then one or more comma-separated requirement ids.
const ANNOTATION = new RegExp(`@req\\s+(${ID}(?:\\s*,\\s*${ID})*)`, "g");
const TEST_FILE = /\.(?:test|contract)\.[cm]?[jt]sx?$/;

export function classifyFile(path: string): AnnotationKind {
  return TEST_FILE.test(path) ? "test" : "impl";
}

export function extractAnnotations(path: string, text: string): FoundAnnotation[] {
  const kind = classifyFile(path);
  const found: FoundAnnotation[] = [];
  text.split(/\r?\n/).forEach((lineText, index) => {
    for (const match of lineText.matchAll(ANNOTATION)) {
      for (const reqId of match[1].split(",")) {
        found.push({ file: path, line: index + 1, reqId: reqId.trim(), kind });
      }
    }
  });
  return found;
}
```

- [ ] **Step 7: Write `scripts/coverage/compute.ts`**

```ts
// @req SCD-VAL-001
import type {
  CoverageResult,
  CoverageState,
  FoundAnnotation,
  RequirementCoverage,
  RequirementEntry,
  TaskEntry,
} from "./types.ts";

export function computeCoverage(
  requirements: RequirementEntry[],
  annotations: FoundAnnotation[],
  tasks: TaskEntry[] = [],
): CoverageResult {
  const known = new Set(requirements.map((r) => r.id));
  const rows: RequirementCoverage[] = requirements.map((requirement) => {
    const impl = annotations.filter((a) => a.reqId === requirement.id && a.kind === "impl").length;
    const test = annotations.filter((a) => a.reqId === requirement.id && a.kind === "test").length;
    const status: CoverageState = impl > 0 && test > 0 ? "covered" : impl > 0 ? "partial" : "missing";
    return { id: requirement.id, title: requirement.title, status, impl, test };
  });

  const counts: Record<CoverageState, number> = { covered: 0, partial: 0, missing: 0 };
  for (const row of rows) counts[row.status] += 1;

  return {
    requirements: rows,
    counts,
    coverage: rows.length === 0 ? 0 : Math.round((counts.covered / rows.length) * 1000) / 10,
    orphanAnnotations: annotations.filter((a) => !known.has(a.reqId)),
    orphanTasks: tasks.filter((t) => !known.has(t.requirementId)),
  };
}
```

- [ ] **Step 8: Write `scripts/coverage/report.ts`**

```ts
// @req SCD-VAL-001
import type { CoverageResult } from "./types.ts";

export function formatReport(result: CoverageResult): string {
  const idWidth = Math.max(2, ...result.requirements.map((r) => r.id.length));
  const lines = [
    "Requirement coverage",
    "",
    `${"ID".padEnd(idWidth)}  ${"STATUS".padEnd(8)}  IMPL  TEST  TITLE`,
    ...result.requirements.map(
      (r) =>
        `${r.id.padEnd(idWidth)}  ${r.status.padEnd(8)}  ${String(r.impl).padStart(4)}  ${String(r.test).padStart(4)}  ${r.title}`,
    ),
  ];

  if (result.orphanAnnotations.length > 0) {
    lines.push("", `Orphan annotations (${result.orphanAnnotations.length}):`);
    for (const a of result.orphanAnnotations) lines.push(`  ${a.file}:${a.line}  ${a.reqId} (${a.kind})`);
  }
  if (result.orphanTasks.length > 0) {
    lines.push("", `Orphan tasks (${result.orphanTasks.length}):`);
    for (const t of result.orphanTasks) lines.push(`  ${t.id}  ${t.requirementId}  ${t.title}`);
  }

  const { covered, partial, missing } = result.counts;
  lines.push(
    "",
    `Coverage: ${result.coverage}% (${covered}/${result.requirements.length} covered, ${partial} partial, ${missing} missing)`,
  );
  return lines.join("\n");
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm test scripts/coverage`
Expected: PASS — 34 tests.

- [ ] **Step 10: Typecheck and commit**

Run: `pnpm typecheck` — Expected: exit 0.

```bash
git add package.json pnpm-lock.yaml tsconfig.json vitest.config.mts scripts/coverage
git commit -m "feat(coverage): add requirement coverage analysis core

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Coverage CLI and updated requirements

**Files:**
- Create: `scripts/check-coverage.ts`
- Modify: `requirements.yaml` (full replacement below)
- Modify: `package.json` (scripts `check:coverage`, `validate`; `engines`)
- Test: `scripts/check-coverage.test.ts`

**Interfaces:**
- Consumes: `parseRequirements`, `parseTasks`, `extractAnnotations`, `computeCoverage`, `formatReport`, `FoundAnnotation`, `TaskEntry` (Task 1).
- Produces: CLI `node scripts/check-coverage.ts [--root <dir>] [--tasks <file.json>]` with exit codes 0/1/2; `pnpm check:coverage`; `pnpm validate`; requirement ids SCD-UI-005, SCD-UI-006, SCD-FLT-003, SCD-VAL-001, SCD-VAL-002 used by later tasks' annotations.

- [ ] **Step 1: Write the failing CLI tests — `scripts/check-coverage.test.ts`**

```ts
// @req SCD-VAL-001
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// Built at runtime so this file never contains an annotation the scanner would count.
const TAG = "@" + "req";
const SCRIPT = join(process.cwd(), "scripts", "check-coverage.ts");
const REQUIREMENTS = "- id: FR-A-001\n  title: First\n- id: FR-A-002\n  title: Second\n";
const created: string[] = [];

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "check-coverage-"));
  created.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function run(root: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [SCRIPT, "--root", root, ...args], { encoding: "utf8" });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

afterEach(() => {
  for (const root of created.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("check-coverage CLI", () => {
  it("exits 0 and prints the report when every requirement is implemented", () => {
    const root = project({
      "requirements.yaml": REQUIREMENTS,
      "src/a.ts": `// ${TAG} FR-A-001, FR-A-002\n`,
      "src/a.test.ts": `// ${TAG} FR-A-001\n`,
    });
    const { code, stdout } = run(root);
    expect(code).toBe(0);
    expect(stdout).toContain("Coverage: 50% (1/2 covered, 1 partial, 0 missing)");
  });

  it("exits 1 and names the requirements that are not implemented", () => {
    const root = project({ "requirements.yaml": REQUIREMENTS, "src/a.ts": `// ${TAG} FR-A-001\n` });
    const { code, stderr } = run(root);
    expect(code).toBe(1);
    expect(stderr).toContain("1 requirement(s) not implemented: FR-A-002");
  });

  it("scans hooks and root config files but not docs or husky internals", () => {
    const root = project({
      "requirements.yaml": REQUIREMENTS,
      ".husky/pre-push": `# ${TAG} FR-A-001\npnpm test\n`,
      "next.config.ts": `// ${TAG} FR-A-002\n`,
      ".husky/_/h": `# ${TAG} FR-Z-001\n`,
      "docs/plan.md": `${TAG} FR-Z-002\n`,
    });
    const { code, stdout } = run(root);
    expect(code).toBe(0);
    expect(stdout).not.toContain("Orphan annotations");
  });

  it("reports orphan annotations and orphan tasks", () => {
    const root = project({
      "requirements.yaml": REQUIREMENTS,
      "src/a.ts": `// ${TAG} FR-A-001, FR-A-002, FR-Z-998\n`,
      "tasks.json": JSON.stringify([
        { id: "TASK-1", requirementId: "FR-A-001", title: "Linked" },
        { id: "TASK-9", requirementId: "FR-Z-999", title: "Stale" },
      ]),
    });
    const { code, stdout } = run(root, "--tasks", "tasks.json");
    expect(code).toBe(0);
    expect(stdout).toContain("Orphan annotations (1):\n  src/a.ts:1  FR-Z-998 (impl)");
    expect(stdout).toContain("Orphan tasks (1):\n  TASK-9  FR-Z-999  Stale");
  });

  const unreadable: Array<[string, Record<string, string>, string]> = [
    ["an empty requirements.yaml", { "requirements.yaml": "" }, "requirements file is empty"],
    ["malformed YAML", { "requirements.yaml": "- id: FR-A-001\n  title: [unclosed\n" }, "invalid YAML"],
    ["an entry without a title", { "requirements.yaml": "- id: FR-A-001\n" }, 'entry 1 must have string "id" and "title"'],
    ["a missing requirements.yaml", {}, "not found"],
  ];

  it.each(unreadable)("exits 2 for %s", (_name, files, message) => {
    const { code, stderr } = run(project(files));
    expect(code).toBe(2);
    expect(stderr).toContain(message);
  });

  it("exits 2 for malformed or empty tasks JSON", () => {
    const root = project({ "requirements.yaml": REQUIREMENTS, "bad.json": "[{", "empty.json": "" });
    expect(run(root, "--tasks", "bad.json")).toMatchObject({ code: 2, stderr: expect.stringContaining("invalid JSON") });
    expect(run(root, "--tasks", "empty.json")).toMatchObject({
      code: 2,
      stderr: expect.stringContaining("tasks file is empty"),
    });
  });

  it("exits 2 with usage on an unknown option", () => {
    const { code, stderr } = run(project({ "requirements.yaml": REQUIREMENTS }), "--bogus");
    expect(code).toBe(2);
    expect(stderr).toContain("usage:");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test scripts/check-coverage.test.ts`
Expected: FAIL — every test fails because the script does not exist (spawned node exits with `ERR_MODULE_NOT_FOUND`, status 1).

- [ ] **Step 3: Write `scripts/check-coverage.ts`**

```ts
// @req SCD-VAL-001
// Self-validation: compares requirements.yaml with the @req annotations in the source tree.
// Usage: node scripts/check-coverage.ts [--root <dir>] [--tasks <file.json>]
// Exit codes: 0 = every requirement implemented, 1 = some requirement missing, 2 = unreadable input.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { extractAnnotations } from "./coverage/annotations.ts";
import { computeCoverage } from "./coverage/compute.ts";
import { parseRequirements, parseTasks } from "./coverage/parse.ts";
import { formatReport } from "./coverage/report.ts";
import type { FoundAnnotation, TaskEntry } from "./coverage/types.ts";

const USAGE = "usage: node scripts/check-coverage.ts [--root <dir>] [--tasks <file.json>]";
const SOURCE_DIRS = ["src", "scripts", ".husky"];
const SKIP_DIRS = new Set(["node_modules", ".next", "_"]);
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|css)$/;
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
  let values: { root?: string; tasks?: string };
  try {
    ({ values } = parseArgs({ args: argv, options: { root: { type: "string" }, tasks: { type: "string" } } }));
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
    tasks = parsed.value;
  }

  const annotations: FoundAnnotation[] = collectSourceFiles(root).flatMap((file) =>
    extractAnnotations(relative(root, file).split(sep).join("/"), readFileSync(file, "utf8")),
  );
  const result = computeCoverage(requirements.value, annotations, tasks);
  console.log(formatReport(result));

  const missing = result.requirements.filter((r) => r.status === "missing");
  if (missing.length > 0) {
    console.error(
      `\ncheck-coverage: ${missing.length} requirement(s) not implemented: ${missing.map((r) => r.id).join(", ")}`,
    );
    return 1;
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test scripts/check-coverage.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 5: Replace `requirements.yaml` with the updated specification**

```yaml
# SDD Navigator Dashboard — requirements (single source of truth)
#
# ID format: SCD-{AREA}-{NNN}
# type: FR = functional, AR = architectural / non-functional
# Code implementing or testing a requirement is annotated with `@req <ID>`.
# API contract: https://api.pdd.foreachpartners.com/spec/sdd-coverage-api.yaml (v3.0.0)
# Self-check: `pnpm check:coverage` fails when any requirement has no implementation annotation.

# --- API integration ---------------------------------------------------------

- id: SCD-API-001
  type: FR
  title: Select data source by environment
  description: >-
    App MUST run in API mode, fetching from the base URL in NEXT_PUBLIC_API_URL,
    when that variable is set and non-empty, and MUST run in mock mode, loading
    local JSON fixtures, when it is unset or empty. The active mode MUST be
    visible in the UI.

- id: SCD-API-002
  type: FR
  title: Mock fixtures conform to the API schema
  description: >-
    Mock mode MUST serve fixtures for GET /stats, /requirements,
    /requirements/{id}, /annotations, /tasks and /scan that validate against the
    corresponding OpenAPI v3.0.0 response schemas, and an automated test MUST
    fail if any fixture does not validate.

- id: SCD-API-003
  type: AR
  title: Single typed data-access layer
  description: >-
    All data access MUST go through one client module whose request and response
    types match the OpenAPI schemas; UI components MUST NOT call fetch directly,
    and switching between API and mock mode MUST NOT require changes to any UI
    component.

# --- Data display ------------------------------------------------------------

- id: SCD-UI-001
  type: FR
  title: Summary panel from /stats
  description: >-
    Dashboard MUST fetch GET /stats on load and show, as stat tiles, the overall
    coverage percentage with a progress meter, the total requirement count with
    the FR and AR counts, the annotation and task orphan counts with a warning
    indicator only when either is above zero, and the lastScanAt timestamp.

- id: SCD-UI-002
  type: FR
  title: Show coverage breakdown by status
  description: >-
    Summary panel MUST show one bar per coverage status (covered, partial,
    missing) with its count, an icon and a text label, so that status is never
    conveyed by color alone.

- id: SCD-UI-003
  type: FR
  title: List requirements in a table
  description: >-
    Dashboard MUST list all requirements from GET /requirements showing id,
    type, title, coverage status and updatedAt for each row.

- id: SCD-UI-004
  type: FR
  title: Requirement detail with traceability chain
  description: >-
    Selecting a requirement MUST open a detail view, addressable by URL, loaded
    from GET /requirements/{id} that shows all its fields, a coverage assessment
    label (Fully covered, Needs tests, Not implemented), every linked annotation
    (file, line, impl/test type, code snippet), every linked task (id, title,
    status, assignee, updatedAt) and a link back to the requirements table that
    preserves the active filters.

- id: SCD-UI-005
  type: FR
  title: Tasks panel
  description: >-
    Dashboard MUST list all tasks from GET /tasks with id, requirement id,
    title, status and assignee (when present), and MUST highlight orphan tasks,
    whose requirementId is not a known requirement, with a visible text marker
    in addition to styling.

- id: SCD-UI-006
  type: FR
  title: Orphan panel
  description: >-
    Dashboard MUST show a collapsible orphan section listing orphan annotations
    (file, line, unknown reqId, type) and orphan tasks (id, title, unknown
    requirementId) in one place.

# --- Filtering ---------------------------------------------------------------

- id: SCD-FLT-001
  type: FR
  title: Filter requirements by type and status
  description: >-
    Requirements list MUST offer multi-select chips for type (FR, AR) and
    coverage status (covered, partial, missing); values combine with OR within a
    group and AND across groups, and the selection MUST be reflected in the URL
    as repeated query parameters (e.g. ?type=FR&status=missing) so a filtered
    view survives reload and can be shared.

- id: SCD-FLT-002
  type: FR
  title: Search requirements by id or title
  description: >-
    Requirements list MUST provide a text search, synced to the q query
    parameter, that keeps only requirements whose id or title contains the
    query, case-insensitively.

- id: SCD-FLT-003
  type: FR
  title: Filter tasks by status
  description: >-
    Tasks panel MUST offer multi-select chips for task status (open,
    in_progress, done), reflected in the URL as repeated taskStatus query
    parameters.

# --- Sorting -----------------------------------------------------------------

- id: SCD-SORT-001
  type: FR
  title: Sort requirements by id or updatedAt
  description: >-
    Requirements list MUST support sorting by id or updatedAt in ascending or
    descending order, defaulting to id ascending as the API does, with the sort
    reflected in the URL query string.

# --- Error / loading states --------------------------------------------------

- id: SCD-STATE-001
  type: FR
  title: Loading states
  description: >-
    Every view MUST show a loading indicator while its data is being fetched and
    MUST NOT render stale or partial data as if it were complete.

- id: SCD-STATE-002
  type: FR
  title: Error states with retry
  description: >-
    When a request fails (network error or non-2xx response) the affected view
    MUST show an error message, including the API Error.message when present,
    and a retry action; a 404 from GET /requirements/{id} MUST show a
    "requirement not found" state instead of a generic error.

- id: SCD-STATE-003
  type: FR
  title: Empty states
  description: >-
    When a list has no items, including when filters or search match nothing,
    the view MUST show an explicit empty-state message instead of an empty
    table.

# --- Accessibility -----------------------------------------------------------

- id: SCD-A11Y-001
  type: AR
  title: WCAG 2.1 AA compliance
  description: >-
    All views MUST meet WCAG 2.1 level AA in both themes: every interactive
    element reachable and operable by keyboard with a visible focus indicator,
    text contrast of at least 4.5:1, and coverage status never conveyed by
    color alone.

- id: SCD-A11Y-002
  type: AR
  title: Semantic markup and automated a11y checks
  description: >-
    The requirements list MUST be a semantic table with column headers, all form
    controls MUST have accessible labels, and an automated axe check of each
    view MUST report zero violations.

# --- Theming -----------------------------------------------------------------

- id: SCD-THEME-001
  type: FR
  title: Light and dark themes
  description: >-
    App MUST support light and dark themes, follow the OS prefers-color-scheme
    setting on first visit, and provide a toggle whose choice persists in
    localStorage across page reloads.

- id: SCD-THEME-002
  type: AR
  title: Colors defined as theme tokens
  description: >-
    All colors, including coverage status colors, MUST be defined as named theme
    tokens (CSS custom properties) with values for both themes; components MUST
    NOT hard-code color values.

# --- Deployment --------------------------------------------------------------

- id: SCD-DEP-001
  type: AR
  title: Production build gated by hooks
  description: >-
    `pnpm build` MUST complete without type errors; the pre-commit hook MUST
    block a commit when the tests or the build fail, and the pre-push hook MUST
    additionally run the type check and lint.

- id: SCD-DEP-002
  type: AR
  title: Deploy to Vercel
  description: >-
    The app MUST deploy on Vercel with every pull request getting a Preview
    deployment and the main branch deploying to Production, with
    NEXT_PUBLIC_API_URL configured per Vercel environment; the README MUST
    document the environment variables and the local build and run commands
    for both data modes.

# --- Self-validation ---------------------------------------------------------

- id: SCD-VAL-001
  type: AR
  title: Self-validation coverage script
  description: >-
    scripts/check-coverage.ts MUST parse requirements.yaml, scan the source tree
    for @req annotations, print a coverage report including orphan annotations,
    and exit with code 1 when any requirement has no implementation annotation
    (code 2 when an input file cannot be read or parsed).

- id: SCD-VAL-002
  type: AR
  title: Deterministic pre-submit checks
  description: >-
    `pnpm validate` MUST run the type check (tsc --noEmit), ESLint, all tests,
    the production build and the coverage check, stopping at the first failure,
    and CI MUST run it on every pull request and on pushes to main.
```

- [ ] **Step 6: Add the scripts and Node engine to `package.json`**

In `"scripts"`, replace `"typecheck": "tsc --noEmit",` (route types such as `PageProps` must be generated before `tsc` on a fresh checkout) and add the two new scripts after it:

```json
    "typecheck": "next typegen && tsc --noEmit",
    "check:coverage": "node scripts/check-coverage.ts",
    "validate": "pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm check:coverage",
```

Add a top-level field after `"private": true,`:

```json
  "engines": {
    "node": ">=22.18"
  },
```

- [ ] **Step 7: Run the suite and the coverage check against this repository**

Run: `pnpm test`
Expected: PASS — 112 tests (68 existing + 34 + 10).

Run: `pnpm check:coverage; echo "exit=$?"`
Expected: the report lists all 24 requirements; `exit=1` with `requirement(s) not implemented:` naming the UI, filter, state, theme, a11y, deployment and VAL-002 ids that later tasks implement. This is expected at this point.

- [ ] **Step 8: Typecheck and commit**

Run: `pnpm typecheck` — Expected: exit 0.

```bash
git add scripts/check-coverage.ts scripts/check-coverage.test.ts requirements.yaml package.json
git commit -m "feat(coverage): add check-coverage cli and dashboard requirements

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Dashboard query, formatting and presentation logic

**Files:**
- Create: `src/lib/dashboard/options.ts`, `src/lib/dashboard/query.ts`, `src/lib/dashboard/format.ts`, `src/lib/dashboard/coverage.ts`
- Create: `src/test/fixtures.ts`
- Test: `src/lib/dashboard/query.test.ts`, `src/lib/dashboard/format.test.ts`

**Interfaces:**
- Consumes: `@/lib/api` types `Requirement`, `Task`, `RequirementType`, `CoverageStatus`, `TaskStatus`, `SortField`, `SortOrder`; `createApiClient`, `mockTransport`, `dataOf` (data layer).
- Produces:
  - `options.ts`: `REQUIREMENT_TYPES: readonly RequirementType[]`, `COVERAGE_STATUSES: readonly CoverageStatus[]`, `TASK_STATUSES: readonly TaskStatus[]`.
  - `query.ts`: `interface DashboardQuery { q; types; statuses; sort; order; taskStatuses }`, `DEFAULT_QUERY`, `interface QueryParams { get; getAll }`, `parseDashboardQuery(params: QueryParams): DashboardQuery`, `serializeDashboardQuery(query: DashboardQuery): string` (`""` or `"?…"`), `searchParamsFromRecord(record: Record<string, string | string[] | undefined>): URLSearchParams`, `toggleValue<T extends string>(selected: readonly T[], value: T, allowed: readonly T[]): T[]`, `applyRequirementQuery(rows: readonly Requirement[], query: DashboardQuery): Requirement[]`, `applyTaskQuery(rows: readonly Task[], query: DashboardQuery): Task[]`.
  - `format.ts`: `formatDate(iso)`, `formatDateTime(iso)`, `formatPercent(value)`, `formatTaskStatus(status)`.
  - `coverage.ts`: `interface StatusPresentation { label; assessment; icon; color }`, `STATUS_PRESENTATION: Record<CoverageStatus, StatusPresentation>`, `share(count, total): number`.
  - `src/test/fixtures.ts`: `loadFixtures(): Promise<{ stats; requirements; tasks; orphanTasks; orphanAnnotations }>`, `loadRequirement(id: string): Promise<RequirementDetail>`.

- [ ] **Step 1: Write `src/test/fixtures.ts`**

```ts
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
```

- [ ] **Step 2: Write the failing tests — `src/lib/dashboard/query.test.ts`**

```ts
// @req SCD-FLT-001, SCD-FLT-002, SCD-FLT-003, SCD-SORT-001
import { beforeAll, describe, expect, it } from "vitest";
import type { Requirement, Task } from "@/lib/api";
import { loadFixtures } from "@/test/fixtures";
import { COVERAGE_STATUSES, REQUIREMENT_TYPES } from "./options";
import {
  DEFAULT_QUERY,
  applyRequirementQuery,
  applyTaskQuery,
  parseDashboardQuery,
  searchParamsFromRecord,
  serializeDashboardQuery,
  toggleValue,
  type DashboardQuery,
} from "./query";

let requirements: Requirement[];
let tasks: Task[];

beforeAll(async () => {
  ({ requirements, tasks } = await loadFixtures());
});

const parse = (search: string) => parseDashboardQuery(new URLSearchParams(search));
const query = (patch: Partial<DashboardQuery>): DashboardQuery => ({ ...DEFAULT_QUERY, ...patch });
const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

describe("parseDashboardQuery", () => {
  it("returns the defaults for an empty query", () => {
    expect(parse("")).toEqual(DEFAULT_QUERY);
  });

  it("reads repeated params in canonical order", () => {
    expect(parse("?status=missing&type=AR&status=covered&type=FR&taskStatus=done&taskStatus=open")).toEqual(
      query({ types: ["FR", "AR"], statuses: ["covered", "missing"], taskStatuses: ["open", "done"] }),
    );
  });

  it("drops unknown values, duplicates and bad sort/order", () => {
    expect(parse("?type=fr&type=XX&status=bogus&status=missing&status=missing&sort=title&order=sideways")).toEqual(
      query({ statuses: ["missing"] }),
    );
  });

  it("trims the search text", () => {
    expect(parse("?q=%20%20scan%20").q).toBe("scan");
  });

  it("reads sort and order", () => {
    expect(parse("?sort=updatedAt&order=desc")).toEqual(query({ sort: "updatedAt", order: "desc" }));
  });

  it("takes the first sort param when it is repeated", () => {
    expect(parse("?sort=updatedAt&sort=id").sort).toBe("updatedAt");
  });
});

describe("serializeDashboardQuery", () => {
  it("is empty for the default query", () => {
    expect(serializeDashboardQuery(DEFAULT_QUERY)).toBe("");
  });

  it("omits defaults and repeats multi-value params", () => {
    expect(
      serializeDashboardQuery(
        query({ types: ["FR"], statuses: ["covered", "partial"], order: "desc", taskStatuses: ["open"] }),
      ),
    ).toBe("?type=FR&status=covered&status=partial&order=desc&taskStatus=open");
  });

  it("round-trips through parseDashboardQuery", () => {
    const original = query({
      q: "needs tests",
      types: ["AR"],
      sort: "updatedAt",
      order: "desc",
      taskStatuses: ["in_progress", "done"],
    });
    expect(parse(serializeDashboardQuery(original))).toEqual(original);
  });
});

describe("searchParamsFromRecord", () => {
  it("expands arrays and skips undefined values", () => {
    expect(searchParamsFromRecord({ type: "FR", status: ["covered", "partial"], q: undefined }).toString()).toBe(
      "type=FR&status=covered&status=partial",
    );
  });
});

describe("toggleValue", () => {
  it("adds a value in canonical order", () => {
    expect(toggleValue(["missing"], "covered", COVERAGE_STATUSES)).toEqual(["covered", "missing"]);
  });

  it("removes a selected value", () => {
    expect(toggleValue(["FR", "AR"], "FR", REQUIREMENT_TYPES)).toEqual(["AR"]);
  });
});

describe("applyRequirementQuery", () => {
  it("returns every row sorted by id by default", () => {
    expect(ids(applyRequirementQuery(requirements, DEFAULT_QUERY))).toEqual([
      "AR-PERF-001", "AR-SEC-001", "FR-API-001", "FR-API-002",
      "FR-API-003", "FR-SCAN-001", "FR-SCAN-002", "FR-SCAN-003",
    ]);
  });

  it("filters by one type", () => {
    expect(ids(applyRequirementQuery(requirements, query({ types: ["AR"] })))).toEqual(["AR-PERF-001", "AR-SEC-001"]);
  });

  it("ORs values within a group and ANDs across groups", () => {
    expect(ids(applyRequirementQuery(requirements, query({ statuses: ["covered", "partial"] })))).toHaveLength(6);
    expect(ids(applyRequirementQuery(requirements, query({ types: ["FR"], statuses: ["partial", "missing"] })))).toEqual([
      "FR-API-003",
    ]);
  });

  it("searches id and title case-insensitively", () => {
    expect(ids(applyRequirementQuery(requirements, query({ q: "SCAN" })))).toEqual([
      "AR-PERF-001", "AR-SEC-001", "FR-SCAN-001", "FR-SCAN-002", "FR-SCAN-003",
    ]);
    expect(ids(applyRequirementQuery(requirements, query({ q: "yaml" })))).toEqual(["FR-SCAN-001"]);
  });

  it("treats regex characters literally", () => {
    expect(ids(applyRequirementQuery(requirements, query({ q: "(10 req/min)" })))).toEqual(["AR-SEC-001"]);
  });

  it("sorts by updatedAt with an id tie-break in both directions", () => {
    expect(ids(applyRequirementQuery(requirements, query({ sort: "updatedAt" })))).toEqual([
      "AR-PERF-001", "FR-API-003", "AR-SEC-001", "FR-API-002",
      "FR-SCAN-001", "FR-SCAN-003", "FR-API-001", "FR-SCAN-002",
    ]);
    expect(ids(applyRequirementQuery(requirements, query({ sort: "updatedAt", order: "desc" })))).toEqual([
      "FR-SCAN-002", "FR-API-001", "FR-SCAN-003", "FR-SCAN-001",
      "FR-API-002", "AR-SEC-001", "FR-API-003", "AR-PERF-001",
    ]);
  });

  it("does not mutate its input", () => {
    const before = ids(requirements);
    applyRequirementQuery(requirements, query({ order: "desc" }));
    expect(ids(requirements)).toEqual(before);
  });

  it("returns an empty list when nothing matches", () => {
    expect(applyRequirementQuery(requirements, query({ types: ["AR"], statuses: ["covered"] }))).toEqual([]);
  });
});

describe("applyTaskQuery", () => {
  it("returns every task without a filter", () => {
    expect(applyTaskQuery(tasks, DEFAULT_QUERY)).toHaveLength(6);
  });

  it("ORs task statuses", () => {
    expect(ids(applyTaskQuery(tasks, query({ taskStatuses: ["done", "in_progress"] })))).toEqual([
      "TASK-001", "TASK-002", "TASK-003",
    ]);
  });
});
```

- [ ] **Step 3: Write the failing tests — `src/lib/dashboard/format.test.ts`**

```ts
// @req SCD-UI-001, SCD-UI-002, SCD-UI-004
import { describe, expect, it } from "vitest";
import { STATUS_PRESENTATION, share } from "./coverage";
import { formatDate, formatDateTime, formatPercent, formatTaskStatus } from "./format";

describe("formatDate", () => {
  it("formats an ISO timestamp as a UTC date", () => {
    expect(formatDate("2026-03-01T10:15:00Z")).toBe("1 Mar 2026");
  });

  it("uses UTC, not the local timezone", () => {
    expect(formatDate("2026-02-28T23:59:59Z")).toBe("28 Feb 2026");
  });

  it("returns unparseable input unchanged", () => {
    expect(formatDate("not a date")).toBe("not a date");
  });
});

describe("formatDateTime", () => {
  it("formats date, 24-hour time and the UTC suffix", () => {
    expect(formatDateTime("2026-03-01T10:15:00Z")).toBe("1 Mar 2026, 10:15 UTC");
  });
});

describe("formatPercent", () => {
  it.each([
    [62.5, "62.5%"],
    [0, "0%"],
    [100, "100%"],
    [33.333, "33.3%"],
  ])("%d → %s", (value, text) => {
    expect(formatPercent(value)).toBe(text);
  });
});

describe("share", () => {
  it.each([
    [5, 8, 62.5],
    [0, 0, 0],
    [1, 3, 33.3],
  ])("%d of %d is %d%%", (count, total, expected) => {
    expect(share(count, total)).toBe(expected);
  });
});

describe("formatTaskStatus", () => {
  it("replaces underscores with spaces", () => {
    expect(["open", "in_progress", "done"].map((s) => formatTaskStatus(s))).toEqual(["open", "in progress", "done"]);
  });
});

describe("STATUS_PRESENTATION", () => {
  it("maps each coverage status to its assessment label and icon", () => {
    expect(
      Object.entries(STATUS_PRESENTATION).map(([status, p]) => [status, p.assessment, p.icon, p.label]),
    ).toEqual([
      ["covered", "Fully covered", "✓", "Covered"],
      ["partial", "Needs tests", "◐", "Partial"],
      ["missing", "Not implemented", "✕", "Missing"],
    ]);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm test src/lib/dashboard`
Expected: FAIL — `Cannot find module './options'` / `'./coverage'`.

- [ ] **Step 5: Write `src/lib/dashboard/options.ts`**

```ts
// @req SCD-FLT-001, SCD-FLT-003
import type { CoverageStatus, RequirementType, TaskStatus } from "@/lib/api";

export const REQUIREMENT_TYPES: readonly RequirementType[] = ["FR", "AR"];
export const COVERAGE_STATUSES: readonly CoverageStatus[] = ["covered", "partial", "missing"];
export const TASK_STATUSES: readonly TaskStatus[] = ["open", "in_progress", "done"];
```

- [ ] **Step 6: Write `src/lib/dashboard/query.ts`**

```ts
// @req SCD-FLT-001, SCD-FLT-002, SCD-FLT-003, SCD-SORT-001
// The dashboard's view state lives in the URL; these pure functions read, write and apply it.
import type {
  CoverageStatus,
  Requirement,
  RequirementType,
  SortField,
  SortOrder,
  Task,
  TaskStatus,
} from "@/lib/api";
import { COVERAGE_STATUSES, REQUIREMENT_TYPES, TASK_STATUSES } from "./options";

export interface DashboardQuery {
  q: string;
  types: RequirementType[];
  statuses: CoverageStatus[];
  sort: SortField;
  order: SortOrder;
  taskStatuses: TaskStatus[];
}

export const DEFAULT_QUERY: DashboardQuery = {
  q: "",
  types: [],
  statuses: [],
  sort: "id",
  order: "asc",
  taskStatuses: [],
};

/** The subset of URLSearchParams / ReadonlyURLSearchParams we read. */
export interface QueryParams {
  get(name: string): string | null;
  getAll(name: string): string[];
}

/** Keeps allowed values only, without duplicates, in the canonical order of `allowed`. */
function pick<T extends string>(values: readonly string[], allowed: readonly T[]): T[] {
  return allowed.filter((value) => values.includes(value));
}

export function parseDashboardQuery(params: QueryParams): DashboardQuery {
  return {
    q: (params.get("q") ?? "").trim(),
    types: pick(params.getAll("type"), REQUIREMENT_TYPES),
    statuses: pick(params.getAll("status"), COVERAGE_STATUSES),
    sort: params.get("sort") === "updatedAt" ? "updatedAt" : "id",
    order: params.get("order") === "desc" ? "desc" : "asc",
    taskStatuses: pick(params.getAll("taskStatus"), TASK_STATUSES),
  };
}

/** Returns "" for the default query, otherwise "?…" with defaults omitted. */
export function serializeDashboardQuery(query: DashboardQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  for (const type of query.types) params.append("type", type);
  for (const status of query.statuses) params.append("status", status);
  if (query.sort !== "id") params.set("sort", query.sort);
  if (query.order !== "asc") params.set("order", query.order);
  for (const status of query.taskStatuses) params.append("taskStatus", status);
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** Converts Next.js `searchParams` into URLSearchParams. */
export function searchParamsFromRecord(record: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) for (const item of value) params.append(key, item);
    else if (value !== undefined) params.append(key, value);
  }
  return params;
}

export function toggleValue<T extends string>(selected: readonly T[], value: T, allowed: readonly T[]): T[] {
  const next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
  return pick(next, allowed);
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function applyRequirementQuery(rows: readonly Requirement[], query: DashboardQuery): Requirement[] {
  const needle = query.q.toLowerCase();
  const direction = query.order === "desc" ? -1 : 1;
  return rows
    .filter(
      (r) =>
        (query.types.length === 0 || query.types.includes(r.type)) &&
        (query.statuses.length === 0 || query.statuses.includes(r.status)) &&
        (needle === "" || r.id.toLowerCase().includes(needle) || r.title.toLowerCase().includes(needle)),
    )
    .sort((a, b) => direction * (compareText(a[query.sort], b[query.sort]) || compareText(a.id, b.id)));
}

export function applyTaskQuery(rows: readonly Task[], query: DashboardQuery): Task[] {
  return rows.filter((t) => query.taskStatuses.length === 0 || query.taskStatuses.includes(t.status));
}
```

- [ ] **Step 7: Write `src/lib/dashboard/format.ts`**

```ts
// @req SCD-UI-001, SCD-UI-003, SCD-UI-004
// Fixed locale and timezone so server and client render identical text (no hydration mismatch).
const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

function parse(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(iso: string): string {
  const date = parse(iso);
  return date ? DATE.format(date) : iso;
}

export function formatDateTime(iso: string): string {
  const date = parse(iso);
  return date ? `${DATE_TIME.format(date)} UTC` : iso;
}

export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

export function formatTaskStatus(status: string): string {
  return status.replaceAll("_", " ");
}
```

- [ ] **Step 8: Write `src/lib/dashboard/coverage.ts`**

```ts
// @req SCD-UI-002, SCD-UI-004, SCD-A11Y-001
import type { CoverageStatus } from "@/lib/api";

export interface StatusPresentation {
  /** Short label used in the summary bars. */
  label: string;
  /** Coverage assessment shown on the detail page. */
  assessment: string;
  /** Always shown next to the colour so status never relies on colour alone. */
  icon: string;
  /** Theme token for marks (dots, bars); never used for text. */
  color: string;
}

export const STATUS_PRESENTATION: Record<CoverageStatus, StatusPresentation> = {
  covered: { label: "Covered", assessment: "Fully covered", icon: "✓", color: "var(--good)" },
  partial: { label: "Partial", assessment: "Needs tests", icon: "◐", color: "var(--warning)" },
  missing: { label: "Missing", assessment: "Not implemented", icon: "✕", color: "var(--critical)" },
};

/** count / total as a percentage with one decimal; 0 when total is 0. */
export function share(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 1000) / 10;
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm test src/lib/dashboard`
Expected: PASS — 35 tests (22 query + 13 format).

- [ ] **Step 10: Typecheck and commit**

Run: `pnpm typecheck` — Expected: exit 0.

```bash
git add src/lib/dashboard src/test/fixtures.ts
git commit -m "feat(dashboard): add url query, formatting and status presentation logic

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Component test setup, theme tokens, theme toggle and header

**Files:**
- Modify: `package.json` (dev dependencies)
- Create: `vitest.setup.ts`; Modify: `vitest.config.mts` (`setupFiles`)
- Create: `src/test/axe.ts`, `src/test/navigation.ts`
- Create: `src/lib/dashboard/contrast.ts`, `src/lib/dashboard/theme.ts`
- Replace: `src/app/globals.css`, `src/app/layout.tsx`
- Create: `src/components/ThemeToggle.tsx`, `src/components/Header.tsx`
- Test: `src/lib/dashboard/contrast.test.ts`, `src/app/theme-contrast.test.ts`, `src/components/theme-toggle.test.tsx`, `src/components/header.test.tsx`

**Interfaces:**
- Consumes: `dataMode` from `@/lib/api`.
- Produces:
  - `src/test/axe.ts`: `axeViolations(container: Element): Promise<string[]>`.
  - `src/test/navigation.ts`: `navigationMock` (for `vi.mock("next/navigation", …)`), `setSearch(search: string)`, `resetNavigation()`, spies `replace`, `refresh`, `push`, helper `lastHref(): string | undefined`.
  - `contrast.ts`: `relativeLuminance(hex: string): number`, `contrastRatio(a: string, b: string): number`.
  - `theme.ts`: `type Theme = "light" | "dark"`, `THEME_STORAGE_KEY`, `THEME_INIT_SCRIPT`, `subscribeTheme(listener)`, `getTheme(): Theme`, `setTheme(theme: Theme): void`.
  - Components `ThemeToggle`, `Header`; CSS tokens and Tailwind utilities: `plane surface ink ink-2 muted link hairline grid accent accent-track chip focus code-bg orphan-tint good warning critical`.

- [ ] **Step 1: Install the component-test dependencies**

```bash
timeout 200 pnpm add -D @testing-library/react@^16.3.3 @testing-library/dom@^10.4.2 @testing-library/user-event@^14.6.7 @testing-library/jest-dom@^7.0.1 jsdom@^30.1.1 axe-core@^4.13.0
```

- [ ] **Step 2: Create `vitest.setup.ts` and register it**

```ts
// Shared test setup: jest-dom matchers and DOM cleanup between tests.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

In `vitest.config.mts`, add inside `test: { … }` after the `env` entry:

```ts
    setupFiles: ["./vitest.setup.ts"],
```

- [ ] **Step 3: Create the test helpers**

`src/test/axe.ts`:

```ts
// @req SCD-A11Y-002
import axe from "axe-core";

/**
 * Runs axe on a rendered component. Colour contrast is checked separately against the
 * theme tokens (jsdom cannot compute it), and "region" only applies to whole pages.
 */
export async function axeViolations(container: Element): Promise<string[]> {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`);
}
```

`src/test/navigation.ts`:

```ts
// @req SCD-FLT-001
// Test double for next/navigation: an in-memory URL whose changes re-render subscribers,
// so components can be exercised end to end without the Next.js router.
import { useSyncExternalStore } from "react";
import { vi } from "vitest";

let search = "";
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function setSearch(next: string): void {
  search = next === "" || next.startsWith("?") ? next : `?${next}`;
  notify();
}

export const replace = vi.fn((...args: [href: string, options?: { scroll?: boolean }]) => {
  const href = args[0];
  const index = href.indexOf("?");
  search = index === -1 ? "" : href.slice(index);
  notify();
});
export const refresh = vi.fn();
export const push = vi.fn();

export function lastHref(): string | undefined {
  return replace.mock.lastCall?.[0];
}

export function resetNavigation(): void {
  search = "";
  replace.mockClear();
  refresh.mockClear();
  push.mockClear();
}

export const navigationMock = {
  useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => search, () => search)),
  useRouter: () => ({ replace, refresh, push, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  notFound: (): never => {
    throw new Error("NEXT_NOT_FOUND");
  },
};
```

- [ ] **Step 4: Write the failing tests**

`src/lib/dashboard/contrast.test.ts`:

```ts
// @req SCD-A11Y-001
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

describe("contrastRatio", () => {
  it("is 21:1 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });

  it("is 1:1 for identical colours, in either order", () => {
    expect(contrastRatio("#2a78d6", "#2a78d6")).toBe(1);
  });

  it("matches the WCAG reference for #777777 on white", () => {
    expect(contrastRatio("#ffffff", "#777777")).toBeCloseTo(4.48, 2);
  });
});
```

`src/app/theme-contrast.test.ts`:

```ts
// @req SCD-A11Y-001, SCD-THEME-002
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/dashboard/contrast";

const css = readFileSync("src/app/globals.css", "utf8");

function tokens(block: RegExp): Record<string, string> {
  const match = block.exec(css);
  if (!match) throw new Error(`Block ${block} not found in globals.css`);
  const found: Record<string, string> = {};
  for (const [, name, value] of match[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) found[name] = value.trim();
  return found;
}

const light = tokens(/:root\s*\{([^}]*)\}/);
const darkMedia = tokens(/:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/);
const darkToggle = tokens(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/);

const TEXT = ["ink", "ink-2", "muted", "link"];
const BACKGROUNDS = ["surface", "plane"];
const pairs = TEXT.flatMap((text) => BACKGROUNDS.map((background) => [text, background] as const));

describe.each([
  ["light", light],
  ["dark", darkToggle],
])("%s theme", (_theme, t) => {
  it.each(pairs)("--%s on --%s is at least 4.5:1", (text, background) => {
    expect(contrastRatio(t[text], t[background])).toBeGreaterThanOrEqual(4.5);
  });

  it("--ink on --chip and --code-bg is at least 4.5:1", () => {
    expect(contrastRatio(t.ink, t.chip)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t.ink, t["code-bg"])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("theme tokens", () => {
  it("define the fixed status colours", () => {
    expect([light.good, light.warning, light.critical]).toEqual(["#0ca30c", "#fab219", "#d03b3b"]);
  });

  it("use identical dark values for the OS preference and the toggle", () => {
    expect(darkMedia).toEqual(darkToggle);
  });

  it("are the only colours used by components", () => {
    const files = readdirSync("src/components", { recursive: true, encoding: "utf8" }).filter(
      (f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"),
    );
    const offenders = files.filter((f) =>
      /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(readFileSync(join("src/components", f), "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
```

`src/components/theme-toggle.test.tsx`:

```tsx
// @vitest-environment jsdom
// @req SCD-THEME-001, SCD-A11Y-002
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { THEME_INIT_SCRIPT } from "@/lib/dashboard/theme";
import { axeViolations } from "@/test/axe";
import { ThemeToggle } from "./ThemeToggle";

function runInitScript(): void {
  new Function(THEME_INIT_SCRIPT)();
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("ThemeToggle", () => {
  it("follows the OS preference on first visit", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("switches the theme and persists the choice in localStorage", async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    await userEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("starts from the stored choice applied by the init script", () => {
    localStorage.setItem("theme", "dark");
    runInitScript();
    expect(document.documentElement.dataset.theme).toBe("dark");
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });

  it("ignores invalid stored values", () => {
    localStorage.setItem("theme", "blue");
    runInitScript();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("has no axe violations", async () => {
    const { container } = render(<ThemeToggle />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
```

`src/components/header.test.tsx`:

```tsx
// @vitest-environment jsdom
// @req SCD-API-001, SCD-A11Y-002
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axeViolations } from "@/test/axe";
import { Header } from "./Header";

describe("Header", () => {
  it("shows the title, the active data mode and the theme toggle", () => {
    render(<Header />);
    expect(screen.getByRole("heading", { level: 1, name: "SDD Navigator" })).toBeInTheDocument();
    expect(screen.getByText("Mock data")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /theme/ })).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<Header />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `pnpm test src/lib/dashboard/contrast.test.ts src/app src/components`
Expected: FAIL — `Cannot find module './contrast'`, `'./ThemeToggle'`, `'./Header'`; theme-contrast fails with `Block … not found in globals.css`.

- [ ] **Step 6: Write `src/lib/dashboard/contrast.ts`**

```ts
// @req SCD-A11Y-001
// WCAG 2.1 relative luminance and contrast ratio for #rrggbb colours.
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`Expected a #rrggbb colour, got "${hex}"`);
  const n = parseInt(match[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}
```

- [ ] **Step 7: Write `src/lib/dashboard/theme.ts`**

```ts
// @req SCD-THEME-001
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

/**
 * Inlined in <head> so a stored choice applies before first paint. Without a stored
 * choice the CSS follows prefers-color-scheme.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

const listeners = new Set<() => void>();

function darkQuery(): MediaQueryList | null {
  return typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  const media = darkQuery();
  media?.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    media?.removeEventListener("change", listener);
  };
}

export function getTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return darkQuery()?.matches ? "dark" : "light";
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private mode, blocked): the choice lasts for this page only.
  }
  for (const listener of listeners) listener();
}
```

- [ ] **Step 8: Replace `src/app/globals.css`**

```css
@import "tailwindcss";

/* @req SCD-THEME-002, SCD-A11Y-001
   Every colour is a token here; components use the Tailwind utilities mapped in @theme.
   Text tokens (ink, ink-2, muted, link) are >= 4.5:1 on surface and plane in both themes
   (checked by src/app/theme-contrast.test.ts). Status colours are fixed across themes and
   are only used for marks, never for text. */

:root {
  color-scheme: light;
  --plane: #f9f9f7;
  --surface: #fcfcfb;
  --ink: #0b0b0b;
  --ink-2: #52514e;
  --muted: #6b6a66;
  --link: #1c5cab;
  --hairline: rgba(11, 11, 11, 0.1);
  --grid: #e1e0d9;
  --accent: #2a78d6;
  --accent-track: #cde2fb;
  --chip: #cde2fb;
  --focus: #2a78d6;
  --code-bg: #f0efec;
  --orphan-tint: rgba(208, 59, 59, 0.08);
  --good: #0ca30c;
  --warning: #fab219;
  --critical: #d03b3b;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --plane: #0d0d0d;
    --surface: #1a1a19;
    --ink: #ffffff;
    --ink-2: #c3c2b7;
    --muted: #898781;
    --link: #86b6ef;
    --hairline: rgba(255, 255, 255, 0.1);
    --grid: #2c2c2a;
    --accent: #3987e5;
    --accent-track: #184f95;
    --chip: #184f95;
    --focus: #3987e5;
    --code-bg: #262624;
    --orphan-tint: rgba(208, 59, 59, 0.16);
  }
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --plane: #0d0d0d;
  --surface: #1a1a19;
  --ink: #ffffff;
  --ink-2: #c3c2b7;
  --muted: #898781;
  --link: #86b6ef;
  --hairline: rgba(255, 255, 255, 0.1);
  --grid: #2c2c2a;
  --accent: #3987e5;
  --accent-track: #184f95;
  --chip: #184f95;
  --focus: #3987e5;
  --code-bg: #262624;
  --orphan-tint: rgba(208, 59, 59, 0.16);
}

@theme inline {
  --color-plane: var(--plane);
  --color-surface: var(--surface);
  --color-ink: var(--ink);
  --color-ink-2: var(--ink-2);
  --color-muted: var(--muted);
  --color-link: var(--link);
  --color-hairline: var(--hairline);
  --color-grid: var(--grid);
  --color-accent: var(--accent);
  --color-accent-track: var(--accent-track);
  --color-chip: var(--chip);
  --color-focus: var(--focus);
  --color-code-bg: var(--code-bg);
  --color-orphan-tint: var(--orphan-tint);
  --color-good: var(--good);
  --color-warning: var(--warning);
  --color-critical: var(--critical);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--plane);
  color: var(--ink);
}

:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
```

- [ ] **Step 9: Write `src/components/ThemeToggle.tsx`**

```tsx
"use client";
// @req SCD-THEME-001, SCD-A11Y-001
import { useSyncExternalStore } from "react";
import { getTheme, setTheme, subscribeTheme, type Theme } from "@/lib/dashboard/theme";

// On the server the theme is unknown; the client value arrives after hydration.
const getServerTheme = (): Theme | null => null;

export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme | null>(subscribeTheme, getTheme, getServerTheme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={theme === null ? "Toggle colour theme" : `Switch to ${next} theme`}
      className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm text-ink hover:bg-plane"
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
    </button>
  );
}
```

- [ ] **Step 10: Write `src/components/Header.tsx`**

```tsx
// @req SCD-API-001, SCD-THEME-001
import Link from "next/link";
import { dataMode } from "@/lib/api";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  return (
    <header className="border-b border-hairline bg-surface">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <h1 className="text-lg font-semibold">
          <Link href="/">SDD Navigator</Link>
        </h1>
        <span className="rounded-full border border-hairline px-2 py-0.5 text-xs text-ink-2">
          {dataMode === "api" ? "Live API" : "Mock data"}
        </span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 11: Replace `src/app/layout.tsx`**

```tsx
// @req SCD-THEME-001, SCD-API-001
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/Header";
import { THEME_INIT_SCRIPT } from "@/lib/dashboard/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SDD Navigator — Coverage Dashboard",
  description: "Specification coverage for an SDD project: which requirements are implemented, tested, or unaddressed.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The init script sets data-theme before hydration, so React must not warn about it.
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-plane font-sans text-ink">
        <Header />
        <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 12: Run the tests to verify they pass**

Run: `pnpm test src/lib/dashboard/contrast.test.ts src/app src/components`
Expected: PASS — 31 tests (3 contrast + 21 theme-contrast + 5 toggle + 2 header).

- [ ] **Step 13: Full suite, typecheck and commit**

Run: `pnpm test` — Expected: PASS — 178 tests.
Run: `pnpm typecheck` — Expected: exit 0.

```bash
git add package.json pnpm-lock.yaml vitest.setup.ts vitest.config.mts src/test src/lib/dashboard/contrast.ts src/lib/dashboard/contrast.test.ts src/lib/dashboard/theme.ts src/app/globals.css src/app/layout.tsx src/app/theme-contrast.test.ts src/components
git commit -m "feat(ui): add theme tokens, theme toggle and header

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Summary panel

**Files:**
- Create: `src/components/summary/StatTile.tsx`, `src/components/summary/CoverageMeter.tsx`, `src/components/summary/StatusBars.tsx`, `src/components/summary/SummaryPanel.tsx`
- Test: `src/components/summary/summary.test.tsx`

**Interfaces:**
- Consumes: `Stats` (`@/lib/api`); `COVERAGE_STATUSES` (options); `STATUS_PRESENTATION`, `share` (coverage); `formatPercent`, `formatDateTime` (format); `loadFixtures` (fixtures); `axeViolations`.
- Produces: `SummaryPanel({ stats }: { stats: Stats })`; `StatTile({ label, value, detail?, children? })`; `CoverageMeter({ value })`; `StatusBars({ byStatus, total })`.

- [ ] **Step 1: Write the failing tests — `src/components/summary/summary.test.tsx`**

```tsx
// @vitest-environment jsdom
// @req SCD-UI-001, SCD-UI-002, SCD-A11Y-002
import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import type { Stats } from "@/lib/api";
import { axeViolations } from "@/test/axe";
import { loadFixtures } from "@/test/fixtures";
import { SummaryPanel } from "./SummaryPanel";

let stats: Stats;

beforeAll(async () => {
  ({ stats } = await loadFixtures());
});

const tile = (name: string) => within(screen.getByRole("group", { name }));
const bar = (container: HTMLElement, status: string) =>
  container.querySelector(`[data-status="${status}"] [data-bar]`);

describe("SummaryPanel", () => {
  it("shows requirement, annotation and task counts", () => {
    render(<SummaryPanel stats={stats} />);
    expect(tile("Requirements").getByText("8")).toBeInTheDocument();
    expect(tile("Requirements").getByText("FR 6 · AR 2")).toBeInTheDocument();
    expect(tile("Coverage").getByText("62.5%")).toBeInTheDocument();
    expect(tile("Coverage").getByText("5 of 8 fully covered")).toBeInTheDocument();
    expect(tile("Orphans").getByText("⚠ 3")).toBeInTheDocument();
    expect(tile("Orphans").getByText("2 of 16 annotations · 1 of 6 tasks")).toBeInTheDocument();
    expect(tile("Orphans").getByRole("link", { name: "Review orphans" })).toHaveAttribute("href", "#orphans");
    expect(tile("Last scan").getByText("1 Mar 2026, 10:15 UTC")).toBeInTheDocument();
  });

  it("shows coverage on a meter", () => {
    render(<SummaryPanel stats={stats} />);
    expect(screen.getByRole("meter", { name: "Coverage" })).toHaveAttribute("aria-valuenow", "62.5");
  });

  it("draws one bar per status with count and share", () => {
    const { container } = render(<SummaryPanel stats={stats} />);
    expect(screen.getByText("Covered: 5 of 8 (62.5%)")).toBeInTheDocument();
    expect(screen.getByText("Partial: 1 of 8 (12.5%)")).toBeInTheDocument();
    expect(screen.getByText("Missing: 2 of 8 (25%)")).toBeInTheDocument();
    expect(bar(container, "covered")).toHaveStyle({ width: "100%" });
    expect(bar(container, "partial")).toHaveStyle({ width: "20%" });
    expect(bar(container, "missing")).toHaveStyle({ width: "40%" });
  });

  it("renders 0% coverage", () => {
    const none: Stats = {
      ...stats,
      coverage: 0,
      requirements: { ...stats.requirements, byStatus: { missing: 8 } },
    };
    const { container } = render(<SummaryPanel stats={none} />);
    expect(tile("Coverage").getByText("0%")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Coverage" })).toHaveAttribute("aria-valuenow", "0");
    expect(bar(container, "covered")).toHaveStyle({ width: "0%" });
    expect(bar(container, "missing")).toHaveStyle({ width: "100%" });
  });

  it("renders 100% coverage without orphans", () => {
    const full: Stats = {
      ...stats,
      coverage: 100,
      requirements: { ...stats.requirements, byStatus: { covered: 8 } },
      annotations: { ...stats.annotations, orphans: 0 },
      tasks: { ...stats.tasks, orphans: 0 },
    };
    render(<SummaryPanel stats={full} />);
    expect(tile("Coverage").getByText("100%")).toBeInTheDocument();
    expect(tile("Coverage").getByText("8 of 8 fully covered")).toBeInTheDocument();
    expect(tile("Orphans").getByText("✓ 0")).toBeInTheDocument();
    expect(tile("Orphans").queryByRole("link")).toBeNull();
  });

  it("renders an empty project without NaN", () => {
    const empty: Stats = {
      requirements: { total: 0, byType: {}, byStatus: {} },
      annotations: { total: 0, impl: 0, test: 0, orphans: 0 },
      tasks: { total: 0, byStatus: {}, orphans: 0 },
      coverage: 0,
      lastScanAt: "2026-03-01T10:15:00Z",
    };
    const { container } = render(<SummaryPanel stats={empty} />);
    expect(tile("Requirements").getByText("FR 0 · AR 0")).toBeInTheDocument();
    expect(screen.getByText("Covered: 0 of 0 (0%)")).toBeInTheDocument();
    expect(container.textContent).not.toContain("NaN");
  });

  it("has no axe violations", async () => {
    const { container } = render(<SummaryPanel stats={stats} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/components/summary`
Expected: FAIL — `Cannot find module './SummaryPanel'`.

- [ ] **Step 3: Write `src/components/summary/StatTile.tsx`**

```tsx
// @req SCD-UI-001
import type { ReactNode } from "react";

export function StatTile({
  label,
  value,
  detail,
  children,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="rounded-lg border border-hairline bg-surface p-4">
      <p className="text-xs text-ink-2">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Write `src/components/summary/CoverageMeter.tsx`**

```tsx
// @req SCD-UI-001, SCD-A11Y-001
import { formatPercent } from "@/lib/dashboard/format";

export function CoverageMeter({ value }: { value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="meter"
      aria-label="Coverage"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-valuetext={formatPercent(clamped)}
      className="mt-3 h-2.5 overflow-hidden rounded-full bg-accent-track"
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${clamped}%` }} />
    </div>
  );
}
```

- [ ] **Step 5: Write `src/components/summary/StatusBars.tsx`**

```tsx
// @req SCD-UI-002, SCD-A11Y-001
import { STATUS_PRESENTATION, share } from "@/lib/dashboard/coverage";
import { formatPercent } from "@/lib/dashboard/format";
import { COVERAGE_STATUSES } from "@/lib/dashboard/options";

export function StatusBars({ byStatus, total }: { byStatus: Record<string, number>; total: number }) {
  const rows = COVERAGE_STATUSES.map((status) => ({ status, count: byStatus[status] ?? 0 }));
  const max = Math.max(0, ...rows.map((row) => row.count));
  return (
    <figure className="mt-3 rounded-lg border border-hairline bg-surface p-4">
      <figcaption className="text-xs text-ink-2">Requirements by coverage status</figcaption>
      <ul className="mt-3 grid gap-2">
        {rows.map(({ status, count }) => {
          const p = STATUS_PRESENTATION[status];
          const summary = `${p.label}: ${count} of ${total} (${formatPercent(share(count, total))})`;
          return (
            <li
              key={status}
              data-status={status}
              title={summary}
              className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3 text-sm"
            >
              <span aria-hidden="true">
                {p.icon} {p.label}
              </span>
              <span aria-hidden="true" className="h-3">
                <span
                  data-bar
                  className="block h-full rounded-r"
                  style={{ width: `${max === 0 ? 0 : (count / max) * 100}%`, backgroundColor: p.color }}
                />
              </span>
              <span aria-hidden="true" className="text-right tabular-nums">
                {count}
              </span>
              <span className="sr-only">{summary}</span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
```

- [ ] **Step 6: Write `src/components/summary/SummaryPanel.tsx`**

```tsx
// @req SCD-UI-001, SCD-UI-002
import type { Stats } from "@/lib/api";
import { formatDateTime, formatPercent } from "@/lib/dashboard/format";
import { CoverageMeter } from "./CoverageMeter";
import { StatTile } from "./StatTile";
import { StatusBars } from "./StatusBars";

export function SummaryPanel({ stats }: { stats: Stats }) {
  const { requirements, annotations, tasks } = stats;
  const orphans = annotations.orphans + tasks.orphans;
  return (
    <section aria-labelledby="summary-heading">
      <h2 id="summary-heading" className="sr-only">
        Summary
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Coverage"
          value={formatPercent(stats.coverage)}
          detail={`${requirements.byStatus.covered ?? 0} of ${requirements.total} fully covered`}
        >
          <CoverageMeter value={stats.coverage} />
        </StatTile>
        <StatTile
          label="Requirements"
          value={requirements.total}
          detail={`FR ${requirements.byType.FR ?? 0} · AR ${requirements.byType.AR ?? 0}`}
        />
        <StatTile
          label="Orphans"
          value={orphans > 0 ? `⚠ ${orphans}` : "✓ 0"}
          detail={`${annotations.orphans} of ${annotations.total} annotations · ${tasks.orphans} of ${tasks.total} tasks`}
        >
          {orphans > 0 ? (
            <a href="#orphans" className="mt-2 inline-block text-xs text-link underline">
              Review orphans
            </a>
          ) : null}
        </StatTile>
        <StatTile label="Last scan" value={<time dateTime={stats.lastScanAt}>{formatDateTime(stats.lastScanAt)}</time>} />
      </div>
      <StatusBars byStatus={requirements.byStatus} total={requirements.total} />
    </section>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test src/components/summary`
Expected: PASS — 7 tests.

- [ ] **Step 8: Full suite, typecheck and commit**

Run: `pnpm test` — Expected: PASS — 185 tests. Run: `pnpm typecheck` — Expected: exit 0.

```bash
git add src/components/summary
git commit -m "feat(ui): add summary panel with coverage meter and status bars

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Requirements table with URL-synced filters, search and sorting

**Files:**
- Create: `src/components/useDashboardQuery.ts`, `src/components/FilterChips.tsx`, `src/components/StatusBadge.tsx`, `src/components/RequirementsTable.tsx`
- Test: `src/components/requirements-table.test.tsx`

**Interfaces:**
- Consumes: `parseDashboardQuery`, `serializeDashboardQuery`, `applyRequirementQuery`, `toggleValue`, `DashboardQuery` (query); `REQUIREMENT_TYPES`, `COVERAGE_STATUSES` (options); `STATUS_PRESENTATION` (coverage); `formatDate`; `navigationMock`, `setSearch`, `resetNavigation`, `lastHref` (test navigation); `loadFixtures`; `axeViolations`.
- Produces: `useDashboardQuery(): { query: DashboardQuery; update(patch: Partial<DashboardQuery>): void }`; `FilterChips<T extends string>({ label, legend, options, selected, onToggle, format? })`; `StatusBadge({ status })`; `RequirementsTable({ requirements })`.

- [ ] **Step 1: Write the failing tests — `src/components/requirements-table.test.tsx`**

```tsx
// @vitest-environment jsdom
// @req SCD-UI-003, SCD-FLT-001, SCD-FLT-002, SCD-SORT-001, SCD-STATE-003, SCD-A11Y-002
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Requirement } from "@/lib/api";
import { axeViolations } from "@/test/axe";
import { loadFixtures } from "@/test/fixtures";
import { lastHref, resetNavigation, setSearch } from "@/test/navigation";
import { RequirementsTable } from "./RequirementsTable";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);

let requirements: Requirement[];

beforeAll(async () => {
  ({ requirements } = await loadFixtures());
});

beforeEach(() => {
  resetNavigation();
});

function renderTable(search = "", rows: Requirement[] = requirements) {
  setSearch(search);
  return render(<RequirementsTable requirements={rows} />);
}

const rowIds = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
const chip = (group: string, name: string) =>
  within(screen.getByRole("group", { name: group })).getByRole("button", { name });

describe("RequirementsTable", () => {
  it("renders every requirement with its columns, sorted by id", () => {
    renderTable();
    expect(rowIds()).toEqual([
      "AR-PERF-001", "AR-SEC-001", "FR-API-001", "FR-API-002",
      "FR-API-003", "FR-SCAN-001", "FR-SCAN-002", "FR-SCAN-003",
    ]);
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells.map((c) => c.textContent)).toEqual([
      "AR-PERF-001", "AR", "Scan completes under 5s for 10k files", "✕missing", "10 Feb 2026",
    ]);
    expect(screen.getByText("Showing 8 of 8 requirements")).toBeInTheDocument();
  });

  it("filters by a type chip and syncs the URL", async () => {
    renderTable();
    await userEvent.click(chip("Filter by type", "FR"));
    expect(lastHref()).toBe("/?type=FR");
    expect(rowIds()).toHaveLength(6);
    expect(chip("Filter by type", "FR")).toHaveAttribute("aria-pressed", "true");
  });

  it("combines chips: OR within a group, AND across groups", async () => {
    renderTable("?type=FR");
    await userEvent.click(chip("Filter by coverage status", "partial"));
    await userEvent.click(chip("Filter by coverage status", "missing"));
    expect(lastHref()).toBe("/?type=FR&status=partial&status=missing");
    expect(rowIds()).toEqual(["FR-API-003"]);
  });

  it("restores filters from a shared URL", () => {
    renderTable("?type=AR&status=missing");
    expect(rowIds()).toEqual(["AR-PERF-001", "AR-SEC-001"]);
    expect(chip("Filter by type", "AR")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Filter by type", "FR")).toHaveAttribute("aria-pressed", "false");
    expect(chip("Filter by coverage status", "missing")).toHaveAttribute("aria-pressed", "true");
  });

  it("ignores invalid query values", () => {
    renderTable("?type=XX&status=bogus&sort=title");
    expect(rowIds()).toHaveLength(8);
  });

  it("searches id and title and syncs q", async () => {
    renderTable();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "scan");
    expect(rowIds()).toEqual(["AR-PERF-001", "AR-SEC-001", "FR-SCAN-001", "FR-SCAN-002", "FR-SCAN-003"]);
    expect(lastHref()).toBe("/?q=scan");
  });

  it("sorts by Updated and toggles the direction", async () => {
    renderTable();
    await userEvent.click(screen.getByRole("button", { name: "Sort by Updated" }));
    expect(lastHref()).toBe("/?sort=updatedAt");
    expect(rowIds()).toEqual([
      "AR-PERF-001", "FR-API-003", "AR-SEC-001", "FR-API-002",
      "FR-SCAN-001", "FR-SCAN-003", "FR-API-001", "FR-SCAN-002",
    ]);
    expect(screen.getByRole("columnheader", { name: "Sort by Updated" })).toHaveAttribute("aria-sort", "ascending");
    await userEvent.click(screen.getByRole("button", { name: "Sort by Updated" }));
    expect(lastHref()).toBe("/?sort=updatedAt&order=desc");
    expect(rowIds()[0]).toBe("FR-SCAN-002");
    expect(screen.getByRole("columnheader", { name: "Sort by Updated" })).toHaveAttribute("aria-sort", "descending");
  });

  it("sorts by ID descending", async () => {
    renderTable();
    await userEvent.click(screen.getByRole("button", { name: "Sort by ID" }));
    expect(lastHref()).toBe("/?order=desc");
    expect(rowIds()[0]).toBe("FR-SCAN-003");
  });

  it("shows an empty state and clears the filters", async () => {
    renderTable("?type=AR&status=covered");
    expect(screen.getByText("No requirements match these filters.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(lastHref()).toBe("/");
    expect(rowIds()).toHaveLength(8);
  });

  it("links to detail pages with the current filters", () => {
    renderTable("?type=FR&sort=updatedAt");
    expect(screen.getByRole("link", { name: "FR-API-001" })).toHaveAttribute(
      "href",
      "/requirements/FR-API-001?type=FR&sort=updatedAt",
    );
  });

  it("encodes ids in detail links", () => {
    renderTable("", [{ ...requirements[0], id: "FR-X Y-001" }]);
    expect(screen.getByRole("link", { name: "FR-X Y-001" })).toHaveAttribute("href", "/requirements/FR-X%20Y-001");
  });

  it("has no axe violations", async () => {
    const { container } = renderTable("?type=FR");
    expect(await axeViolations(container)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/components/requirements-table.test.tsx`
Expected: FAIL — `Cannot find module './RequirementsTable'`.

- [ ] **Step 3: Write `src/components/useDashboardQuery.ts`**

```ts
"use client";
// @req SCD-FLT-001, SCD-FLT-003, SCD-SORT-001
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseDashboardQuery, serializeDashboardQuery, type DashboardQuery } from "@/lib/dashboard/query";

/** The dashboard view state from the URL, and a way to change it without scrolling or history entries. */
export function useDashboardQuery() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = parseDashboardQuery(params);

  function update(patch: Partial<DashboardQuery>): void {
    router.replace(`${pathname}${serializeDashboardQuery({ ...query, ...patch })}`, { scroll: false });
  }

  return { query, update };
}
```

- [ ] **Step 4: Write `src/components/FilterChips.tsx`**

```tsx
"use client";
// @req SCD-FLT-001, SCD-FLT-003, SCD-A11Y-001
export function FilterChips<T extends string>({
  label,
  legend,
  options,
  selected,
  onToggle,
  format = (value) => value,
}: {
  /** Accessible group name, e.g. "Filter by type". */
  label: string;
  /** Short visible caption, e.g. "Type". */
  legend: string;
  options: readonly T[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  format?: (value: T) => string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span aria-hidden="true" className="mr-1 text-xs text-ink-2">
        {legend}
      </span>
      {options.map((option) => {
        const pressed = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={pressed}
            onClick={() => onToggle(option)}
            className={`rounded-full border px-2.5 py-0.5 text-sm text-ink ${
              pressed ? "border-accent bg-chip font-semibold" : "border-hairline bg-surface"
            }`}
          >
            {pressed ? <span aria-hidden="true">✓ </span> : null}
            {format(option)}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Write `src/components/StatusBadge.tsx`**

```tsx
// @req SCD-UI-003, SCD-A11Y-001
import type { CoverageStatus } from "@/lib/api";
import { STATUS_PRESENTATION } from "@/lib/dashboard/coverage";

export function StatusBadge({ status }: { status: CoverageStatus }) {
  const p = STATUS_PRESENTATION[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
      <span aria-hidden="true">{p.icon}</span>
      {status}
    </span>
  );
}
```

- [ ] **Step 6: Write `src/components/RequirementsTable.tsx`**

```tsx
"use client";
// @req SCD-UI-003, SCD-FLT-001, SCD-FLT-002, SCD-SORT-001, SCD-STATE-003, SCD-A11Y-001
import Link from "next/link";
import { useState } from "react";
import type { Requirement, SortField, SortOrder } from "@/lib/api";
import { formatDate } from "@/lib/dashboard/format";
import { COVERAGE_STATUSES, REQUIREMENT_TYPES } from "@/lib/dashboard/options";
import {
  applyRequirementQuery,
  serializeDashboardQuery,
  toggleValue,
  type DashboardQuery,
} from "@/lib/dashboard/query";
import { FilterChips } from "./FilterChips";
import { StatusBadge } from "./StatusBadge";
import { useDashboardQuery } from "./useDashboardQuery";

export function RequirementsTable({ requirements }: { requirements: Requirement[] }) {
  const { query, update } = useDashboardQuery();
  // Local state keeps typing responsive; every keystroke is also written to the URL.
  const [search, setSearch] = useState(query.q);
  const effective: DashboardQuery = { ...query, q: search.trim() };
  const rows = applyRequirementQuery(requirements, effective);
  const linkQuery = serializeDashboardQuery(effective);
  const filtered = effective.q !== "" || query.types.length > 0 || query.statuses.length > 0;

  const set = (patch: Partial<DashboardQuery>) => update({ q: effective.q, ...patch });

  function sortBy(field: SortField) {
    set(query.sort === field ? { order: query.order === "asc" ? "desc" : "asc" } : { sort: field, order: "asc" });
  }

  function clearFilters() {
    setSearch("");
    update({ q: "", types: [], statuses: [] });
  }

  return (
    <section aria-labelledby="requirements-heading" className="rounded-lg border border-hairline bg-surface p-4">
      <h2 id="requirements-heading" className="text-base font-semibold">
        Requirements
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-2">Search</span>
          <input
            type="search"
            value={search}
            placeholder="ID or title"
            onChange={(event) => {
              setSearch(event.target.value);
              set({ q: event.target.value.trim() });
            }}
            className="w-48 rounded-md border border-hairline bg-plane px-2 py-1 text-ink"
          />
        </label>
        <FilterChips
          label="Filter by type"
          legend="Type"
          options={REQUIREMENT_TYPES}
          selected={query.types}
          onToggle={(type) => set({ types: toggleValue(query.types, type, REQUIREMENT_TYPES) })}
        />
        <FilterChips
          label="Filter by coverage status"
          legend="Status"
          options={COVERAGE_STATUSES}
          selected={query.statuses}
          onToggle={(status) => set({ statuses: toggleValue(query.statuses, status, COVERAGE_STATUSES) })}
        />
        {filtered && rows.length > 0 ? (
          <button type="button" onClick={clearFilters} className="text-sm text-link underline">
            Clear filters
          </button>
        ) : null}
      </div>

      <p aria-live="polite" className="mt-3 text-sm text-ink-2">
        Showing {rows.length} of {requirements.length} requirements
      </p>

      {rows.length === 0 ? (
        <div className="mt-3 rounded-md border border-dashed border-hairline p-6 text-center">
          <p>No requirements match these filters.</p>
          <button type="button" onClick={clearFilters} className="mt-2 text-sm text-link underline">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Requirements</caption>
            <thead className="text-ink-2">
              <tr>
                <SortHeader field="id" label="ID" sort={query.sort} order={query.order} onSort={sortBy} />
                <th scope="col" className="px-2 py-2 font-semibold">
                  Type
                </th>
                <th scope="col" className="px-2 py-2 font-semibold">
                  Title
                </th>
                <th scope="col" className="px-2 py-2 font-semibold">
                  Status
                </th>
                <SortHeader field="updatedAt" label="Updated" sort={query.sort} order={query.order} onSort={sortBy} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-grid">
                  <td className="px-2 py-2 font-mono whitespace-nowrap">
                    <Link href={`/requirements/${encodeURIComponent(r.id)}${linkQuery}`} className="text-link hover:underline">
                      {r.id}
                    </Link>
                  </td>
                  <td className="px-2 py-2">{r.type}</td>
                  <td className="px-2 py-2">{r.title}</td>
                  <td className="px-2 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap tabular-nums text-ink-2">
                    <time dateTime={r.updatedAt}>{formatDate(r.updatedAt)}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SortHeader({
  field,
  label,
  sort,
  order,
  onSort,
}: {
  field: SortField;
  label: string;
  sort: SortField;
  order: SortOrder;
  onSort: (field: SortField) => void;
}) {
  const active = sort === field;
  return (
    <th
      scope="col"
      aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"}
      className="px-2 py-2 font-semibold"
    >
      <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1 hover:text-ink">
        <span className="sr-only">Sort by </span>
        {label}
        <span aria-hidden="true">{active ? (order === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test src/components/requirements-table.test.tsx`
Expected: PASS — 12 tests.

- [ ] **Step 8: Full suite, typecheck and commit**

Run: `pnpm test` — Expected: PASS — 197 tests. Run: `pnpm typecheck` — Expected: exit 0.

```bash
git add src/components/useDashboardQuery.ts src/components/FilterChips.tsx src/components/StatusBadge.tsx src/components/RequirementsTable.tsx src/components/requirements-table.test.tsx
git commit -m "feat(ui): add requirements table with url-synced filters, search and sorting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Tasks panel, orphan panel, error panel and loading skeleton

**Files:**
- Create: `src/components/TasksPanel.tsx`, `src/components/OrphanPanel.tsx`, `src/components/ErrorPanel.tsx`, `src/components/LoadingSkeleton.tsx`
- Test: `src/components/tasks-panel.test.tsx`, `src/components/orphan-panel.test.tsx`, `src/components/error-panel.test.tsx`

**Interfaces:**
- Consumes: `useDashboardQuery`, `FilterChips` (Task 6); `applyTaskQuery`, `serializeDashboardQuery`, `toggleValue` (query); `TASK_STATUSES`; `formatTaskStatus`; `ApiError`, `Annotation`, `Task` types; test helpers.
- Produces: `TasksPanel({ tasks, orphanTaskIds }: { tasks: Task[]; orphanTaskIds: string[] })`; `OrphanPanel({ annotations, tasks }: { annotations: Annotation[]; tasks: Task[] })` (section `id="orphans"`); `ErrorPanel({ title, error }: { title: string; error: ApiError })`; `LoadingSkeleton({ label, blocks? }: { label: string; blocks?: number })`.

- [ ] **Step 1: Write the failing tests**

`src/components/tasks-panel.test.tsx`:

```tsx
// @vitest-environment jsdom
// @req SCD-UI-005, SCD-FLT-003, SCD-STATE-003, SCD-A11Y-002
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/api";
import { axeViolations } from "@/test/axe";
import { loadFixtures } from "@/test/fixtures";
import { lastHref, resetNavigation, setSearch } from "@/test/navigation";
import { TasksPanel } from "./TasksPanel";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);

let tasks: Task[];
let orphanTaskIds: string[];

beforeAll(async () => {
  const fixtures = await loadFixtures();
  tasks = fixtures.tasks;
  orphanTaskIds = fixtures.orphanTasks.map((t) => t.id);
});

beforeEach(() => {
  resetNavigation();
});

function renderPanel(search = "", rows: Task[] = tasks) {
  setSearch(search);
  return render(<TasksPanel tasks={rows} orphanTaskIds={orphanTaskIds} />);
}

const rowIds = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
const row = (id: string) => screen.getByRole("row", { name: new RegExp(`^${id}\\b`) });
const chip = (name: string) =>
  within(screen.getByRole("group", { name: "Filter by task status" })).getByRole("button", { name });

describe("TasksPanel", () => {
  it("renders every task with its columns", () => {
    renderPanel();
    expect(rowIds()).toEqual(["TASK-001", "TASK-002", "TASK-003", "TASK-004", "TASK-005", "TASK-006"]);
    expect(within(row("TASK-003")).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "TASK-003", "FR-API-001", "Add filtering to requirements endpoint", "in progress", "maria",
    ]);
  });

  it("highlights orphan tasks with a text marker and no requirement link", () => {
    renderPanel();
    const orphan = row("TASK-006");
    expect(orphan).toHaveAttribute("data-orphan", "true");
    expect(within(orphan).getByText("⚠ orphan")).toBeInTheDocument();
    expect(within(orphan).queryByRole("link")).toBeNull();
    expect(row("TASK-001")).not.toHaveAttribute("data-orphan");
    expect(within(row("TASK-001")).getByRole("link", { name: "FR-SCAN-001" })).toBeInTheDocument();
  });

  it("marks unassigned tasks", () => {
    renderPanel();
    expect(within(row("TASK-004")).getByText("Unassigned")).toBeInTheDocument();
  });

  it("filters by a status chip and syncs taskStatus", async () => {
    renderPanel();
    await userEvent.click(chip("open"));
    expect(lastHref()).toBe("/?taskStatus=open");
    expect(rowIds()).toEqual(["TASK-004", "TASK-005", "TASK-006"]);
  });

  it("restores a multi-select filter from the URL", () => {
    renderPanel("?taskStatus=done&taskStatus=in_progress");
    expect(rowIds()).toEqual(["TASK-001", "TASK-002", "TASK-003"]);
    expect(chip("in progress")).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the requirement filters when filtering tasks", async () => {
    renderPanel("?type=FR");
    await userEvent.click(chip("done"));
    expect(lastHref()).toBe("/?type=FR&taskStatus=done");
  });

  it("links requirement ids with the current query", () => {
    renderPanel("?type=FR");
    expect(screen.getByRole("link", { name: "FR-SCAN-001" })).toHaveAttribute("href", "/requirements/FR-SCAN-001?type=FR");
  });

  it("shows an empty state and clears the filter", async () => {
    renderPanel(
      "?taskStatus=done",
      tasks.filter((t) => t.status !== "done"),
    );
    expect(screen.getByText("No tasks match this filter.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(lastHref()).toBe("/");
    expect(rowIds()).toHaveLength(4);
  });

  it("has no axe violations", async () => {
    const { container } = renderPanel();
    expect(await axeViolations(container)).toEqual([]);
  });
});
```

`src/components/orphan-panel.test.tsx`:

```tsx
// @vitest-environment jsdom
// @req SCD-UI-006, SCD-A11Y-002
import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import type { Annotation, Task } from "@/lib/api";
import { axeViolations } from "@/test/axe";
import { loadFixtures } from "@/test/fixtures";
import { OrphanPanel } from "./OrphanPanel";

let annotations: Annotation[];
let tasks: Task[];

beforeAll(async () => {
  const fixtures = await loadFixtures();
  annotations = fixtures.orphanAnnotations;
  tasks = fixtures.orphanTasks;
});

const cells = (table: HTMLElement) =>
  within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell").map((c) => c.textContent));

describe("OrphanPanel", () => {
  it("lists orphan annotations and orphan tasks together", () => {
    render(<OrphanPanel annotations={annotations} tasks={tasks} />);
    expect(cells(screen.getByRole("table", { name: "Annotations (2)" }))).toEqual([
      ["src/api/legacy.rs", "5", "FR-LEGACY-001", "impl"],
      ["tests/api_test.rs", "88", "FR-API-099", "test"],
    ]);
    expect(cells(screen.getByRole("table", { name: "Tasks (1)" }))).toEqual([
      ["TASK-006", "Add CSV export", "FR-EXPORT-001"],
    ]);
  });

  it("is a collapsible section, open by default, with the total in its heading", () => {
    const { container } = render(<OrphanPanel annotations={annotations} tasks={tasks} />);
    expect(screen.getByRole("heading", { name: "Orphans (3)" })).toBeInTheDocument();
    expect(container.querySelector("section#orphans details")).toHaveAttribute("open");
  });

  it("says so when there are no orphans", () => {
    render(<OrphanPanel annotations={[]} tasks={[]} />);
    expect(screen.getByText("No orphans — every reference points to a known requirement.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("marks an empty sub-list with None", () => {
    render(<OrphanPanel annotations={annotations} tasks={[]} />);
    expect(screen.getByRole("heading", { name: "Tasks (0)" })).toBeInTheDocument();
    expect(screen.getByText("None.")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<OrphanPanel annotations={annotations} tasks={tasks} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
```

`src/components/error-panel.test.tsx`:

```tsx
// @vitest-environment jsdom
// @req SCD-STATE-002, SCD-STATE-001, SCD-A11Y-002
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "@/test/axe";
import { refresh, resetNavigation } from "@/test/navigation";
import { ErrorPanel } from "./ErrorPanel";
import { LoadingSkeleton } from "./LoadingSkeleton";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);

beforeEach(() => {
  resetNavigation();
});

describe("ErrorPanel", () => {
  it("shows the title and the API message as an alert", () => {
    render(<ErrorPanel title="Couldn't load project stats" error={{ kind: "http", status: 500, message: "Scanner crashed" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load project stats");
    expect(screen.getByRole("alert")).toHaveTextContent("Scanner crashed");
  });

  it("lists validation issues for invalid responses", () => {
    render(
      <ErrorPanel
        title="Couldn't load requirements"
        error={{ kind: "invalid_response", message: "Unexpected response", issues: ["0.status: Invalid option"] }}
      />,
    );
    expect(screen.getByText("0.status: Invalid option")).toBeInTheDocument();
  });

  it("retries by refreshing the route", async () => {
    render(<ErrorPanel title="Couldn't load tasks" error={{ kind: "network", message: "fetch failed" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("has no axe violations", async () => {
    const { container } = render(<ErrorPanel title="Couldn't load tasks" error={{ kind: "network", message: "fetch failed" }} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("LoadingSkeleton", () => {
  it("announces loading with a status role", () => {
    render(<LoadingSkeleton label="Loading dashboard…" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading dashboard…");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/components/tasks-panel.test.tsx src/components/orphan-panel.test.tsx src/components/error-panel.test.tsx`
Expected: FAIL — `Cannot find module './TasksPanel'`, `'./OrphanPanel'`, `'./ErrorPanel'`.

- [ ] **Step 3: Write `src/components/TasksPanel.tsx`**

```tsx
"use client";
// @req SCD-UI-005, SCD-FLT-003, SCD-STATE-003, SCD-A11Y-001
import Link from "next/link";
import type { Task } from "@/lib/api";
import { formatTaskStatus } from "@/lib/dashboard/format";
import { TASK_STATUSES } from "@/lib/dashboard/options";
import { applyTaskQuery, serializeDashboardQuery, toggleValue } from "@/lib/dashboard/query";
import { FilterChips } from "./FilterChips";
import { useDashboardQuery } from "./useDashboardQuery";

const HEADERS = ["ID", "Requirement", "Title", "Status", "Assignee"];

export function TasksPanel({ tasks, orphanTaskIds }: { tasks: Task[]; orphanTaskIds: string[] }) {
  const { query, update } = useDashboardQuery();
  const rows = applyTaskQuery(tasks, query);
  const orphans = new Set(orphanTaskIds);
  const linkQuery = serializeDashboardQuery(query);

  return (
    <section aria-labelledby="tasks-heading" className="rounded-lg border border-hairline bg-surface p-4">
      <h2 id="tasks-heading" className="text-base font-semibold">
        Tasks
      </h2>
      <div className="mt-3">
        <FilterChips
          label="Filter by task status"
          legend="Status"
          options={TASK_STATUSES}
          selected={query.taskStatuses}
          onToggle={(status) => update({ taskStatuses: toggleValue(query.taskStatuses, status, TASK_STATUSES) })}
          format={formatTaskStatus}
        />
      </div>

      <p aria-live="polite" className="mt-3 text-sm text-ink-2">
        Showing {rows.length} of {tasks.length} tasks
      </p>

      {rows.length === 0 ? (
        <div className="mt-3 rounded-md border border-dashed border-hairline p-6 text-center">
          <p>No tasks match this filter.</p>
          <button type="button" onClick={() => update({ taskStatuses: [] })} className="mt-2 text-sm text-link underline">
            Clear filter
          </button>
        </div>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Tasks</caption>
            <thead className="text-ink-2">
              <tr>
                {HEADERS.map((header) => (
                  <th key={header} scope="col" className="px-2 py-2 font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const orphan = orphans.has(t.id);
                return (
                  <tr
                    key={t.id}
                    data-orphan={orphan || undefined}
                    className={`border-t border-grid ${orphan ? "bg-orphan-tint" : ""}`}
                  >
                    <td className="px-2 py-2 font-mono whitespace-nowrap">{t.id}</td>
                    <td className="px-2 py-2 font-mono whitespace-nowrap">
                      {orphan ? (
                        <>
                          {t.requirementId}{" "}
                          <span className="ml-1 rounded border border-critical px-1 font-sans text-xs text-ink">⚠ orphan</span>
                        </>
                      ) : (
                        <Link
                          href={`/requirements/${encodeURIComponent(t.requirementId)}${linkQuery}`}
                          className="text-link hover:underline"
                        >
                          {t.requirementId}
                        </Link>
                      )}
                    </td>
                    <td className="px-2 py-2">{t.title}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{formatTaskStatus(t.status)}</td>
                    <td className="px-2 py-2">
                      {t.assignee ?? (
                        <>
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">Unassigned</span>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Write `src/components/OrphanPanel.tsx`**

```tsx
// @req SCD-UI-006, SCD-A11Y-001
import type { Annotation, Task } from "@/lib/api";

export function OrphanPanel({ annotations, tasks }: { annotations: Annotation[]; tasks: Task[] }) {
  const total = annotations.length + tasks.length;
  return (
    <section id="orphans" aria-labelledby="orphans-heading" className="rounded-lg border border-hairline bg-surface p-4">
      <details open>
        <summary className="cursor-pointer">
          <h2 id="orphans-heading" className="inline text-base font-semibold">
            Orphans ({total})
          </h2>
          <span className="ml-2 text-sm text-ink-2">References to requirements that are not in requirements.yaml</span>
        </summary>
        {total === 0 ? (
          <p className="mt-3 text-sm">No orphans — every reference points to a known requirement.</p>
        ) : (
          <div className="mt-3 grid gap-4">
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
        <table className="mt-1 w-full text-left text-sm">
          <caption className="sr-only">{title}</caption>
          <thead className="text-ink-2">
            <tr>
              {headers.map((header) => (
                <th key={header} scope="col" className="px-2 py-1 font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-grid">
                {row.cells.map((cell, index) => (
                  <td key={headers[index]} className={`px-2 py-1 ${index === 0 ? "font-mono" : ""}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write `src/components/ErrorPanel.tsx`**

```tsx
"use client";
// @req SCD-STATE-002
import { useRouter } from "next/navigation";
import type { ApiError } from "@/lib/api";

export function ErrorPanel({ title, error }: { title: string; error: ApiError }) {
  const router = useRouter();
  return (
    <div role="alert" className="rounded-lg border border-critical bg-surface p-4">
      <p className="font-semibold">
        <span aria-hidden="true">✕ </span>
        {title}
      </p>
      <p className="mt-1 text-sm text-ink-2">{error.message}</p>
      {error.kind === "invalid_response" && error.issues.length > 0 ? (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer">Details</summary>
          <ul className="mt-1 list-disc pl-5 font-mono text-xs">
            {error.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <button
        type="button"
        onClick={() => router.refresh()}
        className="mt-3 rounded-md border border-hairline px-3 py-1 text-sm text-ink hover:bg-plane"
      >
        Retry
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Write `src/components/LoadingSkeleton.tsx`**

```tsx
// @req SCD-STATE-001
export function LoadingSkeleton({ label, blocks = 3 }: { label: string; blocks?: number }) {
  return (
    <div role="status" className="grid gap-4">
      <span className="sr-only">{label}</span>
      {Array.from({ length: blocks }, (_, index) => (
        <div key={index} aria-hidden="true" className="h-32 animate-pulse rounded-lg bg-surface" />
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test src/components/tasks-panel.test.tsx src/components/orphan-panel.test.tsx src/components/error-panel.test.tsx`
Expected: PASS — 19 tests (9 + 5 + 5).

- [ ] **Step 8: Full suite, typecheck and commit**

Run: `pnpm test` — Expected: PASS — 216 tests. Run: `pnpm typecheck` — Expected: exit 0.

```bash
git add src/components/TasksPanel.tsx src/components/OrphanPanel.tsx src/components/ErrorPanel.tsx src/components/LoadingSkeleton.tsx src/components/tasks-panel.test.tsx src/components/orphan-panel.test.tsx src/components/error-panel.test.tsx
git commit -m "feat(ui): add tasks, orphan, error and loading panels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Pages and requirement detail

**Files:**
- Create: `src/components/RequirementDetailView.tsx`
- Replace: `src/app/page.tsx`
- Create: `src/app/loading.tsx`, `src/app/requirements/[id]/page.tsx`, `src/app/requirements/[id]/loading.tsx`, `src/app/requirements/[id]/not-found.tsx`
- Delete: `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg` (starter assets no longer referenced)
- Test: `src/components/requirement-detail.test.tsx`, `src/app/pages.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 3–7; `getStats`, `listRequirements`, `listTasks`, `listAnnotations`, `getRequirement`, `Result`, `ApiError`, `RequirementDetail` (`@/lib/api`); `parseDashboardQuery`, `searchParamsFromRecord`, `serializeDashboardQuery`; `loadRequirement`.
- Produces: routes `/` and `/requirements/[id]`; `RequirementDetailView({ requirement, backHref }: { requirement: RequirementDetail; backHref: string })`.

- [ ] **Step 1: Write the failing tests**

`src/components/requirement-detail.test.tsx`:

```tsx
// @vitest-environment jsdom
// @req SCD-UI-004, SCD-A11Y-002
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axeViolations } from "@/test/axe";
import { loadRequirement } from "@/test/fixtures";
import { RequirementDetailView } from "./RequirementDetailView";

async function renderDetail(id: string, backHref = "/") {
  const requirement = await loadRequirement(id);
  return render(<RequirementDetailView requirement={requirement} backHref={backHref} />);
}

describe("RequirementDetailView", () => {
  it("shows every field and the coverage assessment", async () => {
    const { container } = await renderDetail("FR-API-002");
    expect(screen.getByText("FR-API-002 · FR")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Requirement detail with linked artifacts" })).toBeInTheDocument();
    expect(screen.getByText("Fully covered")).toBeInTheDocument();
    expect(
      screen.getByText("GET /requirements/{id} MUST return the requirement with all linked annotations and tasks."),
    ).toBeInTheDocument();
    const fields = container.querySelector("dl");
    expect(fields).toHaveTextContent("Statuscovered");
    expect(fields).toHaveTextContent("Created14 Feb 2026");
    expect(fields).toHaveTextContent("Updated25 Feb 2026");
  });

  it("lists linked annotations with file, line, type and snippet", async () => {
    await renderDetail("FR-API-002");
    const list = within(screen.getByRole("list", { name: "Annotations" }));
    expect(list.getAllByRole("listitem").map((item) => item.querySelector("p")?.textContent)).toEqual([
      "src/api/requirements.rs:45 · impl",
      "tests/api_test.rs:55 · test",
    ]);
    expect(list.getByText(/async fn get_requirement/)).toBeInTheDocument();
  });

  it("lists linked tasks", async () => {
    await renderDetail("FR-API-002");
    const table = screen.getByRole("table", { name: "Linked tasks" });
    const cells = within(within(table).getAllByRole("row")[1]).getAllByRole("cell").map((c) => c.textContent);
    expect(cells).toEqual(["TASK-004", "Write tests for requirement detail", "open", "—Unassigned", "20 Feb 2026"]);
  });

  it.each([
    ["FR-API-002", "Fully covered"],
    ["FR-API-003", "Needs tests"],
    ["AR-SEC-001", "Not implemented"],
  ])("labels %s as %s", async (id, label) => {
    await renderDetail(id);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("says when nothing is linked", async () => {
    await renderDetail("AR-SEC-001");
    expect(screen.getByText("No annotations reference this requirement.")).toBeInTheDocument();
    expect(screen.getByText("No tasks reference this requirement.")).toBeInTheDocument();
  });

  it("links back to the table with the given filters", async () => {
    await renderDetail("FR-API-002", "/?type=FR&status=covered");
    expect(screen.getByRole("link", { name: "← Back to requirements" })).toHaveAttribute("href", "/?type=FR&status=covered");
  });

  it("has no axe violations", async () => {
    const { container } = await renderDetail("FR-API-002");
    expect(await axeViolations(container)).toEqual([]);
  });
});
```

`src/app/pages.test.tsx`:

```tsx
// @vitest-environment jsdom
// @req SCD-UI-001, SCD-UI-004, SCD-UI-005, SCD-UI-006, SCD-STATE-001, SCD-STATE-002
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetNavigation } from "@/test/navigation";
import DashboardLoading from "./loading";
import DashboardPage from "./page";
import RequirementLoading from "./requirements/[id]/loading";
import RequirementNotFound from "./requirements/[id]/not-found";
import RequirementPage from "./requirements/[id]/page";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);
vi.mock("next/server", () => ({ connection: async () => undefined }));

beforeEach(() => {
  resetNavigation();
});

describe("dashboard page", () => {
  it("renders the summary, requirements, tasks and orphans from mock data", async () => {
    render(await DashboardPage());
    expect(screen.getByRole("group", { name: "Coverage" })).toHaveTextContent("62.5%");
    expect(screen.getByRole("heading", { name: "Requirements" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Orphans (3)" })).toBeInTheDocument();
  });
});

describe("requirement page", () => {
  it("renders the requirement and keeps only recognised filters in the back link", async () => {
    render(
      await RequirementPage({
        params: Promise.resolve({ id: "FR-API-002" }),
        searchParams: Promise.resolve({ type: "FR", status: ["covered", "partial"], bogus: "x" }),
      }),
    );
    expect(screen.getByRole("heading", { level: 2, name: "Requirement detail with linked artifacts" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Back to requirements" })).toHaveAttribute(
      "href",
      "/?type=FR&status=covered&status=partial",
    );
  });

  it("calls notFound for an unknown requirement", async () => {
    await expect(
      RequirementPage({ params: Promise.resolve({ id: "FR-UNKNOWN-999" }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("has a not-found state that links back", () => {
    render(<RequirementNotFound />);
    expect(screen.getByRole("heading", { name: "Requirement not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Back to requirements" })).toHaveAttribute("href", "/");
  });
});

describe("loading states", () => {
  it("announce loading for both routes", () => {
    const { unmount } = render(<DashboardLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading dashboard…");
    unmount();
    render(<RequirementLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading requirement…");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/components/requirement-detail.test.tsx src/app/pages.test.tsx`
Expected: FAIL — `Cannot find module './RequirementDetailView'`, `'./loading'`, `'./requirements/[id]/page'`.

- [ ] **Step 3: Write `src/components/RequirementDetailView.tsx`**

```tsx
// @req SCD-UI-004, SCD-A11Y-001
import Link from "next/link";
import type { RequirementDetail } from "@/lib/api";
import { STATUS_PRESENTATION } from "@/lib/dashboard/coverage";
import { formatDate, formatTaskStatus } from "@/lib/dashboard/format";

const TASK_HEADERS = ["ID", "Title", "Status", "Assignee", "Updated"];

export function RequirementDetailView({ requirement, backHref }: { requirement: RequirementDetail; backHref: string }) {
  const p = STATUS_PRESENTATION[requirement.status];
  return (
    <article aria-labelledby="requirement-title" className="grid gap-4">
      <p>
        <Link href={backHref} className="text-sm text-link hover:underline">
          ← Back to requirements
        </Link>
      </p>

      <section className="rounded-lg border border-hairline bg-surface p-4">
        <p className="font-mono text-sm text-ink-2">
          {requirement.id} · {requirement.type}
        </p>
        <h2 id="requirement-title" className="mt-1 text-xl font-semibold">
          {requirement.title}
        </h2>
        <p className="mt-2 inline-flex items-center gap-2 font-semibold">
          <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span aria-hidden="true">{p.icon}</span>
          <span>{p.assessment}</span>
        </p>
        <p className="mt-3">{requirement.description}</p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-2">Status</dt>
          <dd>{requirement.status}</dd>
          <dt className="text-ink-2">Created</dt>
          <dd>
            <time dateTime={requirement.createdAt}>{formatDate(requirement.createdAt)}</time>
          </dd>
          <dt className="text-ink-2">Updated</dt>
          <dd>
            <time dateTime={requirement.updatedAt}>{formatDate(requirement.updatedAt)}</time>
          </dd>
        </dl>
      </section>

      <section aria-labelledby="annotations-heading" className="rounded-lg border border-hairline bg-surface p-4">
        <h3 id="annotations-heading" className="text-base font-semibold">
          Annotations ({requirement.annotations.length})
        </h3>
        {requirement.annotations.length === 0 ? (
          <p className="mt-2 text-sm text-ink-2">No annotations reference this requirement.</p>
        ) : (
          <ul aria-label="Annotations" className="mt-2 grid gap-3">
            {requirement.annotations.map((a) => (
              <li key={`${a.file}:${a.line}`}>
                <p className="text-sm">
                  <span className="font-mono">
                    {a.file}:{a.line}
                  </span>{" "}
                  · {a.type}
                </p>
                <pre className="mt-1 overflow-x-auto rounded-md border border-hairline bg-code-bg p-2 text-xs">
                  <code>{a.snippet}</code>
                </pre>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="detail-tasks-heading" className="rounded-lg border border-hairline bg-surface p-4">
        <h3 id="detail-tasks-heading" className="text-base font-semibold">
          Tasks ({requirement.tasks.length})
        </h3>
        {requirement.tasks.length === 0 ? (
          <p className="mt-2 text-sm text-ink-2">No tasks reference this requirement.</p>
        ) : (
          <table className="mt-2 w-full text-left text-sm">
            <caption className="sr-only">Linked tasks</caption>
            <thead className="text-ink-2">
              <tr>
                {TASK_HEADERS.map((header) => (
                  <th key={header} scope="col" className="px-2 py-2 font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requirement.tasks.map((t) => (
                <tr key={t.id} className="border-t border-grid">
                  <td className="px-2 py-2 font-mono">{t.id}</td>
                  <td className="px-2 py-2">{t.title}</td>
                  <td className="px-2 py-2">{formatTaskStatus(t.status)}</td>
                  <td className="px-2 py-2">
                    {t.assignee ?? (
                      <>
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">Unassigned</span>
                      </>
                    )}
                  </td>
                  <td className="px-2 py-2 tabular-nums text-ink-2">
                    <time dateTime={t.updatedAt}>{formatDate(t.updatedAt)}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </article>
  );
}
```

- [ ] **Step 4: Replace `src/app/page.tsx`**

```tsx
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
```

- [ ] **Step 5: Write the loading, detail and not-found routes**

`src/app/loading.tsx`:

```tsx
// @req SCD-STATE-001
import { LoadingSkeleton } from "@/components/LoadingSkeleton";

export default function Loading() {
  return <LoadingSkeleton label="Loading dashboard…" blocks={4} />;
}
```

`src/app/requirements/[id]/loading.tsx`:

```tsx
// @req SCD-STATE-001
import { LoadingSkeleton } from "@/components/LoadingSkeleton";

export default function Loading() {
  return <LoadingSkeleton label="Loading requirement…" blocks={3} />;
}
```

`src/app/requirements/[id]/page.tsx`:

```tsx
// @req SCD-UI-004, SCD-STATE-002
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ErrorPanel } from "@/components/ErrorPanel";
import { RequirementDetailView } from "@/components/RequirementDetailView";
import { getRequirement } from "@/lib/api";
import { parseDashboardQuery, searchParamsFromRecord, serializeDashboardQuery } from "@/lib/dashboard/query";

export default async function RequirementPage({ params, searchParams }: PageProps<"/requirements/[id]">) {
  await connection();
  const [{ id }, search] = await Promise.all([params, searchParams]);
  // Only recognised filters survive the round trip back to the table.
  const backHref = `/${serializeDashboardQuery(parseDashboardQuery(searchParamsFromRecord(search)))}`;

  const result = await getRequirement(id);
  if (!result.ok) {
    if (result.error.kind === "not_found") notFound();
    return <ErrorPanel title="Couldn't load this requirement" error={result.error} />;
  }
  return <RequirementDetailView requirement={result.data} backHref={backHref} />;
}
```

`src/app/requirements/[id]/not-found.tsx`:

```tsx
// @req SCD-STATE-002
import Link from "next/link";

export default function RequirementNotFound() {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-6">
      <h2 className="text-lg font-semibold">Requirement not found</h2>
      <p className="mt-2 text-sm text-ink-2">No requirement with this ID exists in the current scan.</p>
      <p className="mt-3">
        <Link href="/" className="text-link hover:underline">
          ← Back to requirements
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Delete the unused starter assets**

```bash
git rm public/file.svg public/globe.svg public/next.svg public/vercel.svg public/window.svg
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test src/components/requirement-detail.test.tsx src/app/pages.test.tsx`
Expected: PASS — 14 tests (9 + 5).

- [ ] **Step 8: Full suite, typecheck, build and commit**

Run: `pnpm test` — Expected: PASS — 230 tests.
Run: `pnpm typecheck` — Expected: exit 0.
Run: `pnpm build` — Expected: `✓ Compiled successfully`; routes `/` and `/requirements/[id]` listed as dynamic (`ƒ`).

```bash
git add src/components/RequirementDetailView.tsx src/components/requirement-detail.test.tsx src/app
git commit -m "feat(ui): add dashboard and requirement detail pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Deterministic checks, CI, deployment docs and the coverage gate

**Files:**
- Modify: `.husky/pre-commit`, `.husky/pre-push`, `next.config.ts`
- Create: `.github/workflows/ci.yml`
- Replace: `README.md`
- Test: `scripts/project-config.test.ts`

**Interfaces:**
- Consumes: `pnpm validate`, `pnpm check:coverage` (Task 2); every annotation added in Tasks 1–8.
- Produces: enforced checks — hooks, CI workflow, README; `pnpm validate` passing end to end.

- [ ] **Step 1: Write the failing tests — `scripts/project-config.test.ts`**

```ts
// @req SCD-VAL-002, SCD-DEP-001, SCD-DEP-002
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
  engines?: Record<string, string>;
};
const commands = (file: string) =>
  readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));

describe("deterministic checks", () => {
  it("pnpm validate runs typecheck, lint, tests, build and coverage in order", () => {
    expect(pkg.scripts.validate).toBe("pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm check:coverage");
  });

  it("the pre-commit hook runs the tests and the build", () => {
    expect(commands(".husky/pre-commit")).toEqual(["pnpm test", "pnpm build"]);
  });

  it("the pre-push hook adds the type check and lint", () => {
    expect(commands(".husky/pre-push")).toEqual(["pnpm typecheck", "pnpm lint", "pnpm test", "pnpm build"]);
  });

  it("CI runs pnpm validate on Node 24 for pull requests and pushes to main", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(ci).toMatch(/^\s*pull_request:/m);
    expect(ci).toMatch(/branches:\s*\[main\]/);
    expect(ci).toContain("node-version: 24");
    expect(ci).toContain("run: pnpm validate");
  });

  it("requires a Node version that runs TypeScript natively", () => {
    expect(pkg.engines?.node).toBe(">=22.18");
  });
});

describe("deployment docs", () => {
  it("the README documents data modes, checks and Vercel deployment", () => {
    const readme = readFileSync("README.md", "utf8");
    for (const text of ["NEXT_PUBLIC_API_URL", "pnpm validate", "pnpm check:coverage", "Vercel", "Mock mode"]) {
      expect(readme).toContain(text);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test scripts/project-config.test.ts`
Expected: FAIL — pre-push commands differ, `ci.yml` not found, README lacks the texts (4 of 6 fail; `validate` and `engines` already pass from Task 2).

- [ ] **Step 3: Update the hooks and annotate the deployment config**

`.husky/pre-commit`:

```sh
# @req SCD-DEP-001
pnpm test
pnpm build
```

`.husky/pre-push`:

```sh
# @req SCD-DEP-001, SCD-VAL-002
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`next.config.ts` — insert as the first line:

```ts
// @req SCD-DEP-002 — deployed on Vercel (Preview per PR, Production from main); NEXT_PUBLIC_API_URL set per environment.
```

- [ ] **Step 4: Create `.github/workflows/ci.yml`**

```yaml
# Deterministic checks (SCD-VAL-002): type check, lint, tests, build and the requirement coverage gate.
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Validate
        run: pnpm validate
```

- [ ] **Step 5: Replace `README.md`**

````markdown
# SDD Navigator Dashboard

A Next.js dashboard for **specification-driven development**: it shows which requirements of a project are implemented, tested, or still unaddressed, using the [SDD Navigator API](https://api.pdd.foreachpartners.com).

- **Summary** — coverage percentage, requirement counts by type and status, orphan counts, last scan time.
- **Requirements** — searchable, filterable (type / status chips) and sortable table; filters live in the URL so views can be shared.
- **Requirement detail** — description, coverage assessment, linked `@req` annotations with code snippets, linked tasks.
- **Tasks and orphans** — all work items with orphan highlighting, plus a panel of references to unknown requirements.
- **Light and dark themes** — follows the OS on first visit; the toggle's choice is stored in `localStorage`.

## Data modes

| Mode | When | Data |
|---|---|---|
| **Mock mode** | `NEXT_PUBLIC_API_URL` unset or empty (default for development) | `data/*.json`, shaped exactly like the API responses |
| **API mode** | `NEXT_PUBLIC_API_URL` set, e.g. `https://api.pdd.foreachpartners.com` | the live SDD Navigator API |

The header shows which mode is active. `NEXT_PUBLIC_API_URL` is read at build time, so rebuild after changing it.

## Getting started

Requires Node.js ≥ 22.18 (Node 24 recommended) and pnpm.

```bash
pnpm install
pnpm dev                                                   # mock mode on http://localhost:3000
NEXT_PUBLIC_API_URL=https://api.pdd.foreachpartners.com pnpm dev   # API mode
```

Production build:

```bash
pnpm build && pnpm start
NEXT_PUBLIC_API_URL=https://api.pdd.foreachpartners.com pnpm build && pnpm start
```

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js development server, production build, production server |
| `pnpm test` | Unit, component and accessibility tests (Vitest) |
| `pnpm test:contract` | Checks the live API against the schemas (network required) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm check:coverage` | Self-validation: compares `requirements.yaml` with the `@req` annotations in the code and exits with code 1 if any requirement is unimplemented |
| `pnpm validate` | Everything above that CI runs: typecheck, lint, tests, build, coverage check |

## Specification-driven workflow

`requirements.yaml` is the single source of truth. Code that implements or tests a requirement carries a comment such as `// @req SCD-UI-003`; files named `*.test.*` count as tests. `pnpm check:coverage` prints a report (covered / partial / missing, plus orphan annotations) and fails when any requirement has no implementation. Pass `--tasks <file.json>` to also report orphan tasks.

Git hooks (Husky): pre-commit runs tests and the build; pre-push adds the type check and lint. Commit messages follow Conventional Commits (commitlint).

## Deployment

The app deploys on **Vercel** through the GitHub integration:

- every pull request gets a **Preview** deployment;
- `main` deploys to **Production**.

Set `NEXT_PUBLIC_API_URL` per Vercel environment (Project → Settings → Environment Variables). Leave it unset in Preview to review UI changes against mock data.

CI (`.github/workflows/ci.yml`) runs `pnpm validate` on every pull request and push to `main`.
````

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test scripts/project-config.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 7: Run the full deterministic check**

Run: `pnpm validate`
Expected: typecheck exit 0; lint 0 errors (the pre-existing `commitlint.config.mjs` warning may remain); tests PASS — 236 tests; build `✓ Compiled successfully`; coverage report lists 24 requirements with `0 missing` and ends `Coverage: …% (…/24 covered, …)`; overall exit 0.

- [ ] **Step 8: Commit**

```bash
git add .husky/pre-commit .husky/pre-push next.config.ts .github/workflows/ci.yml README.md scripts/project-config.test.ts
git commit -m "ci: add validate workflow, stricter pre-push hook and deployment docs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: pre-commit runs tests and build; the commit succeeds.
