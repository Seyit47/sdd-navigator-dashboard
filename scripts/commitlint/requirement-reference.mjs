// @req SCD-VAL-003
// commitlint rule: every commit names the requirements it touches in a footer such as
// "Refs: SCD-UI-003, SCD-FLT-001". Reverts are exempt; merge commits are ignored by commitlint.
import { ID_SOURCE } from "../coverage/ids.ts";

const REFS_FOOTER = new RegExp(`^Refs: ${ID_SOURCE}(?:, ${ID_SOURCE})*$`, "m");

/**
 * @param {{ type?: string | null; raw?: string | null }} parsed
 * @returns {[boolean, string?]}
 */
export function requirementReference(parsed) {
  if (parsed.type === "revert") return [true];
  return REFS_FOOTER.test(parsed.raw ?? "")
    ? [true]
    : [false, `commits must reference requirements in a footer, e.g. "Refs: SCD-UI-003"`];
}
