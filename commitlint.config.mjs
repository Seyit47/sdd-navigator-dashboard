// @req SCD-VAL-003
import { requirementReference } from "./scripts/commitlint/requirement-reference.mjs";

const config = {
  extends: ["@commitlint/config-conventional"],
  plugins: [{ rules: { "requirement-reference": requirementReference } }],
  rules: { "requirement-reference": [2, "always"] },
};

export default config;
