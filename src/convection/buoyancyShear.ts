/**
 * Thermal quality: buoyancy versus shear.
 *
 * DrJack defines B/S as "the ratio of buoyant to shear production of
 * turbulence", giving two empirical thresholds: **B/S ≤ 5** thermals are
 * broken up and unusable; **B/S ≥ 10** shear ceases to be a factor.
 * DrJack himself cautions that "the usable/unusable separation criterion must
 * be determined empirically".
 *
 * Here we use the **velocity scale ratio `w* / u*`**, which is the standard
 * dimensionless parameter distinguishing buoyancy-driven from shear-driven
 * boundary layers, applying DrJack's empirical thresholds. We also expose
 * `obukhovStabilityIndex`, the Obukhov stability parameter, making the
 * approximation explicit:
 *
 *     −zi/L = κ · (w* / u*)³
 *
 * **This mapping has not been verified against RASP's private implementation.**
 * It is noted in docs/AUDIT.md as an approximation awaiting validation.
 */

import { mps } from "../units/branded.js";
import type { MPerS, Metres } from "../units/branded.js";
import { err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";

/** Von Kármán constant. */
export const VON_KARMAN = 0.4;

/** Reference height for surface wind. */
export const SURFACE_WIND_HEIGHT_M = 10;

export type ThermalQuality = "broken" | "tilted" | "organised";

/** DrJack's empirical thresholds. */
export const BROKEN_THRESHOLD = 5;
export const ORGANISED_THRESHOLD = 10;

export interface BuoyancyShearInput {
  readonly wStarMs: MPerS;
  readonly surfaceWindMs: MPerS;
  readonly roughnessLengthM: Metres;
  readonly windHeightM?: Metres;
}

export interface BuoyancyShearResult {
  /** Velocity ratio w* / u*. Thresholds are evaluated against this value. */
  readonly ratio: number;
  readonly frictionVelocityMs: MPerS;
  /** Obukhov stability parameter, κ·(w* / u*)³. Exposed for transparency. */
  readonly obukhovStabilityIndex: number;
  readonly quality: ThermalQuality;
}

/**
 * Friction velocity from logarithmic wind profile law.
 *
 *     u* = κ·U(z) / ln(z/z0)
 *
 * Strictly valid for neutral conditions. In a convective boundary layer the
 * profile deviates, so this is an estimate rather than a direct measurement.
 *
 * @source Logarithmic wind profile law; Stull, Practical Meteorology, ch. 18.
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
 * Buoyancy to shear ratio and resulting thermal organisation quality.
 *
 * @source Glendening (DrJack), RASP BLIPMAP, B/S parameter and thresholds;
 *         Stull, Practical Meteorology, ch. 18 (w* and u* scales, Obukhov length).
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
    // Calm wind: shear cannot disrupt thermals.
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
