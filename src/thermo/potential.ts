/**
 * Temperatura potencial y correcciones por humedad.
 */

import { K } from "../units/branded.js";
import type { Kelvin, KgPerKg, Pascal } from "../units/branded.js";
import { KAPPA, P0 } from "../units/constants.js";

/**
 * Temperatura potencial.
 *
 *     θ = T · (p0/p)^(Rd/cp)
 *
 * Se conserva en un ascenso adiabático seco. `w*` debe usar θ, no T: a 900 hPa
 * la diferencia es de ~9 K (Allen ec. 10).
 *
 * @source Poisson; Wallace & Hobbs, Atmospheric Science, ec. 3.54.
 */
export function potentialTemperature(tempK: Kelvin, pressurePa: Pascal): Kelvin {
  return K(tempK * Math.pow(P0 / pressurePa, KAPPA));
}

/**
 * Inversa de {@link potentialTemperature}: temperatura a una presión dada.
 *
 * @source Poisson; Wallace & Hobbs, Atmospheric Science, ec. 3.54.
 */
export function temperatureFromPotential(thetaK: Kelvin, pressurePa: Pascal): Kelvin {
  return K(thetaK * Math.pow(pressurePa / P0, KAPPA));
}

/**
 * Temperatura virtual.
 *
 *     Tv = T · (1 + 0.61·w)
 *
 * La flotabilidad depende de Tv, no de T: el aire húmedo es menos denso.
 *
 * @source Allen (2006), AIAA 2006-1510, ec. 5 (misma corrección 0.61).
 */
export function virtualTemperature(tempK: Kelvin, mixingRatioKgKg: KgPerKg): Kelvin {
  return K(tempK * (1 + 0.61 * mixingRatioKgKg));
}

/**
 * Temperatura potencial virtual.
 *
 * @source Stull, Practical Meteorology, cap. 3.
 */
export function virtualPotentialTemperature(
  tempK: Kelvin,
  pressurePa: Pascal,
  mixingRatioKgKg: KgPerKg,
): Kelvin {
  return virtualTemperature(potentialTemperature(tempK, pressurePa), mixingRatioKgKg);
}
