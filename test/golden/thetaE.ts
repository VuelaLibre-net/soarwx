/**
 * Temperatura potencial equivalente, Bolton (1980) ec. 39.
 *
 * Referencia para comprobar que el ascenso pseudoadiabático la conserva
 * (prueba T-07). Solo para pruebas.
 *
 * @source Bolton, D. (1980), Monthly Weather Review 108, ec. 39.
 */

/**
 * @param tempK temperatura, K
 * @param pressurePa presión, Pa
 * @param mixingRatioKgKg razón de mezcla, kg/kg
 * @param tLclK temperatura del LCL, K (igual a tempK si la parcela está saturada)
 */
export function thetaEK(
  tempK: number,
  pressurePa: number,
  mixingRatioKgKg: number,
  tLclK: number,
): number {
  const p = pressurePa / 100; // hPa
  const r = mixingRatioKgKg * 1000; // g/kg
  return (
    tempK *
    Math.pow(1000 / p, 0.2854 * (1 - 0.28e-3 * r)) *
    Math.exp((3.376 / tLclK - 0.00254) * r * (1 + 0.81e-3 * r))
  );
}
