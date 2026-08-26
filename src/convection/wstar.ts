/**
 * Deardorff convective velocity scale, `w*`.
 */

import { mps } from "../units/branded.js";
import type { Kelvin, MPerS, Metres } from "../units/branded.js";
import { G } from "../units/constants.js";
import { err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import type { AircraftProfile } from "../aircraft/profiles.js";

export interface WStarInput {
  /** Virtual kinematic heat flux, K·m/s. Produced by `surfaceHeatFlux`. */
  readonly virtualHeatFluxKMs: number;
  readonly mixingHeightAglM: Metres;
  /**
   * Surface potential temperature. **Not** absolute temperature: at 900 hPa
   * the difference is ~9 K.
   */
  readonly surfacePotentialTempK: Kelvin;
  readonly surfaceWindMs: MPerS;
  readonly profile: AircraftProfile;
}

export interface WStarResult {
  readonly wStarMs: MPerS;
  /** True if high-wind cutoff suppressed the thermal strength. */
  readonly suppressedByWind: boolean;
}

/**
 * Deardorff convective velocity scale.
 *
 *     w* = ( Qov · zi · g / θ̄₀ )^(1/3)
 *
 * Suppressed when surface wind exceeds the aircraft profile's limit:
 * beyond this threshold, thermals are no longer usable.
 *
 * Allen defines θ̄₀ as the **diurnal mean** surface potential temperature.
 * Here we use the hourly value, which is physically consistent with hourly
 * forecasts; the difference enters `w*` via a cube root and is on the order
 * of one percent.
 *
 * @source Allen, M. J. (2006), AIAA 2006-1510, eq. 9-10 & §II (wind cutoff);
 *         Deardorff, J. W. (1970), convective velocity scale.
 */
export function convectiveVelocityScale(input: WStarInput): Result<WStarResult> {
  if (input.surfaceWindMs > input.profile.maxSurfaceWindMs) {
    return ok({ wStarMs: mps(0), suppressedByWind: true });
  }
  if (input.virtualHeatFluxKMs <= 0) {
    return err("NO_CONVECTION", "no upward virtual heat flux", {
      virtualHeatFluxKMs: input.virtualHeatFluxKMs,
    });
  }
  if (input.mixingHeightAglM <= 0) {
    return err("NO_CONVECTION", "mixing height is not positive", {
      mixingHeightAglM: input.mixingHeightAglM,
    });
  }

  const cubed =
    (input.virtualHeatFluxKMs * input.mixingHeightAglM * G) / input.surfacePotentialTempK;

  return ok({ wStarMs: mps(Math.cbrt(cubed)), suppressedByWind: false });
}
