// @req SCD-VAL-002, SCD-DEP-001, SCD-DEP-002
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
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

describe("traceability", () => {
  it("every tracked source, script, hook and config file carries an @req annotation", () => {
    const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
      .split("\n")
      .filter(
        (f) =>
          /^(src|scripts)\/.+\.(?:[cm]?[jt]sx?|css)$/.test(f) ||
          /^\.husky\/[^_/][^/]*$/.test(f) ||
          /^[^/]+\.config\.[cm]?[jt]s$/.test(f),
      );
    expect(files.length).toBeGreaterThan(40);
    expect(files.filter((f) => !readFileSync(f, "utf8").includes("@req"))).toEqual([]);
  });
});

describe("deliverables", () => {
  it("every requirements.yaml entry has a non-empty description", () => {
    const entries = parse(readFileSync("requirements.yaml", "utf8")) as Array<{ id: string; description?: unknown }>;
    const missing = entries.filter((e) => typeof e.description !== "string" || e.description.trim() === "").map((e) => e.id);
    expect(missing).toEqual([]);
  });

  it("the README links the live deployment and the repository", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("https://sdd-navigator-dashboard-theta.vercel.app");
    expect(readme).toContain("https://github.com/Seyit47/sdd-navigator-dashboard");
  });

  it("the README describes the typecheck script as it is defined", () => {
    expect(readFileSync("README.md", "utf8")).toContain(pkg.scripts.typecheck);
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
