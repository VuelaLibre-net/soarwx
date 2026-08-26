/**
 * Usable soaring ceiling and limiting factor diagnosis.
 *
 * Provides the operational ceiling altitude alongside the limiting physical factor
 * (cloudbase, hcrit, boundary layer top, overcast, or absence of convection).
 */

import { m } from "../units/branded.js";
import type { Metres } from "../units/branded.js";
import { at } from "../types/array.js";

export type CeilingLimit =
  "cloudbase" | "hcrit" | "boundary_layer" | "overcast" | "no_convection";

export interface CeilingInput {
  /** Critical climb height from updraft profile. `null` if no convection exists. */
  readonly hcritAglM: Metres | null;
  readonly thermalTopAglM: Metres;
  /** Cumulus cloudbase. `null` for blue thermals or insufficient moisture. */
  readonly cloudBaseAglM: Metres | null;
  /** Overcast cloud cover suppressing convective development. */
  readonly overcast: boolean;
  readonly elevationMslM: Metres;
}

export interface CeilingResult {
  readonly aglM: Metres;
  readonly mslM: Metres;
  readonly limitedBy: CeilingLimit;
}

/**
 * Computes usable ceiling: minimum of critical climb height (hcrit), thermal ceiling,
 * and cumulus cloudbase, declaring the active limiting factor.
 *
 * @source Glendening (DrJack) criteria: `hcrit` as operational ceiling and cloudbase as hard upper bound.
 */
export function usableCeiling(input: CeilingInput): CeilingResult {
  const withElevation = (aglM: number, limitedBy: CeilingLimit): CeilingResult => ({
    aglM: m(Math.max(0, aglM)),
    mslM: m(input.elevationMslM + Math.max(0, aglM)),
    limitedBy,
  });

  if (input.overcast) return withElevation(0, "overcast");
  if (input.hcritAglM === null || input.thermalTopAglM <= 0) {
    return withElevation(0, "no_convection");
  }

  const candidates: [number, CeilingLimit][] = [
    [input.hcritAglM, "hcrit"],
    [input.thermalTopAglM, "boundary_layer"],
  ];
  if (input.cloudBaseAglM !== null) {
    candidates.push([input.cloudBaseAglM, "cloudbase"]);
  }

  let best = at(candidates, 0);
  for (const candidate of candidates) {
    if (candidate[0] < best[0]) best = candidate;
  }

  return withElevation(best[0], best[1]);
}
