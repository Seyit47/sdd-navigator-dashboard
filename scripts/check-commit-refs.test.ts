// @req SCD-VAL-003
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), "scripts", "check-commit-refs.ts");
const repos: string[] = [];

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "commit-refs-"));
  repos.push(dir);
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=T", "-c", "commit.gpgsign=false", ...args], {
      cwd: dir,
      encoding: "utf8",
    }).trim();
  git("init", "-q", "-b", "main");
  let n = 0;
  const commit = (message: string) => {
    writeFileSync(join(dir, `f${++n}.txt`), String(n));
    git("add", ".");
    git("commit", "-q", "--no-verify", "-m", message);
    return git("rev-parse", "HEAD");
  };
  return { dir, git, commit };
}

const run = (dir: string, ...args: string[]) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: "utf8" });

afterEach(() => {
  for (const dir of repos.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// @req SCD-VAL-003
describe("check-commit-refs", () => {
  it("passes when every commit in the range, merges included, has a Refs footer", () => {
    const { dir, git, commit } = repo();
    const base = commit("chore: base\n\nRefs: SCD-VAL-001");
    git("checkout", "-q", "-b", "topic");
    commit("feat: x\n\nRefs: SCD-UI-001");
    git("checkout", "-q", "-");
    git("merge", "-q", "--no-ff", "--no-verify", "topic", "-m", "Merge topic\n\nRefs: SCD-UI-001");
    const result = run(dir, base, "HEAD");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("2 commit(s) reference requirements");
  });

  it("fails on a merge commit without a Refs footer", () => {
    const { dir, git, commit } = repo();
    const base = commit("chore: base\n\nRefs: SCD-VAL-001");
    git("checkout", "-q", "-b", "topic");
    commit("feat: x\n\nRefs: SCD-UI-001");
    git("checkout", "-q", "-");
    git("merge", "-q", "--no-ff", "--no-verify", "topic", "-m", "Merge pull request #1 from x/topic");
    const result = run(dir, base, "HEAD");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Merge pull request #1 from x/topic");
  });

  it("treats an all-zero base (first push of a branch) as the whole history", () => {
    const { dir, commit } = repo();
    commit("chore: base\n\nRefs: SCD-VAL-001");
    expect(run(dir, "0000000000000000000000000000000000000000", "HEAD").status).toBe(0);
  });

  it("exits 2 with usage when arguments are missing", () => {
    const { dir } = repo();
    expect(run(dir).status).toBe(2);
  });
});
