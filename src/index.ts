/**
 * soarwx — condiciones meteorológicas para vuelo a vela.
 *
 * El núcleo es puro y determinista: no accede a la red. El único módulo que
 * habla con Open-Meteo es `soarwx/openmeteo`.
 *
 * @see docs/SPEC.md para el contrato público.
 */

export * from "./types/result.js";
export * from "./types/site.js";

/**
 * Versión de la librería. Debe coincidir con `package.json`: la prueba de humo
 * lo comprueba, porque un consumidor que guarde resultados necesita saber con
 * qué versión de las fórmulas se calcularon (NF-12).
 */
export const SOARWX_VERSION = "0.12.0";

export * from "./attribution.js";
