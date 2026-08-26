/**
 * Presión de vapor de saturación y razones de mezcla.
 */

import { CP, CPV, EPS, LV0, LV_SLOPE, T0_CELSIUS } from "../units/constants.js";
import { kToCelsius } from "../units/convert.js";
import { K, Pa, kgkg } from "../units/branded.js";
import type { KgPerKg, Kelvin, Pascal } from "../units/branded.js";
import { celsiusToK } from "../units/convert.js";
import type { SoarwxError } from "../types/result.js";

/**
 * Rango de validez declarado por Bolton para su ec. 10: error < 0.1 % entre
 * −35 y +35 °C. Fuera de él la función sigue devolviendo un valor, pero el
 * llamante debe anotarlo en `quality`.
 */
export const SATURATION_VALID_RANGE = {
  minK: celsiusToK(-35),
  maxK: celsiusToK(35),
} as const;

/**
 * Presión de vapor de saturación sobre agua líquida.
 *
 *     es = 6.112 · exp( 17.67·T / (T + 243.5) )   [hPa, T en °C]
 *
 * @source Bolton, D. (1980), Monthly Weather Review 108, ec. 10.
 */
export function saturationVapourPressure(tempK: Kelvin): Pascal {
  const tc = kToCelsius(tempK);
  return Pa(611.2 * Math.exp((17.67 * tc) / (tc + 243.5)));
}

/**
 * Comprueba si la temperatura cae dentro del rango de validez de la ec. 10 de
 * Bolton. Devuelve el error a anotar, o `null` si está dentro.
 *
 * @source Bolton, D. (1980), Monthly Weather Review 108, ec. 10 (rango declarado).
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
 * Razón de mezcla de saturación.
 *
 *     ws = ε · es / (p − es)
 *
 * @source Wallace & Hobbs, Atmospheric Science, ec. 3.63.
 */
export function saturationMixingRatio(tempK: Kelvin, pressurePa: Pascal): KgPerKg {
  const es = saturationVapourPressure(tempK);
  return kgkg((EPS * es) / Math.max(pressurePa - es, 1e-6));
}

/**
 * Razón de mezcla a partir del punto de rocío. Es la razón de mezcla de
 * saturación evaluada a la temperatura de rocío.
 *
 * @source Wallace & Hobbs, Atmospheric Science, ec. 3.63.
 */
export function mixingRatio(dewpointK: Kelvin, pressurePa: Pascal): KgPerKg {
  return saturationMixingRatio(dewpointK, pressurePa);
}

/**
 * Humedad relativa respecto al agua líquida, en fracción 0..1.
 *
 * @source Bolton, D. (1980), Monthly Weather Review 108, ec. 10 (vía es).
 */
export function relativeHumidity(tempK: Kelvin, dewpointK: Kelvin): number {
  return saturationVapourPressure(dewpointK) / saturationVapourPressure(tempK);
}

/**
 * Calor latente de vaporización dependiente de la temperatura.
 *
 *     Lv(T) = Lv0 − 2370·(T − 273.15)      [J/kg]
 *
 * Tratarlo como constante introduce un sesgo creciente con la temperatura: en
 * un ascenso pseudoadiabático desde 30 °C y 900 hPa hasta 500 hPa, la θe de
 * Bolton deriva 2.4 K con Lv constante y 0.4 K con esta expresión.
 *
 * @source Wallace & Hobbs, Atmospheric Science, tabla de Lv(T); Bolton (1980) §2.
 */
export function latentHeatOfVaporisation(tempK: Kelvin): number {
  return LV0 - LV_SLOPE * (tempK - T0_CELSIUS);
}

/**
 * Calor específico a presión constante del aire húmedo.
 *
 *     cpm = (1 − q)·cpa + q·cpv
 *
 * Usarlo en vez del valor seco importa: a 45 °C y 40 % de humedad relativa, la
 * diferencia en la altura del LCL es del 1.9 %.
 *
 * @source Romps, D. M. (2017), J. Atmos. Sci. 74, definición de cpm.
 */
export function moistHeatCapacity(specificHumidity: number): number {
  return (1 - specificHumidity) * CP + specificHumidity * CPV;
}

/**
 * Humedad específica a partir de la razón de mezcla.
 *
 *     q = w / (1 + w)
 *
 * @source Wallace & Hobbs, Atmospheric Science, ec. 3.57.
 */
export function specificHumidity(mixingRatioKgKg: KgPerKg): number {
  return mixingRatioKgKg / (1 + mixingRatioKgKg);
}

/**
 * Punto de rocío a partir de la presión de vapor, invirtiendo la ec. 10 de
 * Bolton analíticamente.
 *
 * @source Bolton, D. (1980), Monthly Weather Review 108, ec. 10 (invertida).
 */
export function dewpointFromVapourPressure(vapourPressurePa: Pascal): Kelvin {
  const ratio = Math.log(Math.max(vapourPressurePa, 1e-9) / 611.2);
  return celsiusToK((243.5 * ratio) / (17.67 - ratio));
}

/**
 * Punto de rocío a partir de la razón de mezcla y la presión.
 *
 *     e = w·p / (ε + w)
 *
 * Se usa para dar punto de rocío a los niveles de altura sobre el terreno, que
 * Open-Meteo sirve sin humedad: en la capa mezclada la razón de mezcla se
 * conserva, así que se propaga la de superficie. Es una **suposición**, y el
 * sondeo la declara en `quality.estimated`.
 *
 * @source Wallace & Hobbs, Atmospheric Science, ec. 3.59; Bolton (1980) ec. 10.
 */
export function dewpointFromMixingRatio(
  mixingRatioKgKg: KgPerKg,
  pressurePa: Pascal,
): Kelvin {
  const e = (mixingRatioKgKg * pressurePa) / (EPS + mixingRatioKgKg);
  return dewpointFromVapourPressure(Pa(e));
}

/**
 * Punto de rocío a partir de la humedad relativa.
 *
 * @source Bolton, D. (1980), Monthly Weather Review 108, ec. 10 (invertida).
 */
export function dewpointFromRelativeHumidity(tempK: Kelvin, rhFrac: number): Kelvin {
  const e = rhFrac * saturationVapourPressure(tempK);
  return K(Math.min(dewpointFromVapourPressure(Pa(e)), tempK));
}
