/**
 * Mountain wave soaring potential.
 *
 * Evaluates trapped lee wave potential via Scorer parameter vertical profile,
 * falling back to wind-and-geometry heuristics when sounding does not span both layers.
 */

import { m } from "../units/branded.js";
import type { MPerS, Metres } from "../units/branded.js";
import { ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import { interpolateAtHeight } from "../sounding/interpolate.js";
import type { Sounding, WindVector } from "../sounding/types.js";
import type { RidgeSpec } from "../types/site.js";
import { scorerParameter } from "./scorer.js";
import { ridgeLift } from "./ridgeLift.js";

export type WavePotential = "none" | "marginal" | "likely" | "strong";
export type WaveMethod = "scorer" | "heuristic";

export interface WaveResult {
  readonly potential: WavePotential;
  /** Evaluation method utilized: Scorer profile or geometric heuristic. */
  readonly method: WaveMethod;
  readonly trappedLeeWave: boolean;
  readonly estimatedWavelengthM: Metres | null;
  /** Cross-ridge perpendicular wind component at crest altitude. */
  readonly crossRidgeMs: MPerS;
  readonly reason: string;
}

/** Lower layer depth above crest used for Scorer parameter comparison. */
export const LOWER_LAYER_DEPTH_M = 1500;
/** Top altitude of upper layer used for Scorer parameter comparison. */
export const UPPER_LAYER_TOP_M = 4000;

/** Minimum cross-ridge perpendicular wind speed threshold (approx 15 kt). */
export const MIN_CROSS_RIDGE_MS = 7.5;

/**
 * Evaluates lee wave potential downwind of a mountain ridge.
 *
 * Scorer trapping criterion: waves are trapped when Scorer parameter drops
 * from lower to upper layer by more than π²/(4·d²), where `d` is lower layer depth.
 *
 * @source Scorer, R. S. (1949), Quarterly Journal of the RMS 75, 41-56.
 */
export function wavePotential(sounding: Sounding, ridge: RidgeSpec): Result<WaveResult> {
  const crestWind = interpolateAtHeight(sounding, ridge.crestMslM);
  const wind: WindVector = crestWind.ok
    ? { speedMs: crestWind.value.windSpeedMs, fromDeg: crestWind.value.windFromDeg }
    : { speedMs: sounding.surface.windSpeedMs, fromDeg: sounding.surface.windFromDeg };

  const lift = ridgeLift(ridge, wind);
  const crossRidgeMs = lift.perpendicularMs;

  if (crossRidgeMs < MIN_CROSS_RIDGE_MS) {
    return ok({
      potential: "none",
      method: crestWind.ok ? "scorer" : "heuristic",
      trappedLeeWave: false,
      estimatedWavelengthM: null,
      crossRidgeMs,
      reason: "cross_ridge_wind_too_weak",
    });
  }

  const flowTowardDeg = (wind.fromDeg + 180) % 360;
  const scorer = scorerParameter(sounding, flowTowardDeg);

  if (!scorer.ok) {
    // Fallback: without usable Scorer profile, evaluate wind threshold.
    return ok({
      potential: crossRidgeMs >= MIN_CROSS_RIDGE_MS * 1.5 ? "marginal" : "none",
      method: "heuristic",
      trappedLeeWave: false,
      estimatedWavelengthM: null,
      crossRidgeMs,
      reason: "no_usable_scorer_profile",
    });
  }

  const lower = meanScorer(
    scorer.value,
    ridge.crestMslM,
    ridge.crestMslM + LOWER_LAYER_DEPTH_M,
  );
  const upper = meanScorer(
    scorer.value,
    ridge.crestMslM + LOWER_LAYER_DEPTH_M,
    ridge.crestMslM + UPPER_LAYER_TOP_M,
  );

  if (lower === null || upper === null) {
    return ok({
      potential: "none",
      method: "heuristic",
      trappedLeeWave: false,
      estimatedWavelengthM: null,
      crossRidgeMs,
      reason: "sounding_does_not_span_both_layers",
    });
  }

  const trappingThreshold = Math.PI ** 2 / (4 * LOWER_LAYER_DEPTH_M ** 2);
  const drop = lower - upper;
  const trappedLeeWave = drop > trappingThreshold && lower > 0;

  const wavelength = lower > 0 ? m((2 * Math.PI) / Math.sqrt(lower)) : null;

  return ok({
    potential: gradePotential(trappedLeeWave, drop, trappingThreshold, crossRidgeMs),
    method: "scorer",
    trappedLeeWave,
    estimatedWavelengthM: wavelength,
    crossRidgeMs,
    reason: trappedLeeWave
      ? "scorer_drop_exceeds_trapping_threshold"
      : "scorer_drop_insufficient",
  });
}

function meanScorer(
  points: readonly { mslM: Metres; scorerSquaredPerM2: number }[],
  baseMslM: number,
  topMslM: number,
): number | null {
  const inside = points.filter((p) => p.mslM >= baseMslM && p.mslM <= topMslM);
  if (inside.length === 0) return null;
  return inside.reduce((sum, p) => sum + p.scorerSquaredPerM2, 0) / inside.length;
}

/** Multiplier on Scorer trapping threshold required for strong wave rating. */
export const STRONG_WAVE_DROP_FACTOR = 2;

function gradePotential(
  trapped: boolean,
  drop: number,
  threshold: number,
  crossRidgeMs: number,
): WavePotential {
  if (!trapped) return drop > 0 ? "marginal" : "none";
  if (
    drop > threshold * STRONG_WAVE_DROP_FACTOR &&
    crossRidgeMs >= MIN_CROSS_RIDGE_MS * 1.6
  ) {
    return "strong";
  }
  return "likely";
}
