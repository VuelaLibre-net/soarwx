/**
 * Vertical atmospheric sounding data structures. See docs/SPEC.md §4.2.
 */

import type { Degrees, Kelvin, MPerS, Metres, Pascal, WPerM2 } from "../units/branded.js";
import type { Site } from "../types/site.js";

export type LevelSource = "surface" | "pressure_level" | "height_level" | "interpolated";

export interface Level {
  readonly pressurePa: Pascal;
  readonly geopotentialMslM: Metres;
  readonly tempK: Kelvin;
  readonly dewpointK: Kelvin;
  readonly windSpeedMs: MPerS;
  /** Wind direction FROM which the wind is blowing. */
  readonly windFromDeg: Degrees;
  readonly cloudCoverFrac?: number;
  readonly source: LevelSource;
}

export interface SurfaceState {
  readonly tempK: Kelvin;
  readonly dewpointK: Kelvin;
  /** Station surface pressure. **Not** altimeter setting (QNH). */
  readonly pressurePa: Pascal;
  /** Sea-level reduced pressure (QNH). For altimetry reference only. */
  readonly mslPressurePa: Pascal;
  readonly windSpeedMs: MPerS;
  readonly windFromDeg: Degrees;
  readonly windGustMs?: MPerS;
  readonly shortwaveWm2: WPerM2;
  readonly cloudCoverFrac: number;
  readonly cloudCoverLowFrac: number;
  readonly cloudCoverMidFrac: number;
  readonly cloudCoverHighFrac: number;
}

export interface SoundingQuality {
  /** Count of valid pressure levels retained above terrain. */
  readonly pressureLevelsUsed: number;
  /** Count of pressure levels discarded below ground level. */
  readonly levelsDiscardedBelowGround: number;
  /** Count of AGL height levels incorporated into sounding. */
  readonly heightLevelsUsed: number;
  /** Total levels in sounding, including surface. */
  readonly levelsUsed: number;
  /**
   * Largest vertical gap between consecutive levels within analysis window.
   * Interpolating across large gaps yields lower confidence (R-1.4b).
   */
  readonly maxVerticalGapM: Metres;
  readonly gapWindowTopAglM: Metres;
  /**
   * Vertical difference between site elevation and where the model geopotential
   * column places surface pressure. In Open-Meteo `surface_pressure` is downscaled
   * to requested elevation while `geopotential_height_*hPa` is not. Declared explicitly.
   */
  readonly surfacePressureOffsetM: Metres;
  readonly missing: readonly string[];
  /** Variables derived through assumptions rather than direct measurements. */
  readonly estimated: readonly string[];
  readonly usable: boolean;
}

export interface Sounding {
  readonly site: Site;
  readonly timeUtc: string;
  readonly surface: SurfaceState;
  /** Sorted by strictly descending pressure, all situated above ground level. */
  readonly levels: readonly Level[];
  readonly quality: SoundingQuality;
}

export interface WindVector {
  readonly speedMs: MPerS;
  readonly fromDeg: Degrees;
}
