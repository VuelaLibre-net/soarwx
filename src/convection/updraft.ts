/**
 * Vertical thermal updraft profile: mean velocity, radius, and core peak velocity.
 *
 * **Pilots experience the core updraft, not the cross-sectional average.** With
 * `w* = 2.56 m/s` and `zi = 1401 m` — the median case in Allen's Table 1 — at
 * mid-boundary layer the mean velocity is 0.91 m/s while the core is 2.09 m/s.
 * Evaluating critical height against the mean would declare perfectly soarable days
 * unsoarable.
 *
 * Peak core strength ranges **between 0.92 and 1.12 · w\*** for `zi` from 800
 * to 3500 m, decreasing with deeper layers as wider thermals develop less
 * pronounced velocity peaks. That is, `max(w_peak) ≈ w*`, which reconciles
 * Allen with DrJack (who treats `W*` directly as the lift from which glider sink
 * is subtracted). The two sources describe the identical physical phenomenon.
 */

import { m, mps } from "../units/branded.js";
import type { MPerS, Metres } from "../units/branded.js";

/** Relative altitude where mean velocity drops to zero: 1/1.1. */
export const ZERO_CROSSING_RATIO = 1 / 1.1;

/** Minimum outer radius in metres (Allen eq. 12). */
export const MIN_OUTER_RADIUS_M = 10;

export interface ProfilePoint {
  readonly zAglM: Metres;
  readonly meanMs: MPerS;
  readonly peakMs: MPerS;
  readonly radiusM: Metres;
}

/**
 * Mean updraft velocity across the thermal cross-section.
 *
 *     w̄(z) = w* · (z/zi)^(1/3) · (1 − 1.1·z/zi)
 *
 * Maximum 0.4577·w* at z/zi = 0.2273; negative above z/zi = 0.9091.
 *
 * @source Allen, M. J. (2006), AIAA 2006-1510, eq. 11, adapted from
 *         Lenschow & Stephens (1980).
 */
export function updraftMeanAt(wStarMs: MPerS, zAglM: Metres, ziAglM: Metres): MPerS {
  if (ziAglM <= 0 || zAglM < 0) return mps(0);
  const x = zAglM / ziAglM;
  return mps(wStarMs * Math.cbrt(x) * (1 - 1.1 * x));
}

/**
 * Thermal outer radius.
 *
 *     r2 = max( 10, 0.102·(z/zi)^(1/3)·(1 − 0.25·z/zi)·zi )
 *
 * @source Allen, M. J. (2006), AIAA 2006-1510, eq. 12, from Lenschow (1980).
 */
export function updraftOuterRadius(zAglM: Metres, ziAglM: Metres): Metres {
  if (ziAglM <= 0 || zAglM < 0) return m(MIN_OUTER_RADIUS_M);
  const x = zAglM / ziAglM;
  return m(Math.max(MIN_OUTER_RADIUS_M, 0.102 * Math.cbrt(x) * (1 - 0.25 * x) * ziAglM));
}

/**
 * Ratio between inner and outer radius of the inverted trapezoid thermal model.
 *
 *     r1/r2 = 0.0011·r2 + 0.14   if r2 < 600 m;  0.8 otherwise
 *
 * @source Allen, M. J. (2006), AIAA 2006-1510, eq. 13 (fit to Konovalov).
 */
export function innerRadiusRatio(outerRadiusM: Metres): number {
  return outerRadiusM < 600 ? 0.0011 * outerRadiusM + 0.14 : 0.8;
}

/**
 * Peak core updraft velocity derived from cross-sectional mean and inverted
 * trapezoid geometry.
 *
 *     w_peak = 3·w̄·(r2³ − r2²·r1) / (r2³ − r1³) = 3·w̄·(1 − ρ)/(1 − ρ³)
 *
 * @source Allen, M. J. (2006), AIAA 2006-1510, eq. 14-15.
 */
export function updraftPeakAt(wStarMs: MPerS, zAglM: Metres, ziAglM: Metres): MPerS {
  const mean = updraftMeanAt(wStarMs, zAglM, ziAglM);
  const ratio = innerRadiusRatio(updraftOuterRadius(zAglM, ziAglM));
  return mps(3 * mean * ((1 - ratio) / (1 - Math.pow(ratio, 3))));
}

export interface ProfileOptions {
  readonly stepM?: Metres;
  /** Fraction of `zi` sampled. Defaults to 1.0. */
  readonly topFrac?: number;
}

/**
 * Sampled vertical thermal profile for plotting and numerical searches.
 *
 * @source Allen, M. J. (2006), AIAA 2006-1510, eq. 11-15.
 */
export function updraftProfile(
  wStarMs: MPerS,
  ziAglM: Metres,
  options: ProfileOptions = {},
): readonly ProfilePoint[] {
  const step = options.stepM ?? m(Math.max(5, ziAglM / 200));
  const top = ziAglM * (options.topFrac ?? 1);
  const heights: number[] = [];
  for (let z = 0; z < top - 1e-9; z += step) heights.push(z);
  heights.push(top);

  return heights.map((z) => {
    const zAglM = m(z);
    return {
      zAglM,
      meanMs: updraftMeanAt(wStarMs, zAglM, ziAglM),
      peakMs: updraftPeakAt(wStarMs, zAglM, ziAglM),
      radiusM: updraftOuterRadius(zAglM, ziAglM),
    } satisfies ProfilePoint;
  });
}
