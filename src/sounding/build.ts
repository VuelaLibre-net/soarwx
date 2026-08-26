/**
 * Sounding assembly and validation.
 *
 * A critical responsibility is **discarding sub-surface pressure levels**:
 * at Fuentemilanos (1001 m MSL) levels at 1000, 975, 950, and 925 hPa lie
 * below ground where values represent non-physical extrapolations — the
 * 1000 hPa level reported 38 °C at 136 m geopotential height.
 */

import { m } from "../units/branded.js";
import type { Degrees, Kelvin, MPerS, Metres, Pascal } from "../units/branded.js";
import { err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import type { Site } from "../types/site.js";
import type { Level, Sounding, SoundingQuality, SurfaceState } from "./types.js";
import { heightLevelsToLevels } from "./heightLevels.js";
import type { RawHeightLevel } from "./heightLevels.js";
import { mixingRatio } from "../thermo/saturation.js";
import { at, consecutivePairs } from "../types/array.js";

export interface RawPressureLevel {
  readonly pressurePa: Pascal;
  readonly geopotentialMslM: Metres;
  readonly tempK: Kelvin;
  readonly dewpointK: Kelvin;
  readonly windSpeedMs: MPerS;
  readonly windFromDeg: Degrees;
  readonly cloudCoverFrac?: number;
}

export interface BuildOptions {
  /** Minimum valid pressure levels above ground. Defaults to 3 (R-1.4). */
  readonly minPressureLevels?: number;
  /** Height above ground up to which vertical gaps are measured. Defaults to 3500 m. */
  readonly gapWindowTopAglM?: Metres;
}

export interface SoundingInput {
  readonly site: Site;
  readonly timeUtc: string;
  readonly surface: SurfaceState;
  readonly pressureLevels: readonly RawPressureLevel[];
  readonly heightLevels?: readonly RawHeightLevel[];
  readonly missing?: readonly string[];
  readonly options?: BuildOptions;
}

const DEFAULT_MIN_PRESSURE_LEVELS = 3;
/**
 * Default ceiling for the analysis window measuring vertical gap.
 * 3500 m AGL covers strong boundary layer growth on high plateaus;
 * higher gaps reside in the free troposphere and do not affect thermal top.
 */
const DEFAULT_GAP_WINDOW_TOP_AGL_M = m(3500);

/**
 * Assembles the atmospheric sounding: surface, AGL height levels, and pressure levels,
 * ordered by strictly descending pressure with all sub-surface levels filtered out.
 *
 * @source Requirements R-1.1 through R-1.5 from docs/REQUIREMENTS.md.
 */
export function buildSounding(input: SoundingInput): Result<Sounding> {
  const { site, surface, pressureLevels } = input;
  const minLevels = input.options?.minPressureLevels ?? DEFAULT_MIN_PRESSURE_LEVELS;
  const gapWindowTopAglM =
    input.options?.gapWindowTopAglM ?? DEFAULT_GAP_WINDOW_TOP_AGL_M;

  const aboveGround = pressureLevels.filter(
    (l) => l.geopotentialMslM > site.elevationMslM && l.pressurePa < surface.pressurePa,
  );
  const discarded = pressureLevels.length - aboveGround.length;

  const column = aboveGround.map((l) => ({
    pressurePa: l.pressurePa,
    geopotentialMslM: l.geopotentialMslM,
  }));

  const heightLevels = heightLevelsToLevels(
    {
      surfacePressurePa: surface.pressurePa,
      surfaceTempK: surface.tempK,
      surfaceMixingRatioKgKg: mixingRatio(surface.dewpointK, surface.pressurePa),
      elevationMslM: site.elevationMslM,
      column,
    },
    input.heightLevels ?? [],
  );

  // Offset between downscaled surface pressure and model geopotential column.
  // In Open-Meteo `surface_pressure` is downscaled to requested elevation
  // while `geopotential_height_*hPa` is not. Measured at Fuentemilanos: ~37 m.
  const surfacePressureOffsetM = geopotentialOffset(
    column,
    surface.pressurePa,
    site.elevationMslM,
  );

  const surfaceLevel: Level = {
    pressurePa: surface.pressurePa,
    geopotentialMslM: site.elevationMslM,
    tempK: surface.tempK,
    dewpointK: surface.dewpointK,
    windSpeedMs: surface.windSpeedMs,
    windFromDeg: surface.windFromDeg,
    cloudCoverFrac: surface.cloudCoverFrac,
    source: "surface",
  };

  const levels: Level[] = [
    surfaceLevel,
    ...heightLevels,
    ...aboveGround.map((l): Level => ({
      pressurePa: l.pressurePa,
      geopotentialMslM: l.geopotentialMslM,
      tempK: l.tempK,
      dewpointK: l.dewpointK,
      windSpeedMs: l.windSpeedMs,
      windFromDeg: l.windFromDeg,
      ...(l.cloudCoverFrac === undefined ? {} : { cloudCoverFrac: l.cloudCoverFrac }),
      source: "pressure_level",
    })),
  ].sort((a, b) => b.pressurePa - a.pressurePa);

  const estimated: string[] = [];
  if (heightLevels.length > 0) {
    estimated.push("height_level_dewpoint");
    estimated.push("height_level_pressure");
  }

  const quality: SoundingQuality = {
    pressureLevelsUsed: aboveGround.length,
    levelsDiscardedBelowGround: discarded,
    heightLevelsUsed: heightLevels.length,
    levelsUsed: levels.length,
    maxVerticalGapM: maxGapBelowLevels(levels, m(site.elevationMslM + gapWindowTopAglM)),
    gapWindowTopAglM,
    surfacePressureOffsetM,
    missing: input.missing ?? [],
    estimated,
    usable: aboveGround.length >= minLevels,
  };

  if (!quality.usable) {
    return err(
      "INSUFFICIENT_LEVELS",
      `only ${String(aboveGround.length)} pressure levels above ground, need ${String(minLevels)}`,
      { quality },
    );
  }

  return ok({ site, timeUtc: input.timeUtc, surface, levels, quality });
}

/**
 * Largest vertical gap between consecutive levels below a specified ceiling.
 *
 * Gaps crossing the ceiling are clamped to the ceiling itself: analysis
 * concerns resolution within the convective window, not free troposphere above.
 *
 * `quality.maxVerticalGapM` uses a default window during sounding assembly
 * before boundary layer height is known. Later convection stages re-evaluate
 * this with the actual thermal ceiling (R-1.4b).
 *
 * @source Requirements R-1.4b from docs/REQUIREMENTS.md.
 */
export function maxGapBelow(sounding: Sounding, topMslM: Metres): Metres {
  return maxGapBelowLevels(sounding.levels, topMslM);
}

function maxGapBelowLevels(levels: readonly Level[], topMslM: Metres): Metres {
  let worst = 0;
  for (const [lower, upper] of consecutivePairs(levels)) {
    if (lower.geopotentialMslM >= topMslM) break;
    const top = Math.min(upper.geopotentialMslM, topMslM);
    worst = Math.max(worst, top - lower.geopotentialMslM);
  }
  return m(worst);
}

/**
 * Difference between site elevation and where the model geopotential
 * column places surface pressure.
 *
 * Positive indicates surface pressure corresponds to a point lower than
 * declared elevation.
 *
 * @source docs/OPEN_METEO_INTEGRATION.md §4.
 */
function geopotentialOffset(
  column: readonly { pressurePa: Pascal; geopotentialMslM: Metres }[],
  surfacePressurePa: Pascal,
  elevationMslM: Metres,
): Metres {
  if (column.length < 2) return m(0);
  const sorted = [...column].sort((a, b) => b.pressurePa - a.pressurePa);
  const a = at(sorted, 0);
  const b = at(sorted, 1);
  const span = Math.log(b.pressurePa / a.pressurePa);
  if (span === 0) return m(0);
  const f = Math.log(surfacePressurePa / a.pressurePa) / span;
  const implied = a.geopotentialMslM + f * (b.geopotentialMslM - a.geopotentialMslM);
  return m(elevationMslM - implied);
}
