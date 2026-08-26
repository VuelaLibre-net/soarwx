/**
 * Reglas de lint propias de soarwx.
 *
 * No son estilo: codifican dos invariantes del diseño que un cambio plausible
 * rompe en silencio (ver docs/REQUIREMENTS.md NF-5 y NF-6).
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
