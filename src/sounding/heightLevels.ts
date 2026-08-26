/**
 * Above-ground-level (AGL) height levels (e.g. 80, 120, 180 m) as sounding levels.
 *
 * At high elevation sites (e.g. 1000 m MSL), standard isobaric levels below ground
 * are discarded. Without AGL height levels, the lower profile would be a straight
 * chord between surface and the first aloft isobaric level, missing the superadiabatic
 * surface layer (R-1.1b).
 *
 * Open-Meteo provides temperature and wind at these heights, **but not moisture or pressure**,
 * so both must be derived.
 */

import { K, Pa, kgkg, m } from "../units/branded.js";
import type { Degrees, Kelvin, MPerS, Metres, Pascal } from "../units/branded.js";
import { G, RD } from "../units/constants.js";
import { dewpointFromMixingRatio, saturationMixingRatio } from "../thermo/saturation.js";
import { virtualTemperature } from "../thermo/potential.js";
import type { Level } from "./types.js";
import { at, consecutivePairs } from "../types/array.js";

export interface RawHeightLevel {
  readonly heightAglM: Metres;
  readonly tempK: Kelvin;
  readonly windSpeedMs: MPerS;
  readonly windFromDeg: Degrees;
}

/** (pressure, height) pair defining model p(z) relation. */
export interface PressureHeightPair {
  readonly pressurePa: Pascal;
  readonly geopotentialMslM: Metres;
}

/**
 * Pressure at height above surface via the hypsometric equation.
 *
 *     p(z) = p_sfc · exp( −g·Δz / (Rd·Tv_mean) )
 *
 * Used only as fallback: primary method is {@link pressureFromGeopotentialProfile}.
 *
 * @source Wallace & Hobbs, Atmospheric Science, eq. 3.23 (hypsometric equation).
 */
export function pressureAtHeight(
  surfacePressurePa: Pascal,
  surfaceTempK: Kelvin,
  tempAtHeightK: Kelvin,
  mixingRatioKgKg: number,
  depthM: Metres,
): Pascal {
  const w = kgkg(mixingRatioKgKg);
  const tvMean =
    (virtualTemperature(surfaceTempK, w) + virtualTemperature(tempAtHeightK, w)) / 2;
  return Pa(surfacePressurePa * Math.exp((-G * depthM) / (RD * tvMean)));
}

/**
 * Pressure at height by linearly interpolating `ln(p)` against model geopotential height.
 *
 * This is the primary method to maintain monotonicity with model isobaric columns.
 *
 * @source Hydrostatic log-linear relation; see docs/OPEN_METEO_INTEGRATION.md §4.
 */
export function pressureFromGeopotentialProfile(
  column: readonly PressureHeightPair[],
  targetMslM: Metres,
): Pascal | null {
  if (column.length < 2) return null;

  const sorted = [...column].sort((a, b) => a.geopotentialMslM - b.geopotentialMslM);
  let lower = at(sorted, 0);
  let upper = at(sorted, 1);

  for (const [a, b] of consecutivePairs(sorted)) {
    lower = a;
    upper = b;
    if (targetMslM <= b.geopotentialMslM) break;
  }

  const dz = upper.geopotentialMslM - lower.geopotentialMslM;
  if (dz === 0) return lower.pressurePa;
  const f = (targetMslM - lower.geopotentialMslM) / dz;
  return Pa(
    Math.exp(
      Math.log(lower.pressurePa) + f * Math.log(upper.pressurePa / lower.pressurePa),
    ),
  );
}

export interface HeightLevelContext {
  readonly surfacePressurePa: Pascal;
  readonly surfaceTempK: Kelvin;
  readonly surfaceMixingRatioKgKg: number;
  readonly elevationMslM: Metres;
  /** Model pressure column with sub-surface levels pruned. */
  readonly column: readonly PressureHeightPair[];
}

/**
 * Converts raw AGL height levels into sounding levels.
 *
 * Dewpoint is derived by conserving surface mixing ratio (valid in a mixed layer)
 * capped at saturation temperature. Flagged in `quality.estimated`.
 *
 * @source Mixing ratio conservation in convective mixed layer (Stull, ch. 18).
 */
export function heightLevelsToLevels(
  context: HeightLevelContext,
  raw: readonly RawHeightLevel[],
): readonly Level[] {
  return raw.map((level) => {
    const geopotentialMslM = m(context.elevationMslM + level.heightAglM);
    const pressurePa =
      pressureFromGeopotentialProfile(context.column, geopotentialMslM) ??
      pressureAtHeight(
        context.surfacePressurePa,
        context.surfaceTempK,
        level.tempK,
        context.surfaceMixingRatioKgKg,
        level.heightAglM,
      );

    const wSat = saturationMixingRatio(level.tempK, pressurePa);
    const w = kgkg(Math.min(context.surfaceMixingRatioKgKg, wSat));
    return {
      pressurePa,
      geopotentialMslM,
      tempK: level.tempK,
      dewpointK: K(Math.min(dewpointFromMixingRatio(w, pressurePa), level.tempK)),
      windSpeedMs: level.windSpeedMs,
      windFromDeg: level.windFromDeg,
      source: "height_level",
    } satisfies Level;
  });
}
