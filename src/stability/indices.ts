/**
 * Classic atmospheric stability indices.
 *
 * All functions return `Result`. **A missing variable never defaults to zero**:
 * missing parameters are declared as `MISSING_VARIABLE`.
 *
 * At high elevation sites, 850 hPa levels may lie below ground level,
 * making K-Index computation physically impossible. This yields `MISSING_VARIABLE`.
 */

import { hPaToPa, kToCelsius } from "../units/convert.js";
import type { Kelvin } from "../units/branded.js";
import { andThen, err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import { interpolateAtPressure } from "../sounding/interpolate.js";
import type { Level, Sounding } from "../sounding/types.js";
import { lcl } from "../thermo/lcl.js";
import { dryAdiabaticLift, moistAdiabaticLift } from "../thermo/parcel.js";

/** Level required by index calculation, or `MISSING_VARIABLE` if unavailable. */
function requireLevel(sounding: Sounding, hpa: number): Result<Level> {
  const level = interpolateAtPressure(sounding, hPaToPa(hpa));
  if (level.ok) return level;
  return err(
    "MISSING_VARIABLE",
    `pressure level ${String(hpa)} hPa is not available in this sounding`,
    { hpa, reason: level.error.code },
  );
}

/**
 * George's K-Index.
 *
 *     KI = (T850 − T500) + Td850 − (T700 − Td700)      [°C]
 *
 * Thunderstorm potential indicator.
 *
 * @source George, J. J. (1960), Weather Forecasting for Aeronautics.
 */
export function kIndex(sounding: Sounding): Result<number> {
  return andThen(requireLevel(sounding, 850), (l850) =>
    andThen(requireLevel(sounding, 700), (l700) =>
      andThen(requireLevel(sounding, 500), (l500) =>
        ok(
          kToCelsius(l850.tempK) -
            kToCelsius(l500.tempK) +
            kToCelsius(l850.dewpointK) -
            (kToCelsius(l700.tempK) - kToCelsius(l700.dewpointK)),
        ),
      ),
    ),
  );
}

/**
 * Total Totals Index.
 *
 *     TT = VT + CT = (T850 − T500) + (Td850 − T500)     [°C]
 *
 * @source Miller, R. C. (1972), Notes on Analysis and Severe-Storm Forecasting.
 */
export function totalTotals(sounding: Sounding): Result<number> {
  return andThen(requireLevel(sounding, 850), (l850) =>
    andThen(requireLevel(sounding, 500), (l500) =>
      ok(
        kToCelsius(l850.tempK) -
          kToCelsius(l500.tempK) +
          (kToCelsius(l850.dewpointK) - kToCelsius(l500.tempK)),
      ),
    ),
  );
}

/**
 * Surface parcel Lifted Index.
 *
 *     LI = T500_env − T500_parcel                  [K]
 *
 * Fallback implementation used when numerical model does not supply its native lifted index.
 *
 * @source Galway, J. G. (1956), Bulletin of the AMS 37 (Lifted Index).
 */
export function liftedIndex(
  sounding: Sounding,
  surfaceTempK: Kelvin = sounding.surface.tempK,
): Result<number> {
  return andThen(requireLevel(sounding, 500), (l500) => {
    const surfacePressurePa = sounding.surface.pressurePa;
    const condensation = lcl(surfaceTempK, sounding.surface.dewpointK, surfacePressurePa);

    // Above LCL ascent is moist adiabatic; if LCL sits above 500 hPa, ascent is dry adiabatic.
    if (condensation.pressurePa <= l500.pressurePa) {
      return ok(
        l500.tempK - dryAdiabaticLift(surfaceTempK, surfacePressurePa, l500.pressurePa),
      );
    }

    return andThen(
      moistAdiabaticLift(condensation.tempK, condensation.pressurePa, l500.pressurePa),
      (parcelK) => ok(l500.tempK - parcelK),
    );
  });
}

/** Ordinal bands for Lifted Index deep convection diagnosis. */
export type LiftedIndexBand =
  | "stable"
  | "marginally_unstable"
  | "moderately_unstable"
  | "very_unstable"
  | "extremely_unstable";

/**
 * Ordinal classification of Lifted Index.
 *
 * @source Galway, J. G. (1956), Bulletin of the AMS 37; standard aviation meteorology bands.
 */
export function liftedIndexBand(li: number): LiftedIndexBand {
  if (li > 2) return "stable";
  if (li >= 0) return "marginally_unstable";
  if (li >= -3) return "moderately_unstable";
  if (li >= -6) return "very_unstable";
  return "extremely_unstable";
}
