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

// @req SCD-VAL-001
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

  it("runs without Node warnings", () => {
    const root = project({ "requirements.yaml": REQUIREMENTS, "src/a.ts": `// ${TAG} FR-A-001, FR-A-002\n` });
    expect(run(root).stderr).not.toMatch(/Warning/);
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

  it("scans workflow files", () => {
    const root = project({
      "requirements.yaml": REQUIREMENTS,
      "src/a.ts": `// ${TAG} FR-A-001\n`,
      ".github/workflows/ci.yml": `# ${TAG} FR-A-002\non: push\n`,
    });
    expect(run(root).code).toBe(0);
  });

  it("--strict fails on partially covered requirements and on orphans", () => {
    const partial = project({ "requirements.yaml": REQUIREMENTS, "src/a.ts": `// ${TAG} FR-A-001, FR-A-002\n` });
    expect(run(partial, "--strict")).toMatchObject({ code: 1, stderr: expect.stringContaining("2 requirement(s) not fully covered") });
    const orphan = project({
      "requirements.yaml": REQUIREMENTS,
      "src/a.ts": `// ${TAG} FR-A-001, FR-A-002, FR-Z-999\n`,
      "src/a.test.ts": `// ${TAG} FR-A-001, FR-A-002\n`,
    });
    expect(run(orphan, "--strict")).toMatchObject({ code: 1, stderr: expect.stringContaining("1 orphan annotation(s)") });
    const clean = project({ "requirements.yaml": REQUIREMENTS, "src/a.ts": `// ${TAG} FR-A-001, FR-A-002\n`, "src/a.test.ts": `// ${TAG} FR-A-001, FR-A-002\n` });
    expect(run(clean, "--strict").code).toBe(0);
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
