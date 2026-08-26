/**
 * Saturation vapour pressure and mixing ratios.
 */

import { CP, CPV, EPS, LV0, LV_SLOPE, T0_CELSIUS } from "../units/constants.js";
import { kToCelsius } from "../units/convert.js";
import { K, Pa, kgkg } from "../units/branded.js";
import type { KgPerKg, Kelvin, Pascal } from "../units/branded.js";
import { celsiusToK } from "../units/convert.js";
import type { SoarwxError } from "../types/result.js";

/**
 * Validity range declared by Bolton for eq. 10: error < 0.1 % between
 * −35 and +35 °C. Outside this range the function still returns a value,
 * but the caller should record it in `quality`.
 */
export const SATURATION_VALID_RANGE = {
  minK: celsiusToK(-35),
  maxK: celsiusToK(35),
} as const;

/**
 * Saturation vapour pressure over liquid water.
 *
 *     es = 6.112 · exp( 17.67·T / (T + 243.5) )   [hPa, T in °C]
 *
 * @source Bolton, D. (1980), Monthly Weather Review 108, eq. 10.
 */
export function saturationVapourPressure(tempK: Kelvin): Pascal {
  const tc = kToCelsius(tempK);
  return Pa(611.2 * Math.exp((17.67 * tc) / (tc + 243.5)));
}

/**
 * Checks whether temperature falls within Bolton (1980) eq. 10 validity range.
 * Returns the error to record, or `null` if within range.
 *
 * @source Bolton, D. (1980), Monthly Weather Review 108, eq. 10 (declared range).
 */
export function checkSaturationRange(tempK: Kelvin): SoarwxError | null {
  const { minK, maxK } = SATURATION_VALID_RANGE;
  if (tempK >= minK && tempK <= maxK) return null;
  return {
    code: "OUT_OF_VALID_RANGE",
    message: "saturationVapourPressure outside Bolton (1980) validity range",
    detail: { tempK, minK, maxK },
  };
}

/**
 * Saturation mixing ratio.
 *
 *     ws = ε · es / (p − es)
 *
 * @source Wallace & Hobbs, Atmospheric Science, eq. 3.63.
 */
export function saturationMixingRatio(tempK: Kelvin, pressurePa: Pascal): KgPerKg {
  const es = saturationVapourPressure(tempK);
  return kgkg((EPS * es) / Math.max(pressurePa - es, 1e-6));
}

/**
 * Mixing ratio from dewpoint. Equivalent to the saturation mixing ratio
 * evaluated at the dewpoint temperature.
 *
 * @source Wallace & Hobbs, Atmospheric Science, eq. 3.63.
 */
export function mixingRatio(dewpointK: Kelvin, pressurePa: Pascal): KgPerKg {
  return saturationMixingRatio(dewpointK, pressurePa);
}

/**
 * Relative humidity with respect to liquid water, as fraction 0..1.
 *
 * @source Bolton, D. (1980), Monthly Weather Review 108, eq. 10 (via es).
 */
export function relativeHumidity(tempK: Kelvin, dewpointK: Kelvin): number {
  return saturationVapourPressure(dewpointK) / saturationVapourPressure(tempK);
}

/**
 * Temperature-dependent latent heat of vaporisation.
 *
 *     Lv(T) = Lv0 − 2370·(T − 273.15)      [J/kg]
 *
 * Treating Lv as constant introduces bias that grows with temperature: in a
 * pseudoadiabatic ascent from 30 °C and 900 hPa to 500 hPa, Bolton's θe
 * drifts 2.4 K with constant Lv and 0.4 K with this formula.
 *
 * @source Wallace & Hobbs, Atmospheric Science, table of Lv(T); Bolton (1980) §2.
 */
export function latentHeatOfVaporisation(tempK: Kelvin): number {
  return LV0 - LV_SLOPE * (tempK - T0_CELSIUS);
}

/**
 * Specific heat of moist air at constant pressure.
 *
 *     cpm = (1 − q)·cpa + q·cpv
 *
 * Using moist rather than dry air matters: at 45 °C and 40 % relative humidity,
 * the difference in LCL height is 1.9 %.
 *
 * @source Romps, D. M. (2017), J. Atmos. Sci. 74, definition of cpm.
 */
export function moistHeatCapacity(specificHumidity: number): number {
  return (1 - specificHumidity) * CP + specificHumidity * CPV;
}

/**
 * Specific humidity from mixing ratio.
 *
 *     q = w / (1 + w)
 *
 * @source Wallace & Hobbs, Atmospheric Science, eq. 3.57.
 */
export function specificHumidity(mixingRatioKgKg: KgPerKg): number {
  return mixingRatioKgKg / (1 + mixingRatioKgKg);
}

/**
 * Dewpoint from vapour pressure by analytical inversion of Bolton eq. 10.
 *
 * @source Bolton, D. (1980), Monthly Weather Review 108, eq. 10 (inverted).
 */
export function dewpointFromVapourPressure(vapourPressurePa: Pascal): Kelvin {
  const ratio = Math.log(Math.max(vapourPressurePa, 1e-9) / 611.2);
  return celsiusToK((243.5 * ratio) / (17.67 - ratio));
}

/**
 * Dewpoint from mixing ratio and pressure.
 *
 *     e = w·p / (ε + w)
 *
 * Used to supply dewpoint for above-ground height levels, which Open-Meteo
 * serves without moisture: in the mixed layer, mixing ratio is conserved,
 * so the surface value is propagated upward. This is an **estimate**, and the
 * sounding declares it in `quality.estimated`.
 *
 * @source Wallace & Hobbs, Atmospheric Science, eq. 3.59; Bolton (1980) eq. 10.
 */
export function dewpointFromMixingRatio(
  mixingRatioKgKg: KgPerKg,
  pressurePa: Pascal,
): Kelvin {
  const e = (mixingRatioKgKg * pressurePa) / (EPS + mixingRatioKgKg);
  return dewpointFromVapourPressure(Pa(e));
}

/**
 * Dewpoint from relative humidity.
 *
 * @source Bolton, D. (1980), Monthly Weather Review 108, eq. 10 (inverted).
 */
export function dewpointFromRelativeHumidity(tempK: Kelvin, rhFrac: number): Kelvin {
  const e = rhFrac * saturationVapourPressure(tempK);
  return K(Math.min(dewpointFromVapourPressure(Pa(e)), tempK));
}
