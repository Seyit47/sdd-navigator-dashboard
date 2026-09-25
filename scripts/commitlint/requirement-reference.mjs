// @req SCD-VAL-003
// commitlint rule: commits that change behaviour must say which requirements they touch,
// in a footer such as "Refs: SCD-UI-003, SCD-FLT-001".
const TYPES_REQUIRING_REFS = new Set(["feat", "fix", "refactor", "perf", "test"]);
const ID = "[A-Z]+-[A-Z0-9]+-\\d{3}";
const REFS_FOOTER = new RegExp(`^Refs: ${ID}(?:, ${ID})*$`, "m");

/**
 * @param {{ type?: string | null; raw?: string | null }} parsed
 * @returns {[boolean, string?]}
 */
export function requirementReference(parsed) {
  if (!parsed.type || !TYPES_REQUIRING_REFS.has(parsed.type)) return [true];
  return REFS_FOOTER.test(parsed.raw ?? "")
    ? [true]
    : [false, `${parsed.type} commits must reference requirements in a footer, e.g. "Refs: SCD-UI-003"`];
}
