/**
 * Soaring forecast scoring configuration.
 *
 * Provides real recalibration: changing factor weights or bands modifies overall ratings (R-10.4).
 */

import type { AircraftProfile } from "../aircraft/profiles.js";
import { DEFAULT_FACTORS } from "./factors.js";
import type { FactorId, FactorSpec } from "./factors.js";
import type { Band } from "./bands.js";
import { DEFAULT_LEVEL_THRESHOLDS } from "./score.js";

export interface ScoringConfig {
  readonly factors?: Partial<Record<FactorId, { weight?: number; band?: Band }>>;
  readonly levelThresholds?: readonly [number, number, number, number];
  readonly profile?: AircraftProfile;
}

export interface ResolvedScoring {
  readonly factors: Readonly<Record<FactorId, FactorSpec>>;
  readonly levelThresholds: readonly [number, number, number, number];
}

/**
 * Merges consumer overrides with default scoring configuration.
 *
 * @source Requirement R-10.4 from docs/REQUIREMENTS.md.
 */
export function resolveScoring(config: ScoringConfig = {}): ResolvedScoring {
  const factors = {} as Record<FactorId, FactorSpec>;
  for (const key of Object.keys(DEFAULT_FACTORS) as FactorId[]) {
    const base = DEFAULT_FACTORS[key];
    const override = config.factors?.[key];
    factors[key] = {
      unit: base.unit,
      rationale: base.rationale,
      weight: override?.weight ?? base.weight,
      band: override?.band ?? base.band,
    };
  }
  return {
    factors,
    levelThresholds: config.levelThresholds ?? DEFAULT_LEVEL_THRESHOLDS,
  };
}
