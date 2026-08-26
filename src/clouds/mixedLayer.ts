/**
 * Mixed layer mean properties.
 *
 * Cumulus cloudbase is derived from the mass-weighted mean mixing ratio of the
 * convective boundary layer rather than 2-meter surface moisture.
 */

import { K, kgkg, m } from "../units/branded.js";
import type { Kelvin, KgPerKg, Metres } from "../units/branded.js";
import { err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import { mixingRatio } from "../thermo/saturation.js";
import { potentialTemperature } from "../thermo/potential.js";
import { consecutivePairs } from "../types/array.js";
import type { Sounding } from "../sounding/types.js";

export interface MixedLayerResult {
  /** Mass-weighted mean mixing ratio across mixed layer. */
  readonly meanMixingRatioKgKg: KgPerKg;
  /** Mass-weighted mean potential temperature across mixed layer. */
  readonly meanPotentialTempK: Kelvin;
  readonly topAglM: Metres;
  readonly levelsUsed: number;
}

/**
 * Mass-weighted averages (weighted by layer pressure depth) from surface
 * up to mixed layer top.
 *
 * @source Mixed-layer parcel definition; Stull, Practical Meteorology, ch. 5 & 18.
 */
export function mixedLayerMean(
  sounding: Sounding,
  topAglM: Metres,
): Result<MixedLayerResult> {
  const topMslM = sounding.site.elevationMslM + topAglM;

  let weight = 0;
  let mixingSum = 0;
  let thetaSum = 0;
  let levelsUsed = 0;

  for (const [lower, upper] of consecutivePairs(sounding.levels)) {
    if (lower.geopotentialMslM >= topMslM) break;

    // Segment is clamped at mixed layer top.
    const fraction =
      upper.geopotentialMslM <= topMslM
        ? 1
        : (topMslM - lower.geopotentialMslM) /
          (upper.geopotentialMslM - lower.geopotentialMslM);
    const dp = (lower.pressurePa - upper.pressurePa) * fraction;
    if (dp <= 0) continue;

    const wLower = mixingRatio(lower.dewpointK, lower.pressurePa);
    const wUpper = mixingRatio(upper.dewpointK, upper.pressurePa);
    const thetaLower = potentialTemperature(lower.tempK, lower.pressurePa);
    const thetaUpper = potentialTemperature(upper.tempK, upper.pressurePa);

    mixingSum += ((wLower + wUpper) / 2) * dp;
    thetaSum += ((thetaLower + thetaUpper) / 2) * dp;
    weight += dp;
    levelsUsed++;
  }

  if (weight <= 0 || levelsUsed === 0) {
    return err("INSUFFICIENT_LEVELS", "no levels inside the mixed layer", {
      topAglM,
      levels: sounding.levels.length,
    });
  }

  return ok({
    meanMixingRatioKgKg: kgkg(mixingSum / weight),
    meanPotentialTempK: K(thetaSum / weight),
    topAglM: m(topAglM),
    levelsUsed,
  });
}
