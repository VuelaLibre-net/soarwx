/**
 * Forecast veto mechanisms.
 *
 * **Vetoes cap maximum ratings rather than subtracting points** (R-10.3).
 * For example, an overcast sky caps the day at Level 1, regardless of other parameters.
 */

import type { CapeRisk } from "../stability/capeRisk.js";
import type { Metres } from "../units/branded.js";

export type VetoId =
  | "no_convection"
  | "overcast"
  | "ceiling_too_low"
  | "stable_atmosphere"
  | "cape_severe"
  | "cape_with_storm_index"
  | "wind_too_strong";

export type VetoLevel = 1 | 2 | 3;

export interface Veto {
  readonly id: VetoId;
  readonly capsAtLevel: VetoLevel;
  /** Reason key matching localized pilot message dictionaries. */
  readonly reason: VetoId;
}

/** Usable ceiling threshold below which soaring is not viable. */
export const UNUSABLE_CEILING_AGL_M = 800;
/** CAPE threshold above which severe storm veto triggers, in J/kg. */
export const SEVERE_CAPE_JKG = 3500;
/** K-Index threshold above which elevated CAPE is considered stormy. */
export const STORM_K_INDEX = 25;
/** Surface wind speed threshold triggering strong wind veto, in m/s (25 kt). */
export const STRONG_WIND_MS = 12.87;
/**
 * Usable ceiling threshold below which upper-air atmospheric stability limits soaring.
 *
 * Above this height the convective boundary layer is deep enough for cross-country soaring
 * even under positive lifted index aloft.
 */
export const CAPPED_CEILING_AGL_M = 1500;
/** Lifted Index threshold above which upper stability is pronounced. */
export const STRONGLY_STABLE_LI = 2;

export interface VetoInput {
  readonly hasConvection: boolean;
  readonly overcast: boolean;
  readonly usableCeilingAglM: Metres;
  readonly liftedIndex: number | null;
  readonly cape: CapeRisk;
  readonly kIndex: number | null;
  readonly surfaceWindMs: number;
}

/**
 * Evaluates applicable vetoes for a forecast hour.
 *
 * A missing index does **not** trigger a veto: `liftedIndex === null` indicates
 * that the level was unavailable, not that it was zero.
 *
 * A positive Lifted Index does not veto by itself: it describes stability aloft
 * above the boundary layer, not within it (R-10.6).
 *
 * @source Requirements R-10.3, R-10.6, and R-7.2 from docs/REQUIREMENTS.md;
 *         CAPE bands from Glendening (DrJack).
 */
export function evaluateVetoes(input: VetoInput): readonly Veto[] {
  const vetoes: Veto[] = [];
  const add = (id: VetoId, capsAtLevel: VetoLevel): void => {
    vetoes.push({ id, capsAtLevel, reason: id });
  };

  if (!input.hasConvection) add("no_convection", 1);
  if (input.overcast) add("overcast", 1);
  if (input.usableCeilingAglM < UNUSABLE_CEILING_AGL_M) add("ceiling_too_low", 2);

  // Lifted Index evaluates parcel lifted to 500 hPa: it measures deep convection aloft.
  // A 3000 m boundary layer with LI +1.6 is an excellent soaring day. Stability only
  // caps ratings when convective depth is restricted (< 1500 m AGL).
  if (
    input.liftedIndex !== null &&
    input.liftedIndex >= 0 &&
    input.usableCeilingAglM < CAPPED_CEILING_AGL_M
  ) {
    add("stable_atmosphere", input.liftedIndex > STRONGLY_STABLE_LI ? 2 : 3);
  }

  const capeJkg = input.cape.capeJkg;
  if (capeJkg !== null && capeJkg > SEVERE_CAPE_JKG) {
    add("cape_severe", 2);
  } else if (input.cape.stormPotential && (input.kIndex ?? -Infinity) > STORM_K_INDEX) {
    add("cape_with_storm_index", 2);
  }

  if (input.surfaceWindMs > STRONG_WIND_MS) add("wind_too_strong", 3);

  return vetoes;
}

/** Maximum soaring rating permitted across all active vetoes. */
export function vetoCap(vetoes: readonly Veto[]): 1 | 2 | 3 | 4 | 5 {
  let cap: 1 | 2 | 3 | 4 | 5 = 5;
  for (const veto of vetoes) {
    if (veto.capsAtLevel < cap) cap = veto.capsAtLevel;
  }
  return cap;
}
