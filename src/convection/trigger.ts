/**
 * Trigger temperature (convective temperature) and Convective Condensation Level (CCL).
 *
 * The CCL is where the surface constant mixing ratio line intersects the
 * environmental temperature profile. Trigger temperature is the surface temperature
 * required for a dry adiabatic parcel to reach this level: below it no cumulus
 * forms, above it convective clouds begin to develop.
 */

import { K, Pa, m } from "../units/branded.js";
import type { Kelvin, KgPerKg, Metres, Pascal } from "../units/branded.js";
import { err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import { dewpointFromMixingRatio, mixingRatio } from "../thermo/saturation.js";
import { dryAdiabaticLift } from "../thermo/parcel.js";
import { consecutivePairs } from "../types/array.js";
import type { Level, Sounding } from "../sounding/types.js";

export interface TriggerResult {
  /** Surface temperature required to initiate convection up to CCL. */
  readonly triggerTempK: Kelvin;
  readonly cclPressurePa: Pascal;
  readonly cclMslM: Metres;
  readonly cclAglM: Metres;
}

const BISECTION_STEPS = 60;

/**
 * Trigger temperature and Convective Condensation Level (CCL).
 *
 * @source Classical CCL and convective temperature method;
 *         Stull, Practical Meteorology, ch. 5.
 */
export function triggerTemperature(sounding: Sounding): Result<TriggerResult> {
  const surfaceMixingRatio = mixingRatio(
    sounding.surface.dewpointK,
    sounding.surface.pressurePa,
  );

  // Temperature difference between environmental profile and dewpoint
  // corresponding to surface mixing ratio at that pressure. Changes sign at CCL.
  const gap = (level: Level): number =>
    level.tempK - dewpointFromMixingRatio(surfaceMixingRatio, level.pressurePa);

  for (const [lower, upper] of consecutivePairs(sounding.levels)) {
    if (gap(lower) > 0 && gap(upper) <= 0) {
      let low = 0;
      let high = 1;
      for (let i = 0; i < BISECTION_STEPS; i++) {
        const mid = (low + high) / 2;
        if (gapAtFraction(lower, upper, surfaceMixingRatio, mid) > 0) low = mid;
        else high = mid;
      }
      const f = (low + high) / 2;
      const cclPressurePa = interpolatePressure(lower, upper, f);
      const cclMslM = m(
        lower.geopotentialMslM + f * (upper.geopotentialMslM - lower.geopotentialMslM),
      );
      const cclTempK = K(lower.tempK + f * (upper.tempK - lower.tempK));

      return ok({
        triggerTempK: dryAdiabaticLift(
          cclTempK,
          cclPressurePa,
          sounding.surface.pressurePa,
        ),
        cclPressurePa,
        cclMslM,
        cclAglM: m(cclMslM - sounding.site.elevationMslM),
      });
    }
  }

  return err(
    "OUT_OF_VALID_RANGE",
    "no convective condensation level within the sounding",
    {
      surfaceMixingRatioKgKg: surfaceMixingRatio,
    },
  );
}

function interpolatePressure(lower: Level, upper: Level, f: number): Pascal {
  return Pa(lower.pressurePa * Math.pow(upper.pressurePa / lower.pressurePa, f));
}

function gapAtFraction(
  lower: Level,
  upper: Level,
  surfaceMixingRatioKgKg: KgPerKg,
  f: number,
): number {
  const pressurePa = interpolatePressure(lower, upper, f);
  const tempK = K(lower.tempK + f * (upper.tempK - lower.tempK));
  return tempK - dewpointFromMixingRatio(surfaceMixingRatioKgKg, pressurePa);
}
