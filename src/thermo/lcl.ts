/**
 * Lifted Condensation Level (LCL).
 *
 * Espy's rule (~122-125 m per degree spread) is not used: compared to Bolton
 * it carries a measured error of up to −5.5 % and is systematically negative at
 * high temperatures, underestimating cloudbase on the best flying days.
 * See docs/REQUIREMENTS.md R-2.2.
 */

import { K, Pa, m } from "../units/branded.js";
import type { Kelvin, Metres, Pascal } from "../units/branded.js";
import { G, KAPPA } from "../units/constants.js";
import { mixingRatio, moistHeatCapacity, specificHumidity } from "./saturation.js";

export interface LclResult {
  /** Temperature at the LCL. */
  readonly tempK: Kelvin;
  /** Pressure at the LCL. */
  readonly pressurePa: Pascal;
  /** Height of the LCL above the parcel starting level. */
  readonly heightAboveParcelM: Metres;
}

/**
 * Temperature at the LCL.
 *
 *     T_LCL = 1 / ( 1/(Td − 56) + ln(T/Td)/800 ) + 56      [K]
 *
 * Author-declared error is less than 0.1 K.
 *
 * @source Bolton, D. (1980), Monthly Weather Review 108, eq. 15.
 */
export function lclTemperature(tempK: Kelvin, dewpointK: Kelvin): Kelvin {
  const td = Math.min(dewpointK, tempK);
  return K(1 / (1 / (td - 56) + Math.log(tempK / td) / 800) + 56);
}

/**
 * Full LCL calculation: temperature, pressure, and height above starting level.
 *
 * Pressure is derived from Poisson's relation, since ascent to the LCL is
 * dry adiabatic and conserves θ.
 *
 * Height uses the specific heat of **moist** air: at 45 °C and 40 % relative
 * humidity, dry cp diverges by 1.9 % from Romps' (2017) exact LCL.
 * With cpm the discrepancy drops to 0.5 %.
 *
 * @source Bolton, D. (1980), Monthly Weather Review 108, eq. 15; Poisson;
 *         Romps, D. M. (2017), J. Atmos. Sci. 74 (use of cpm for height).
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
