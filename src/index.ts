/**
 * soarwx — soaring weather conditions.
 *
 * The core is pure and deterministic: it never accesses the network. The only
 * module that communicates with Open-Meteo is `soarwx/openmeteo`.
 *
 * @see docs/SPEC.md for the public contract.
 */

export * from "./types/result.js";
export * from "./types/site.js";

/**
 * Library version. Must match `package.json`: verified by the smoke test,
 * because consumers saving results need to know which formula version
 * produced them (NF-12).
 */
export const SOARWX_VERSION = "0.12.0";

export * from "./attribution.js";
