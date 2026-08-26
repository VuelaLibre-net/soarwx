/**
 * Site and terrain. See docs/SPEC.md §4.1.
 *
 * Terrain enters as data, never embedded in the physics: there are no named
 * mountain ranges hard-coded in the library (R-8.1 in docs/REQUIREMENTS.md).
 */

import type { Degrees, Metres } from "../units/branded.js";

export type SurfaceType =
  "cropland" | "forest" | "grass" | "arid" | "urban" | "water" | "snow";

/**
 * Site surface characteristics. Only used to reconstruct heat flux when
 * the model does not serve it; unused when model flux is present.
 */
export interface SurfaceSpec {
  readonly albedoFrac?: number;
  readonly bowenRatio?: number;
  readonly roughnessLengthM?: Metres;
  readonly type?: SurfaceType;
}

/**
 * Ridge geometry as data. No specific sites are hard-coded in the library:
 * consumers provide the terrain they wish to evaluate.
 */
export interface RidgeSpec {
  readonly name: string;
  /** Ridge axis bearing, 0..180. */
  readonly bearingDeg: Degrees;
  /** Average slope of the windward face. */
  readonly slopeDeg: Degrees;
  readonly crestMslM: Metres;
  readonly lengthM?: Metres;
}

/**
 * Site to evaluate. `elevationMslM` and `timezone` are mandatory: the former
 * anchors AGL and prunes sub-surface levels; the latter prevents requested
 * "days" from starting at 02:00 local time.
 */
export interface Site {
  readonly latDeg: number;
  readonly lonDeg: number;
  /**
   * Mandatory. Anchors AGL and MSL, sent to Open-Meteo: without it,
   * downscaling evaluates against the grid cell elevation rather than the airfield.
   */
  readonly elevationMslM: Metres;
  /** IANA timezone. Never UTC when requesting a local day (R-13.4). */
  readonly timezone: string;
  readonly name?: string;
  readonly icao?: string;
  readonly ridges?: readonly RidgeSpec[];
  readonly surface?: SurfaceSpec;
}
