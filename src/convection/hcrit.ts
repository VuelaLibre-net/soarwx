/**
 * Critical height: maximum realistic climb altitude.
 *
 * `hcrit` is the altitude where updraft strength falls below the threshold
 * defining exploitable thermals. DrJack describes it as the practical climb
 * ceiling over flat ground without clouds, fixing the threshold at 225 fpm.
 *
 * The threshold is **not** the sink rate of the chosen aircraft: it is a
 * RASP convention, identical across the profile catalogue. What depends on
 * the aircraft is the expected vario reading, `expectedVarioAt`, which subtracts
 * `circlingSinkMs`. Separating them allows choosing an aircraft without shifting
 * the ceiling. See `aircraft/profiles.ts`.
 *
 * Evaluated against the thermal **core**, not the cross-sectional average:
 * with `w* = 2.56 m/s` and `zi = 1401 m`, mid-layer average climb is 0.91 m/s
 * (below the 1.143 m/s threshold), which would falsely declare a normal day
 * unsoarable.
 */

import { m, mps } from "../units/branded.js";
import type { MPerS, Metres } from "../units/branded.js";
import { err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import type { AircraftProfile } from "../aircraft/profiles.js";
import { ZERO_CROSSING_RATIO, updraftPeakAt } from "./updraft.js";

/** Coarse sampling to bracket the peak before refining. */
const COARSE_SAMPLES = 200;
const BISECTION_STEPS = 60;

export interface CriticalHeightResult {
  readonly hcritAglM: Metres;
  /** Height of peak core climb. */
  readonly peakHeightAglM: Metres;
  /** Maximum core climb rate. */
  readonly peakClimbMs: MPerS;
}

/**
 * Altitude where core updraft strength drops below the profile's `hcrit` threshold.
 *
 * Returns `NO_CONVECTION` when thermals never reach the threshold: this represents
 * an unsoarable day, not an `hcrit` of zero.
 *
 * @source Glendening (DrJack), RASP BLIPMAP, definition of hcrit (225 fpm);
 *         Allen, M. J. (2006), AIAA 2006-1510, eq. 11-15 (profile).
 */
export function criticalHeight(
  wStarMs: MPerS,
  ziAglM: Metres,
  profile: AircraftProfile,
): Result<CriticalHeightResult> {
  if (wStarMs <= 0 || ziAglM <= 0) {
    return err("NO_CONVECTION", "no convective velocity scale", { wStarMs, ziAglM });
  }

  const top = ziAglM * ZERO_CROSSING_RATIO;

  // 1. Locate peak of core profile.
  let peakHeight = 0;
  let peakClimb = -Infinity;
  for (let i = 1; i <= COARSE_SAMPLES; i++) {
    const z = (top * i) / COARSE_SAMPLES;
    const w = updraftPeakAt(wStarMs, m(z), ziAglM);
    if (w > peakClimb) {
      peakClimb = w;
      peakHeight = z;
    }
  }

  if (peakClimb < profile.hcritThresholdMs) {
    return err("NO_CONVECTION", "peak core climb never reaches the hcrit threshold", {
      peakClimbMs: peakClimb,
      hcritThresholdMs: profile.hcritThresholdMs,
      wStarMs,
      ziAglM,
    });
  }

  // 2. Bisect on descending branch where profile is monotonic.
  let low = peakHeight;
  let high = top;
  for (let i = 0; i < BISECTION_STEPS; i++) {
    const mid = (low + high) / 2;
    if (updraftPeakAt(wStarMs, m(mid), ziAglM) >= profile.hcritThresholdMs) low = mid;
    else high = mid;
  }

  return ok({
    hcritAglM: m(low),
    peakHeightAglM: m(peakHeight),
    peakClimbMs: mps(peakClimb),
  });
}

/** Relative height representing the bottom of the working band. */
export const WORKING_BAND_BOTTOM_FRAC = 0.1;

/**
 * Mean climb rate seen on the vario throughout a full climb, from 10 %
 * of the boundary layer up to the critical height.
 *
 * Represents what a pilot actually experiences during climbs without relying
 * on arbitrary evaluation heights: the core peak sits near 20 % of the layer,
 * so evaluating at mid-layer underestimates thermal strength while evaluating
 * at the peak overestimates it.
 *
 * Blends both profile quantities intentionally: working band is bounded by
 * the `hcrit` threshold, while the rate inside is determined by aircraft sink.
 *
 * @source Allen (2006), AIAA 2006-1510, eq. 11-15 (profile); integrated over
 *         working band defined by `hcrit`.
 */
export function meanClimbOverBand(
  wStarMs: MPerS,
  ziAglM: Metres,
  profile: AircraftProfile,
  samples = 200,
): Result<MPerS> {
  const critical = criticalHeight(wStarMs, ziAglM, profile);
  if (!critical.ok) return critical;

  const bottom = WORKING_BAND_BOTTOM_FRAC * ziAglM;
  const top = critical.value.hcritAglM;
  if (top <= bottom) {
    return ok(expectedVarioAt(wStarMs, m(top), ziAglM, profile));
  }

  let total = 0;
  for (let i = 0; i < samples; i++) {
    const z = bottom + ((top - bottom) * (i + 0.5)) / samples;
    total += expectedVarioAt(wStarMs, m(z), ziAglM, profile);
  }
  return ok(mps(total / samples));
}

/**
 * Expected variometer reading at altitude: core updraft minus circling sink rate.
 * Can be negative, which conveys valuable information.
 *
 * Except for `RASP_REFERENCE`, does not cross zero at `hcrit` but higher:
 * at `hcrit` it equals `hcritThresholdMs - circlingSinkMs`, which is positive
 * for real gliders. This is the intended consequence of decoupling the
 * criterion from aircraft polar data.
 *
 * @source Glendening (DrJack): "subtract glider sink rate to obtain average
 *         variometer reading".
 */
export function expectedVarioAt(
  wStarMs: MPerS,
  zAglM: Metres,
  ziAglM: Metres,
  profile: AircraftProfile,
): MPerS {
  return mps(updraftPeakAt(wStarMs, zAglM, ziAglM) - profile.circlingSinkMs);
}
