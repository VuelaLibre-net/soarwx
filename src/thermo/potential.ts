/**
 * Potential temperature and moisture corrections.
 */

import { K } from "../units/branded.js";
import type { Kelvin, KgPerKg, Pascal } from "../units/branded.js";
import { KAPPA, P0 } from "../units/constants.js";

/**
 * Potential temperature.
 *
 *     θ = T · (p0/p)^(Rd/cp)
 *
 * Conserved in dry adiabatic ascent. `w*` must use θ rather than T: at 900 hPa
 * the difference is ~9 K (Allen eq. 10).
 *
 * @source Poisson; Wallace & Hobbs, Atmospheric Science, eq. 3.54.
 */
export function potentialTemperature(tempK: Kelvin, pressurePa: Pascal): Kelvin {
  return K(tempK * Math.pow(P0 / pressurePa, KAPPA));
}

/**
 * Inverse of {@link potentialTemperature}: temperature at a given pressure.
 *
 * @source Poisson; Wallace & Hobbs, Atmospheric Science, eq. 3.54.
 */
export function temperatureFromPotential(thetaK: Kelvin, pressurePa: Pascal): Kelvin {
  return K(thetaK * Math.pow(pressurePa / P0, KAPPA));
}

/**
 * Virtual temperature.
 *
 *     Tv = T · (1 + 0.61·w)
 *
 * Buoyancy depends on Tv, not T: moist air is less dense.
 *
 * @source Allen (2006), AIAA 2006-1510, eq. 5 (same 0.61 moisture correction).
 */
export function virtualTemperature(tempK: Kelvin, mixingRatioKgKg: KgPerKg): Kelvin {
  return K(tempK * (1 + 0.61 * mixingRatioKgKg));
}

/**
 * Virtual potential temperature.
 *
 * @source Stull, Practical Meteorology, ch. 3.
 */
export function virtualPotentialTemperature(
  tempK: Kelvin,
  pressurePa: Pascal,
  mixingRatioKgKg: KgPerKg,
): Kelvin {
  return virtualTemperature(potentialTemperature(tempK, pressurePa), mixingRatioKgKg);
}
