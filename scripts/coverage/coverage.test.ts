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

  it("rejects ids that do not follow TYPE-AREA-NNN", () => {
    expect(parseRequirements("- id: SCD-UI-01\n  title: Short\n")).toEqual({
      ok: false,
      error: 'entry 1 has an invalid id "SCD-UI-01" (expected TYPE-AREA-NNN, e.g. SCD-UI-001)',
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

  it("requires an exact id: longer or suffixed ids are not truncated", () => {
    const text = [`// ${TAG} FR-A-0010`, `// ${TAG} FR-A-001a`, `// ${TAG} FR-A-001-x`].join("\n");
    expect(extractAnnotations("src/a.ts", text)).toEqual([]);
  });

  it("requires the tag to start a word", () => {
    expect(extractAnnotations("src/a.ts", `foo${TAG} FR-A-001`)).toEqual([]);
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
