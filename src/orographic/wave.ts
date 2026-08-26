/**
 * Potencial de onda de montaña.
 *
 * El método principal es el parámetro de Scorer. El heurístico de viento y
 * sector existe solo como respaldo cuando el sondeo no llega por encima de la
 * cresta, y **el resultado siempre declara cuál de los dos se usó**: el
 * predecesor mezclaba ambos sin distinguirlos, y con el sector angular escrito
 * en el comentario distinto del programado.
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
  /** Siempre presente: el consumidor tiene derecho a saber de dónde sale. */
  readonly method: WaveMethod;
  readonly trappedLeeWave: boolean;
  readonly estimatedWavelengthM: Metres | null;
  /** Componente del viento perpendicular a la cresta, a la altura de la cresta. */
  readonly crossRidgeMs: MPerS;
  readonly reason: string;
}

/** Espesor de la capa baja sobre la cresta que se compara con la de arriba. */
export const LOWER_LAYER_DEPTH_M = 1500;
/** Techo de la capa alta que se compara con la baja. */
export const UPPER_LAYER_TOP_M = 4000;

/** Viento perpendicular mínimo para plantearse onda, en m/s (unos 15 nudos). */
export const MIN_CROSS_RIDGE_MS = 7.5;

/**
 * Potencial de onda a sotavento de una cresta.
 *
 * Criterio de atrapamiento de Scorer: la onda queda atrapada cuando el
 * parámetro cae de la capa baja a la alta más de π²/(4·d²), con `d` el espesor
 * de la capa baja.
 *
 * @source Scorer, R. S. (1949), Quarterly Journal of the RMS 75, 41-56;
 *         criterio de onda atrapada.
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
    // Respaldo declarado: sin perfil utilizable solo queda el viento.
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

/**
 * El criterio de Scorer marca el **mínimo** para que exista el primer modo
 * atrapado. Duplicarlo deja margen para una onda bien desarrollada, y con
 * viento perpendicular holgado se califica de fuerte. El factor 2 es una
 * elección declarada, no un resultado.
 */
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
