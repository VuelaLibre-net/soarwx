/**
 * Nivel de condensación por ascenso (LCL).
 *
 * No se usa la regla de Espy (~122-125 m por grado de spread): frente a Bolton
 * tiene un error medido de hasta −5.5 % y sistemáticamente negativo a
 * temperatura alta, es decir, infravalora la base de nubes justo en los días
 * buenos. Ver docs/REQUIREMENTS.md R-2.2.
 */

import { K, Pa, m } from "../units/branded.js";
import type { Kelvin, Metres, Pascal } from "../units/branded.js";
import { G, KAPPA } from "../units/constants.js";
import { mixingRatio, moistHeatCapacity, specificHumidity } from "./saturation.js";

export interface LclResult {
  /** Temperatura en el LCL. */
  readonly tempK: Kelvin;
  /** Presión en el LCL. */
  readonly pressurePa: Pascal;
  /** Altura del LCL sobre el nivel de partida de la parcela. */
  readonly heightAboveParcelM: Metres;
}

/**
 * Temperatura del LCL.
 *
 *     T_LCL = 1 / ( 1/(Td − 56) + ln(T/Td)/800 ) + 56      [K]
 *
 * Error declarado por el autor menor que 0.1 K.
 *
 * @source Bolton, D. (1980), Monthly Weather Review 108, ec. 15.
 */
export function lclTemperature(tempK: Kelvin, dewpointK: Kelvin): Kelvin {
  const td = Math.min(dewpointK, tempK);
  return K(1 / (1 / (td - 56) + Math.log(tempK / td) / 800) + 56);
}

/**
 * LCL completo: temperatura, presión y altura sobre el punto de partida.
 *
 * La presión sale de la relación de Poisson, porque el ascenso hasta el LCL es
 * adiabático seco y conserva θ.
 *
 * La altura usa el calor específico del aire **húmedo**, no el seco: a 45 °C y
 * 40 % de humedad relativa, usar cp seco separa el resultado un 1.9 % del LCL
 * exacto de Romps (2017). Con cpm la discrepancia baja al 0.5 %.
 *
 * @source Bolton, D. (1980), Monthly Weather Review 108, ec. 15; Poisson;
 *         Romps, D. M. (2017), J. Atmos. Sci. 74 (uso de cpm en la altura).
 */
export function lcl(tempK: Kelvin, dewpointK: Kelvin, pressurePa: Pascal): LclResult {
  const tLcl = lclTemperature(tempK, dewpointK);
  const cpm = moistHeatCapacity(specificHumidity(mixingRatio(dewpointK, pressurePa)));
  return {
    tempK: tLcl,
    pressurePa: Pa(pressurePa * Math.pow(tLcl / tempK, 1 / KAPPA)),
    heightAboveParcelM: m(Math.max(0, ((tempK - tLcl) * cpm) / G)),
  };
}
