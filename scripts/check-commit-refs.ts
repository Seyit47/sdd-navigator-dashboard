// @req SCD-VAL-003
// Every commit in <base>..<head> — merge commits included, which commitlint skips — must name
// the requirements it changes in a "Refs: SCD-…" footer. CI runs this for pull requests and for
// pushes to main, so merges made with GitHub's merge button are checked too.
// Usage: node scripts/check-commit-refs.ts <base> <head>   (an all-zero base means "all history")
import { execFileSync } from "node:child_process";
import { ID_SOURCE } from "./coverage/ids.ts";

const REFS_FOOTER = new RegExp(`^Refs: ${ID_SOURCE}(?:, ${ID_SOURCE})*$`, "m");
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" });

function main(argv: string[]): number {
  const [base, head] = argv;
  if (!base || !head) {
    console.error("usage: node scripts/check-commit-refs.ts <base> <head>");
    return 2;
  }
  const range = /^0+$/.test(base) ? [head] : [`${base}..${head}`];
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
