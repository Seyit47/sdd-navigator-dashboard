// @req SCD-VAL-003
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { requirementReference } from "./commitlint/requirement-reference.mjs";

const rule = (type: string, raw: string) => requirementReference({ type, raw });
const commitlint = (message: string) =>
  spawnSync("node_modules/.bin/commitlint", [], { input: message, encoding: "utf8" }).status;

// @req SCD-VAL-003
describe("requirement-reference commit rule", () => {
  it.each(["feat", "fix", "refactor", "perf", "test", "docs", "chore", "ci", "build", "style"])("rejects a %s commit without a Refs footer", (type) => {
    expect(rule(type, `${type}(ui): change something`)[0]).toBe(false);
  });

  it("accepts one or more requirement ids in a Refs footer", () => {
    expect(rule("feat", "feat(ui): add x\n\nRefs: SCD-UI-003")[0]).toBe(true);
    expect(rule("fix", "fix(ui): y\n\nBody.\n\nRefs: SCD-UI-003, SCD-FLT-001\nCo-Authored-By: A <a@b.c>")[0]).toBe(true);
  });

  it("rejects malformed ids", () => {
    expect(rule("feat", "feat(ui): add x\n\nRefs: SCD-UI-3")[0]).toBe(false);
  });

  it("does not require references for reverts", () => {
    expect(rule("revert", "revert: undo x")[0]).toBe(true);
  });

  it("is wired into the commitlint config", () => {
    expect(commitlint("feat(ui): add x\n")).not.toBe(0);
    expect(commitlint("feat(ui): add x\n\nRefs: SCD-UI-003\n")).toBe(0);
  }, 30_000);
});
