/**
 * Confianza por dispersión entre modelos.
 *
 * **Con un solo modelo la confianza es `null`**, no un valor inventado
 * (R-12.3). La dispersión entre modelos deterministas tampoco es una
 * probabilidad: es una medida de acuerdo, y así se declara.
 */

import { m, mps } from "../units/branded.js";
import type { MPerS, Metres } from "../units/branded.js";

export type ConfidenceLevel = "low" | "medium" | "high";

export interface Confidence {
  readonly level: ConfidenceLevel;
  readonly ceilingSpreadM: Metres;
  readonly wStarSpreadMs: MPerS;
  readonly modelsUsed: readonly string[];
}

export interface ModelSample {
  readonly model: string;
  readonly ceilingAglM: Metres;
  readonly wStarMs: MPerS;
}

/** Dispersión de techo, en metros, que separa los niveles de confianza. */
export const CEILING_SPREAD_THRESHOLDS_M = { high: 300, medium: 800 } as const;

/**
 * Confianza medida como **dispersión entre modelos**, no inventada.
 *
 * Devuelve `null` con una sola muestra: un modelo solo no permite medir acuerdo,
 * y fingir un número sería peor que no darlo.
 *
 * @source R-12.1 a R-12.3 de docs/REQUIREMENTS.md.
 */
export function confidenceFrom(samples: readonly ModelSample[]): Confidence | null {
  if (samples.length < 2) return null;

  const ceilings = samples.map((s) => s.ceilingAglM);
  const wStars = samples.map((s) => s.wStarMs);
  const ceilingSpread = Math.max(...ceilings) - Math.min(...ceilings);
  const wStarSpread = Math.max(...wStars) - Math.min(...wStars);

  const level: ConfidenceLevel =
    ceilingSpread <= CEILING_SPREAD_THRESHOLDS_M.high
      ? "high"
      : ceilingSpread <= CEILING_SPREAD_THRESHOLDS_M.medium
        ? "medium"
        : "low";

  return {
    level,
    ceilingSpreadM: m(ceilingSpread),
    wStarSpreadMs: mps(wStarSpread),
    modelsUsed: samples.map((s) => s.model),
  };
}
