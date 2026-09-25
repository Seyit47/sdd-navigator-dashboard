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

// @req SCD-API-003, SCD-VAL-001
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

  it("defines the requirement id pattern once", () => {
    expect(filesContaining(/\[A-Z\]\+-\[A-Z0-9\]\+-/)).toEqual(["scripts/coverage/ids.ts"]);
  });

  it("styles card surfaces in one place", () => {
    const components = sources.filter((f) => f.endsWith(".tsx"));
    expect(components.filter((f) => /\bbg-surface\b[^"]*\bshadow-card\b|\bshadow-card\b[^"]*\bbg-surface\b/.test(read(f)))).toEqual([]);
    expect(readFileSync("src/app/globals.css", "utf8")).toMatch(/@utility surface-card\s*\{/);
  });

  it("exports only what other files use", () => {
    // Next.js and tool conventions are consumed by the framework, not by imports.
    const conventions = new Set(["metadata", "requirementReference"]);
    const everything = execFileSync("git", ["ls-files", "src", "scripts", "*.config.*"], { encoding: "utf8" })
      .split("\n")
      .filter((f) => /\.(?:[cm]?[jt]sx?)$/.test(f));
    const unused = sources.flatMap((file) =>
      [...read(file).matchAll(/^export (?:async )?(?:function|const|type|interface) (\w+)/gm)]
        .map((m) => m[1])
        .filter((name) => !conventions.has(name))
        .filter((name) => !everything.some((other) => other !== file && new RegExp(`\\b${name}\\b`).test(read(other))))
        .map((name) => `${file}: ${name}`),
    );
    expect(unused).toEqual([]);
  });

  it("derives status labels from formatLabel", () => {
    expect(read("src/lib/dashboard/coverage.ts")).not.toMatch(/\blabel:\s*"/);
  });

  it("derives expected colours and rows in the browser check instead of hard-coding them", () => {
    const script = read("scripts/check-browser.mjs");
    expect(script).not.toMatch(/rgb\(\d/);
    expect(script).not.toMatch(/"(?:FR|AR)-[A-Z]+-\d{3}"/);
  });

  it("names the data modes once", () => {
    expect(filesContaining(/"Live API"|"Mock data"/)).toEqual(["src/lib/api/mode-labels.ts"]);
  });

  it("has one label formatter", () => {
    expect(filesContaining(/export function formatTaskStatus\b/)).toEqual([]);
  });
});
