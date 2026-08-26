/**
 * Soaring index factor breakdown.
 *
 * Each factor exposes its raw value, unit, score, weight, and scoring band (R-10.2).
 *
 * **CAPE is excluded from positive scoring factors** and operates strictly as a veto mechanism.
 */

import type { Band } from "./bands.js";
import { scoreBand } from "./bands.js";

export type FactorId =
  | "climb_strength"
  | "usable_ceiling"
  | "lapse_rate"
  | "thermal_quality"
  | "surface_wind"
  | "moisture"
  | "cloud_cover";

export interface Factor {
  readonly id: FactorId;
  /** Raw parameter value in designated units. */
  readonly value: number;
  readonly unit: string;
  /** Normalized score in [0, 1]. */
  readonly score: number;
  readonly weight: number;
  readonly band: Band;
  /** True when factor score meets or exceeds 0.6. */
  readonly ok: boolean;
}

export interface FactorSpec {
  readonly unit: string;
  readonly weight: number;
  readonly band: Band;
  /** Physical rationale for assigned band and weighting. */
  readonly rationale: string;
}

const INF = Number.POSITIVE_INFINITY;

/**
 * Default soaring scoring factor configuration calibrated for gliders.
 *
 * @source Glendening (DrJack) thresholds where published (thermal quality, surface wind);
 *         standard soaring conventions for remaining parameters.
 */
export const DEFAULT_FACTORS: Readonly<Record<FactorId, FactorSpec>> = {
  climb_strength: {
    unit: "m/s",
    weight: 2,
    band: { idealMin: 2, idealMax: INF, zeroMin: 0.4, zeroMax: INF },
    rationale:
      "Expected variometer climb averaged across working band, accounting for circling sink of chosen aircraft polar. Below 0.4 m/s circling is unproductive; above 2 m/s soaring conditions are comfortable.",
  },
  usable_ceiling: {
    unit: "m AGL",
    weight: 2,
    band: { idealMin: 1800, idealMax: INF, zeroMin: 400, zeroMax: INF },
    rationale:
      "Operational soaring ceiling. Below 400 m AGL cross-country flight is impractical; 1800 m AGL provides safe gliding transitions.",
  },
  lapse_rate: {
    unit: "K/km",
    weight: 1.5,
    band: { idealMin: 7, idealMax: INF, zeroMin: 2, zeroMax: INF },
    rationale:
      "Thermal lapse rate in boundary layer. Approaching dry adiabatic (9.8 K/km) buoyancy is strong; below 2 K/km layer is stabilized.",
  },
  thermal_quality: {
    unit: "w*/u*",
    weight: 1.5,
    band: { idealMin: 10, idealMax: INF, zeroMin: 5, zeroMax: INF },
    rationale:
      "Buoyancy-to-shear ratio. DrJack thresholds: <=5 disrupts and breaks thermals, >=10 maintains organised thermal columns.",
  },
  surface_wind: {
    unit: "m/s",
    weight: 1.5,
    band: { idealMin: 0, idealMax: 7.7, zeroMin: -INF, zeroMax: 15.4 },
    rationale:
      "Surface wind speed. Up to 15 kt wind has little negative impact; above 30 kt soaring becomes hazardous.",
  },
  moisture: {
    unit: "K",
    weight: 1,
    band: { idealMin: 8, idealMax: 20, zeroMin: 2, zeroMax: 35 },
    rationale:
      "Mixed-layer dewpoint depression. Very low spread risks overdevelopment; very high spread produces blue thermal days with no cloud cues.",
  },
  cloud_cover: {
    unit: "fraction",
    weight: 1,
    band: { idealMin: 0, idealMax: 0.3, zeroMin: -INF, zeroMax: 0.8 },
    rationale:
      "Total cloud fraction. Scattered cumulus marks thermals; above 0.8 solar insolation drops sharply, shutting down convection.",
  },
};

/** Minimum factor score threshold for `ok` status. */
export const FACTOR_OK_THRESHOLD = 0.6;

/**
 * Builds a scoring factor from its raw value and specification.
 *
 * @source Requirement R-10.2 from docs/REQUIREMENTS.md.
 */
export function buildFactor(id: FactorId, value: number, spec: FactorSpec): Factor {
  const score = scoreBand(value, spec.band);
  return {
    id,
    value,
    unit: spec.unit,
    score,
    weight: spec.weight,
    band: spec.band,
    ok: score >= FACTOR_OK_THRESHOLD,
  };
}
