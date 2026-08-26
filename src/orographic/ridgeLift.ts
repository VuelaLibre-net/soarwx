/**
 * Orographic ridge lift computation.
 *
 * Topographic geometry is provided via `RidgeSpec`: ridge crest bearing, face slope,
 * and crest elevation.
 */

import { mps } from "../units/branded.js";
import type { MPerS } from "../units/branded.js";
import { toComponents } from "../sounding/wind.js";
import type { WindVector } from "../sounding/types.js";
import type { RidgeSpec } from "../types/site.js";

export type RidgeLiftBand = "insufficient" | "marginal" | "optimal" | "dangerous";

export interface RidgeLiftResult {
  /** Wind component perpendicular to ridge line, absolute magnitude. */
  readonly perpendicularMs: MPerS;
  /** Vertical wind velocity forced upward by ridge slope. */
  readonly verticalMs: MPerS;
  /** Angle between wind vector and ridge normal, 0° = direct headwind. */
  readonly incidenceDeg: number;
  readonly band: RidgeLiftBand;
}

/**
 * Perpendicular wind speed thresholds in m/s (approx 8, 15, and 28 kt).
 *
 * Empirical soaring thresholds exposed as constants for customization.
 */
export const RIDGE_LIFT_THRESHOLDS_MS = {
  marginal: 4.1,
  optimal: 7.7,
  dangerous: 14.4,
} as const;

const DEG_TO_RAD = Math.PI / 180;

/**
 * Computes orographic ridge lift from wind at crest altitude.
 *
 *     U⊥ = |wind · n|,  n normal to ridge crest
 *     w  = U⊥ · sin(slope)
 *
 * Vertical velocity is derived from genuine ridge slope geometry.
 *
 * @source Forced airflow over topography; Stull, Practical Meteorology, ch. 17.
 */
export function ridgeLift(ridge: RidgeSpec, windAtCrest: WindVector): RidgeLiftResult {
  const wind = toComponents(windAtCrest.speedMs, windAtCrest.fromDeg);

  // Normal vector to ridge in horizontal plane.
  const bearing = ridge.bearingDeg * DEG_TO_RAD;
  const normalX = Math.cos(bearing);
  const normalY = -Math.sin(bearing);

  const signed = wind.uMs * normalX + wind.vMs * normalY;
  const perpendicular = Math.abs(signed);
  const vertical = perpendicular * Math.sin(ridge.slopeDeg * DEG_TO_RAD);

  const incidenceDeg =
    windAtCrest.speedMs <= 0
      ? 90
      : Math.acos(Math.min(1, perpendicular / windAtCrest.speedMs)) / DEG_TO_RAD;

  return {
    perpendicularMs: mps(perpendicular),
    verticalMs: mps(vertical),
    incidenceDeg,
    band: classify(perpendicular),
  };
}

function classify(perpendicularMs: number): RidgeLiftBand {
  if (perpendicularMs >= RIDGE_LIFT_THRESHOLDS_MS.dangerous) return "dangerous";
  if (perpendicularMs >= RIDGE_LIFT_THRESHOLDS_MS.optimal) return "optimal";
  if (perpendicularMs >= RIDGE_LIFT_THRESHOLDS_MS.marginal) return "marginal";
  return "insufficient";
}
