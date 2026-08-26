/**
 * Custom lint rules for soarwx.
 *
 * These are not style preferences: they enforce two core design invariants
 * that plausible-looking changes would silently break (see docs/REQUIREMENTS.md NF-5 and NF-6).
 */
import requireSourceCitation from "./rules/require-source-citation.js";
import unitSuffix from "./rules/unit-suffix.js";

export default {
  meta: { name: "eslint-plugin-soarwx", version: "0.0.0" },
  rules: {
    "require-source-citation": requireSourceCitation,
    "unit-suffix": unitSuffix,
  },
};
