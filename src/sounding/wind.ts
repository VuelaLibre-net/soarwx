/**
 * Wind: vector components, vector averages, and vertical shear.
 *
 * All wind operations are averaged by vector components, never by scalar speed and direction.
 * Opposing wind layers yield zero vector mean, which provides physical insight (R-5.4).
 */

import { deg, mps } from "../units/branded.js";
import type { Degrees, MPerS, Metres } from "../units/branded.js";
import { normaliseBearing } from "../units/convert.js";
import type { WindVector } from "./types.js";

export interface WindComponents {
  /** Eastward wind component, m/s. */
  readonly uMs: MPerS;
  /** Northward wind component, m/s. */
  readonly vMs: MPerS;
}

const DEG_TO_RAD = Math.PI / 180;

/**
 * Decomposes meteorological wind (direction FROM which wind blows) into Cartesian components.
 * 270° westerly wind blows eastward: u > 0, v = 0.
 *
 * @source Standard meteorological convention; WMO.
 */
export function toComponents(speedMs: MPerS, fromDeg: Degrees): WindComponents {
  const rad = fromDeg * DEG_TO_RAD;
  const speed: number = speedMs;
  return { uMs: mps(-speed * Math.sin(rad)), vMs: mps(-speed * Math.cos(rad)) };
}

/**
 * Reconstructs wind speed and meteorological direction from Cartesian components.
 *
 * @source Standard meteorological convention; WMO.
 */
export function fromComponents(uMs: number, vMs: number): WindVector {
  const speed = Math.hypot(uMs, vMs);
  if (speed < 1e-12) return { speedMs: mps(0), fromDeg: deg(0) };
  return {
    speedMs: mps(speed),
    fromDeg: normaliseBearing(Math.atan2(-uMs, -vMs) / DEG_TO_RAD),
  };
}

export interface ShearResult {
  /** Magnitude of vector wind difference between two endpoints. */
  readonly deltaMs: MPerS;
  /** Vertical wind shear expressed as vector difference per kilometre depth. */
  readonly shearMsPerKm: number;
  readonly depthM: Metres;
}

/**
 * Vector wind shear between two wind observations separated by vertical depth.
 *
 * Comparing scalar speeds alone is erroneous: a complete 180° wind reversal
 * at constant speed would register zero scalar shear despite maximum vector shear.
 *
 * @source Standard vector wind shear definition; Stull, ch. 18.
 */
export function shearBetween(
  lower: WindVector,
  upper: WindVector,
  depthM: Metres,
): ShearResult {
  const a = toComponents(lower.speedMs, lower.fromDeg);
  const b = toComponents(upper.speedMs, upper.fromDeg);
  const delta = Math.hypot(b.uMs - a.uMs, b.vMs - a.vMs);
  const depth = Math.max(depthM, 1);
  return {
    deltaMs: mps(delta),
    shearMsPerKm: (delta / depth) * 1000,
    depthM,
  };
}

/**
 * Weighted vector mean of wind observations (typically weighted by layer depth).
 *
 * @source Vector mean wind; see DrJack, "Boundary Layer Average Wind".
 */
export function meanWind(
  samples: readonly { readonly wind: WindVector; readonly weight: number }[],
): WindVector {
  let u = 0;
  let v = 0;
  let total = 0;
  for (const { wind, weight } of samples) {
    if (weight <= 0) continue;
    const c = toComponents(wind.speedMs, wind.fromDeg);
    u += c.uMs * weight;
    v += c.vMs * weight;
    total += weight;
  }
  if (total === 0) return { speedMs: mps(0), fromDeg: deg(0) };
  return fromComponents(u / total, v / total);
}
