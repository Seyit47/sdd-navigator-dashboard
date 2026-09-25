// @req SCD-API-003, SCD-VAL-001
// Guards against the duplications the SDD audit found: each fact lives in one place.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sources = execFileSync("git", ["ls-files", "src", "scripts"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => /\.(?:[cm]?[jt]sx?)$/.test(f) && !/\.(?:test|contract)\./.test(f));
const read = (f: string) => readFileSync(f, "utf8");
const filesContaining = (pattern: RegExp) => sources.filter((f) => pattern.test(read(f)));

describe("single source of truth", () => {
  it.each([
    ['"FR", "AR"', /"FR",\s*"AR"/],
    ['"covered", "partial", "missing"', /"covered",\s*"partial",\s*"missing"/],
    ['"open", "in_progress", "done"', /"open",\s*"in_progress",\s*"done"/],
  ])("lists the enum values %s once", (_name, pattern) => {
    expect(filesContaining(pattern)).toEqual(["src/lib/api/enums.ts"]);
  });

  it("defines the row ordering once", () => {
    expect(filesContaining(/const compareText\b/)).toEqual(["src/lib/api/sort.ts"]);
  });

  it("the coverage script reuses the app's model and result types", () => {
    const types = read("scripts/coverage/types.ts");
    expect(types).not.toMatch(/"covered"\s*\|/);
    expect(types).not.toMatch(/\bParsed\b/);
    expect(types).toMatch(/from "\.\.\/\.\.\/src\/lib\/api\/schemas\.ts"/);
  });

  it("has one label formatter", () => {
    expect(filesContaining(/export function formatTaskStatus\b/)).toEqual([]);
  });
});
