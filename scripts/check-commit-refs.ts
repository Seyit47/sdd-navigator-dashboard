// @req SCD-VAL-003
// Every commit in <base>..<head> — merge commits included, which commitlint skips — must name
// the requirements it changes in a "Refs: SCD-…" footer. CI runs this for pull requests and for
// pushes to main, so merges made with GitHub's merge button are checked too.
// Usage: node scripts/check-commit-refs.ts <base> <head>
// An all-zero base (a new branch) or a base that is not in the history (a force-push that
// rewrote history) means every commit reachable from <head> is checked.
import { execFileSync } from "node:child_process";
import { ID_SOURCE } from "./coverage/ids.ts";

const REFS_FOOTER = new RegExp(`^Refs: ${ID_SOURCE}(?:, ${ID_SOURCE})*$`, "m");
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" });

function isCommit(sha: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function main(argv: string[]): number {
  const [base, head] = argv;
  if (!base || !head) {
    console.error("usage: node scripts/check-commit-refs.ts <base> <head>");
    return 2;
  }
  let range = [`${base}..${head}`];
  if (/^0+$/.test(base)) {
    range = [head];
  } else if (!isCommit(base)) {
    console.log(`base ${base.slice(0, 7)} is not in this history (rewritten by a force-push?); checking every commit`);
    range = [head];
  }
  const commits = git("rev-list", ...range).split("\n").filter(Boolean);
  const missing = commits.filter((sha) => !REFS_FOOTER.test(git("log", "-1", "--format=%B", sha)));
  if (missing.length > 0) {
    for (const sha of missing) console.error(`  ${git("log", "-1", "--format=%h %s", sha).trim()}`);
    console.error(`check-commit-refs: ${missing.length} commit(s) without a "Refs: SCD-…" footer`);
    return 1;
  }
  console.log(`${commits.length} commit(s) reference requirements`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
