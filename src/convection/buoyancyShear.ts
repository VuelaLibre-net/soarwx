/**
 * Calidad de la térmica: boyancia frente a cizalladura.
 *
 * DrJack define B/S como «la relación entre la producción boyante y la
 * producción por cizalladura de turbulencia», y da dos umbrales empíricos:
 * **B/S ≤ 5** las térmicas se rompen y no son utilizables; **B/S ≥ 10** la
 * cizalladura deja de ser un factor. Él mismo advierte de que «el criterio de
 * separación entre utilizable e inutilizable hay que determinarlo
 * empíricamente».
 *
 * Aquí se usa el **cociente de escalas de velocidad `w* / u*`**, que es la
 * magnitud adimensional estándar para separar capas límite dominadas por
 * boyancia de las dominadas por cizalladura, y se le aplican los umbrales de
 * DrJack. Se expone también `obukhovStabilityIndex`, el parámetro de estabilidad de
 * Obukhov, para que la aproximación quede a la vista:
 *
 *     −zi/L = κ · (w* / u*)³
 *
 * **Esta correspondencia no está verificada contra la implementación original
 * de RASP**, que no es pública. Queda anotada en docs/AUDIT.md como
 * aproximación pendiente de validar.
 */

import { mps } from "../units/branded.js";
import type { MPerS, Metres } from "../units/branded.js";
import { err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";

/** Constante de von Kármán. */
export const VON_KARMAN = 0.4;

/** Altura de referencia del viento de superficie. */
export const SURFACE_WIND_HEIGHT_M = 10;

export type ThermalQuality = "broken" | "tilted" | "organised";

/** Umbrales empíricos de DrJack. */
export const BROKEN_THRESHOLD = 5;
export const ORGANISED_THRESHOLD = 10;

export interface BuoyancyShearInput {
  readonly wStarMs: MPerS;
  readonly surfaceWindMs: MPerS;
  readonly roughnessLengthM: Metres;
  readonly windHeightM?: Metres;
}

export interface BuoyancyShearResult {
  /** Cociente w* / u*. Es sobre este valor sobre el que se aplican los umbrales. */
  readonly ratio: number;
  readonly frictionVelocityMs: MPerS;
  /** Parámetro de estabilidad de Obukhov, κ·(w* / u*)³. Expuesto para no ocultar la aproximación. */
  readonly obukhovStabilityIndex: number;
  readonly quality: ThermalQuality;
}

/**
 * Velocidad de fricción por la ley logarítmica del viento.
 *
 *     u* = κ·U(z) / ln(z/z0)
 *
 * Vale para condiciones neutras. En una capa límite convectiva la ley se
 * desvía, así que esto es una estimación y no una medida.
 *
 * @source Ley logarítmica del perfil de viento; Stull, Practical Meteorology, cap. 18.
 */
export function frictionVelocity(
  surfaceWindMs: MPerS,
  roughnessLengthM: Metres,
  windHeightM: number = SURFACE_WIND_HEIGHT_M,
): number {
  const z0 = Math.max(roughnessLengthM, 1e-5);
  const ratio = Math.max(windHeightM / z0, Math.E);
  return (VON_KARMAN * surfaceWindMs) / Math.log(ratio);
}

/**
 * Relación boyancia/cizalladura y calidad resultante de la térmica.
 *
 * @source Glendening (DrJack), RASP BLIPMAP, parámetro B/S y sus umbrales;
 *         Stull, Practical Meteorology, cap. 18 (escalas w* y u*, longitud de Obukhov).
 */
export function buoyancyShearRatio(
  input: BuoyancyShearInput,
): Result<BuoyancyShearResult> {
  if (input.wStarMs <= 0) {
    return err("NO_CONVECTION", "no convective velocity scale", {
      wStarMs: input.wStarMs,
    });
  }

  const uStar = frictionVelocity(
    input.surfaceWindMs,
    input.roughnessLengthM,
    input.windHeightM,
  );

  if (uStar <= 1e-6) {
    // Viento en calma: la cizalladura no puede romper nada.
    return ok({
      ratio: Infinity,
      frictionVelocityMs: mps(uStar),
      obukhovStabilityIndex: Infinity,
      quality: "organised",
    });
  }

  const ratio = input.wStarMs / uStar;
  return ok({
    ratio,
    frictionVelocityMs: mps(uStar),
    obukhovStabilityIndex: VON_KARMAN * Math.pow(ratio, 3),
    quality: classify(ratio),
  });
}

function classify(ratio: number): ThermalQuality {
  if (ratio <= BROKEN_THRESHOLD) return "broken";
  if (ratio >= ORGANISED_THRESHOLD) return "organised";
  return "tilted";
}
