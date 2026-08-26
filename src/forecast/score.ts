/**
 * Soaring index aggregation and rating.
 */

import { at } from "../types/array.js";
import type { Factor, FactorId } from "./factors.js";
import { FACTOR_OK_THRESHOLD } from "./factors.js";
import type { Veto } from "./vetoes.js";
import { vetoCap } from "./vetoes.js";

export type SoaringLevel = 1 | 2 | 3 | 4 | 5;

export interface SoaringScore {
  /** Weighted average score across all factors, normalized to [0, 1]. */
  readonly value: number;
  readonly level: SoaringLevel;
  /** Rating level prior to veto application, revealing veto capping impact. */
  readonly levelBeforeVetoes: SoaringLevel;
  readonly factors: readonly Factor[];
  readonly vetoes: readonly Veto[];
  /** Factors falling below the OK threshold, sorted from lowest score to highest. */
  readonly limitingFactors: readonly FactorId[];
}

/**
 * Default aggregated score thresholds separating the 5 soaring rating levels.
 */
export const DEFAULT_LEVEL_THRESHOLDS: readonly [number, number, number, number] = [
  0.3, 0.58, 0.78, 0.9,
];

/**
 * Computes soaring index from individual factor scores and veto conditions.
 *
 * Level 5 requires **all** individual factors to meet OK threshold (score >= 0.6).
 *
 * @source Requirements R-10.1 through R-10.5 from docs/REQUIREMENTS.md.
 */
export function aggregate(
  factors: readonly Factor[],
  vetoes: readonly Veto[],
  thresholds: readonly [number, number, number, number] = DEFAULT_LEVEL_THRESHOLDS,
): SoaringScore {
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const value =
    totalWeight > 0
      ? factors.reduce((sum, f) => sum + f.score * f.weight, 0) / totalWeight
      : 0;

  let level = levelFor(value, thresholds);
  if (level === 5 && factors.some((f) => !f.ok)) level = 4;
  const levelBeforeVetoes = level;

  const cap = vetoCap(vetoes);
  const finalLevel: SoaringLevel = level < cap ? level : cap;

  const limitingFactors = factors
    .filter((f) => f.score < FACTOR_OK_THRESHOLD)
    .sort((a, b) => a.score - b.score)
    .map((f) => f.id);

  return {
    value,
    level: finalLevel,
    levelBeforeVetoes,
    factors,
    vetoes,
    limitingFactors,
  };
}

function levelFor(
  value: number,
  thresholds: readonly [number, number, number, number],
): SoaringLevel {
  if (value >= at(thresholds, 3)) return 5;
  if (value >= at(thresholds, 2)) return 4;
  if (value >= at(thresholds, 1)) return 3;
  if (value >= at(thresholds, 0)) return 2;
  return 1;
}
