/**
 * Configuración de puntuación.
 *
 * La configuración **recalibra de verdad**: cambiar un peso cambia el nivel.
 * No es decorativa (R-10.4).
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
 * Mezcla la configuración del consumidor con los valores por defecto.
 *
 * @source R-10.4 de docs/REQUIREMENTS.md.
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
