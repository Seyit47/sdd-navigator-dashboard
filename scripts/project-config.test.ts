// @req SCD-VAL-002, SCD-DEP-001, SCD-DEP-002
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
  homepage?: string;
  engines?: Record<string, string>;
};
const commands = (file: string) =>
  readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));

// @req SCD-VAL-002, SCD-DEP-001
describe("deterministic checks", () => {
  it("pnpm validate runs typecheck, lint, tests, build and coverage in order", () => {
    expect(pkg.scripts.validate).toBe(
      "pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm check:coverage --strict",
    );
  });

  it("the pre-commit hook runs the tests and the build", () => {
    expect(commands(".husky/pre-commit")).toEqual(["pnpm test", "pnpm build"]);
  });

  it("the pre-push hook adds the type check and lint", () => {
    expect(commands(".husky/pre-push")).toEqual([
      "pnpm typecheck",
      "pnpm lint",
      "pnpm test",
      "pnpm build",
      "pnpm check:coverage",
    ]);
  });

  it("CI runs pnpm validate on Node 24 for pull requests and pushes to main", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(ci).toMatch(/^\s*pull_request:/m);
    expect(ci).toMatch(/branches:\s*\[main\]/);
    expect(readFileSync(".github/actions/setup/action.yml", "utf8")).toContain("node-version: 24");
    expect(ci).toContain("run: pnpm validate");
    expect(ci).toContain("run: pnpm check:browser");
    expect(ci).toContain("run: pnpm test:contract");
    expect(ci).toMatch(/commitlint --from .*pull_request\.base\.sha/);
    expect(ci).toContain("node scripts/check-commit-refs.ts");
  });

  it("requires a Node version that runs TypeScript natively", () => {
    expect(pkg.engines?.node).toBe(">=22.18");
  });
});

// @req SCD-VAL-001
describe("traceability", () => {
  it("every tracked source, script, hook and config file carries an @req annotation", () => {
    const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
      .split("\n")
      .filter(
        (f) =>
          /^(src|scripts)\/.+\.(?:[cm]?[jt]sx?|css)$/.test(f) ||
          /^\.husky\/[^_/][^/]*$/.test(f) ||
          /^[^/]+\.(?:config|setup)\.[cm]?[jt]s$/.test(f) ||
          /^\.github\/(?:workflows|actions)\/.+\.ya?ml$/.test(f),
      );
    expect(files.length).toBeGreaterThan(40);
    expect(files.filter((f) => !readFileSync(f, "utf8").includes("@req"))).toEqual([]);
  });
});

// @req SCD-VAL-001
describe("per-test traceability", () => {
  it("every describe block in a test file is directly preceded by an @req comment", () => {
    const testFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
      .split("\n")
      .filter((f) => /\.(?:test|contract)\.[cm]?[jt]sx?$/.test(f));
    const unannotated = testFiles.flatMap((file) => {
      const lines = readFileSync(file, "utf8").split("\n");
      return lines.flatMap((line, index) => {
        if (!/^\s*describe(?:\.each)?\s*\(/.test(line)) return [];
        const previous = lines.slice(0, index).reverse().find((l) => l.trim() !== "") ?? "";
        return /^\s*\/\/ @req SCD-/.test(previous) ? [] : [`${file}:${index + 1}`];
      });
    });
    expect(testFiles.length).toBeGreaterThan(20);
    expect(unannotated).toEqual([]);
  });
});

// @req SCD-DEP-002, SCD-VAL-002
describe("deployment verification", () => {
  it("runs the browser checks against the public Production URL after each deployment", () => {
    const workflow = readFileSync(".github/workflows/deployment-check.yml", "utf8");
    expect(workflow).toMatch(/^\s*deployment_status:/m);
    expect(workflow).toContain("github.event.deployment_status.environment == 'Production'");
    expect(workflow).toContain("run: pnpm check:browser");
    // The per-deployment URL sits behind Vercel Deployment Protection; the public alias does not.
    expect(workflow).not.toContain("environment_url");
    expect(workflow).toContain("pkg.homepage");
    expect(workflow).toContain("EXPECT_DATA_MODE: api");
  });

  it("keeps the public Production URL in one place", () => {
    expect(pkg.homepage).toBe("https://sdd-navigator-dashboard-theta.vercel.app");
  });

  it("share one setup action on Node 24 action versions", () => {
    for (const file of [".github/workflows/ci.yml", ".github/workflows/deployment-check.yml"]) {
      const workflow = readFileSync(file, "utf8");
      expect(workflow).toContain("uses: ./.github/actions/setup");
      expect(workflow).not.toMatch(/@v[1-5]\b/);
    }
    expect(readFileSync(".github/actions/setup/action.yml", "utf8")).toMatch(/using: composite/);
  });

  it("has a browser check script", () => {
    expect(pkg.scripts["check:browser"]).toBe("node scripts/check-browser.mjs");
  });
});

// @req SCD-DEP-002
describe("deliverables", () => {
  it("every requirements.yaml entry has a non-empty description", () => {
    const entries = parse(readFileSync("requirements.yaml", "utf8")) as Array<{ id: string; description?: unknown }>;
    const missing = entries.filter((e) => typeof e.description !== "string" || e.description.trim() === "").map((e) => e.id);
    expect(missing).toEqual([]);
  });

  it("the README links the live deployment and the repository", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain(pkg.homepage);
    expect(readme).toContain("https://github.com/Seyit47/sdd-navigator-dashboard");
  });

  it("the README describes the typecheck script as it is defined", () => {
    expect(readFileSync("README.md", "utf8")).toContain(pkg.scripts.typecheck);
  });
});

// @req SCD-VAL-003, SCD-VAL-001
describe("working rules", () => {
  it("CLAUDE.md states the spec-driven development rules and checks", () => {
    const rules = readFileSync("CLAUDE.md", "utf8");
    for (const text of [
      "requirements.yaml",
      "@req",
      "pnpm check:coverage --strict",
      "pnpm validate",
      "Refs:",
      "Rebase and merge",
      "failing test",
      "docs/superpowers/specs",
      "@/lib/api",
    ]) {
      expect(rules).toContain(text);
    }
  });
});

// @req SCD-DEP-002
describe("deployment docs", () => {
  it("the README documents data modes, checks and Vercel deployment", () => {
    const readme = readFileSync("README.md", "utf8");
    for (const text of [
      "NEXT_PUBLIC_API_URL",
      "pnpm validate",
      "pnpm check:coverage",
      "pnpm check:browser",
      "Vercel",
      "Mock mode",
      "query parameters",
      "Network tab",
      "Refs:",
    ]) {
      expect(readme).toContain(text);
    }
  });
});
