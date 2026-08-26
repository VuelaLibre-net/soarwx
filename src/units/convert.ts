/**
 * Conversiones entre las unidades de los bordes y las internas (SI).
 *
 * Toda conversión es exacta y reversible dentro del error de coma flotante:
 * la propiedad P-08 de docs/ACCEPTANCE.md lo verifica.
 */

import { K, Pa, deg, m, mps } from "./branded.js";
import type { Degrees, Kelvin, Metres, MPerS, Pascal } from "./branded.js";
import { T0_CELSIUS } from "./constants.js";

/** Definición internacional exacta del pie. */
const METRES_PER_FOOT = 0.3048;
/** Derivado, no tabulado: 3.28084 no es el recíproco exacto y rompe la ida y vuelta. */
const FEET_PER_METRE = 1 / METRES_PER_FOOT;
const MS_PER_KMH = 1 / 3.6;
const MS_PER_KNOT = 1852 / 3600;
const MS_PER_FPM = METRES_PER_FOOT / 60;

export const celsiusToK = (c: number): Kelvin => K(c + T0_CELSIUS);
export const kToCelsius = (t: Kelvin): number => t - T0_CELSIUS;

export const hPaToPa = (hpa: number): Pascal => Pa(hpa * 100);
export const paToHPa = (p: Pascal): number => p / 100;

export const kmhToMs = (kmh: number): MPerS => mps(kmh * MS_PER_KMH);
export const msToKmh = (v: MPerS): number => v / MS_PER_KMH;

export const knotsToMs = (kt: number): MPerS => mps(kt * MS_PER_KNOT);
export const msToKnots = (v: MPerS): number => v / MS_PER_KNOT;

export const feetToM = (ft: number): Metres => m(ft * METRES_PER_FOOT);
export const mToFeet = (z: Metres): number => z * FEET_PER_METRE;

/** Pies por minuto a metros por segundo. 225 fpm = 1.143 m/s (criterio de hcrit). */
export const fpmToMs = (fpm: number): MPerS => mps(fpm * MS_PER_FPM);
export const msToFpm = (v: MPerS): number => v / MS_PER_FPM;

/** Normaliza un rumbo al intervalo [0, 360). */
export const normaliseBearing = (d: number): Degrees => deg(((d % 360) + 360) % 360);
