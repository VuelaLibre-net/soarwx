/**
 * Atmospheric sounding interpolation.
 *
 * Linear in `ln(p)`, which is the natural coordinate: geopotential height
 * is linear in `ln(p)` under hydrostatic balance with piecewise-constant temperature.
 * Wind is always interpolated by Cartesian vector components, never by scalar speed and direction.
 */

import { K, Pa, m } from "../units/branded.js";
import type { Metres, Pascal } from "../units/branded.js";
import { err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import type { Level, Sounding } from "./types.js";
import { fromComponents, toComponents } from "./wind.js";
import { at, consecutivePairs } from "../types/array.js";

/** Linearly blends two sounding levels with a precomputed interpolation weight. */
function blend(lower: Level, upper: Level, f: number): Level {
  const a = toComponents(lower.windSpeedMs, lower.windFromDeg);
  const b = toComponents(upper.windSpeedMs, upper.windFromDeg);
  const wind = fromComponents(a.uMs + (b.uMs - a.uMs) * f, a.vMs + (b.vMs - a.vMs) * f);
  return {
    pressurePa: Pa(
      Math.exp(
        Math.log(lower.pressurePa) + f * Math.log(upper.pressurePa / lower.pressurePa),
      ),
    ),
    geopotentialMslM: m(
      lower.geopotentialMslM + (upper.geopotentialMslM - lower.geopotentialMslM) * f,
    ),
    tempK: K(lower.tempK + (upper.tempK - lower.tempK) * f),
    dewpointK: K(lower.dewpointK + (upper.dewpointK - lower.dewpointK) * f),
    windSpeedMs: wind.speedMs,
    windFromDeg: wind.fromDeg,
    source: "interpolated",
  };
}

/**
 * Interpolates sounding level at specified pressure. Linear in `ln(p)`.
 *
 * @source Log-pressure interpolation; standard sounding practice.
 */
export function interpolateAtPressure(
  sounding: Sounding,
  pressurePa: Pascal,
): Result<Level> {
  const levels = sounding.levels;
  if (levels.length === 0) return err("INSUFFICIENT_LEVELS", "empty sounding");
  const first = at(levels, 0);
  const last = at(levels, levels.length - 1);
  if (pressurePa > first.pressurePa) {
    return err("LEVEL_BELOW_GROUND", "pressure is below the surface level", {
      pressurePa,
      surfacePressurePa: first.pressurePa,
    });
  }
  if (pressurePa < last.pressurePa) {
    return err("OUT_OF_VALID_RANGE", "pressure is above the top of the sounding", {
      pressurePa,
      topPressurePa: last.pressurePa,
    });
  }

  for (const [lower, upper] of consecutivePairs(levels)) {
    if (pressurePa <= lower.pressurePa && pressurePa >= upper.pressurePa) {
      const span = Math.log(upper.pressurePa / lower.pressurePa);
      const f = span === 0 ? 0 : Math.log(pressurePa / lower.pressurePa) / span;
      return ok(blend(lower, upper, f));
    }
  }
  /* v8 ignore next 2 -- unreachable safety check */
  return err("OUT_OF_VALID_RANGE", "pressure not bracketed by any level", { pressurePa });
}

/**
 * Interpolates sounding level at specified geopotential altitude above MSL.
 *
 * @source Standard atmospheric sounding interpolation.
 */
export function interpolateAtHeight(sounding: Sounding, mslM: Metres): Result<Level> {
  const levels = sounding.levels;
  if (levels.length === 0) return err("INSUFFICIENT_LEVELS", "empty sounding");
  const first = at(levels, 0);
  const last = at(levels, levels.length - 1);
  if (mslM < first.geopotentialMslM) {
    return err("LEVEL_BELOW_GROUND", "height is below the surface level", {
      mslM,
      surfaceMslM: first.geopotentialMslM,
    });
  }
  if (mslM > last.geopotentialMslM) {
    return err("OUT_OF_VALID_RANGE", "height is above the top of the sounding", {
      mslM,
      topMslM: last.geopotentialMslM,
    });
  }

  for (const [lower, upper] of consecutivePairs(levels)) {
    if (mslM >= lower.geopotentialMslM && mslM <= upper.geopotentialMslM) {
      const span = upper.geopotentialMslM - lower.geopotentialMslM;
      const f = span === 0 ? 0 : (mslM - lower.geopotentialMslM) / span;
      return ok(blend(lower, upper, f));
    }
  }
  /* v8 ignore next 2 -- unreachable safety check */
  return err("OUT_OF_VALID_RANGE", "height not bracketed by any level", { mslM });
}

/** Interpolates sounding level at specified height above ground level (AGL). */
export function interpolateAtAgl(sounding: Sounding, aglM: Metres): Result<Level> {
  return interpolateAtHeight(sounding, m(sounding.site.elevationMslM + aglM));
}
