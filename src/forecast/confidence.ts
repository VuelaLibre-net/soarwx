/**
 * Forecast confidence via multi-model spread.
 *
 * **With only a single model available, confidence is `null`** (R-12.3).
 * Spread across deterministic weather models measures consensus rather than Bayesian probability.
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

/** Ceiling spread thresholds in metres separating confidence tiers. */
export const CEILING_SPREAD_THRESHOLDS_M = { high: 300, medium: 800 } as const;

/**
 * Computes forecast confidence from multi-model spread.
 *
 * Returns `null` when fewer than 2 model samples are provided.
 *
 * @source Requirements R-12.1 through R-12.3 from docs/REQUIREMENTS.md.
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
