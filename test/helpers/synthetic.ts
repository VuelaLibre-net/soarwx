/** Deterministic synthetic atmospheric soundings for convection testing. */

import { celsiusToK, hPaToPa } from "../../src/units/convert.js";
import { deg, m, mps, wm2 } from "../../src/units/branded.js";
import { G, RD } from "../../src/units/constants.js";
import { buildSounding } from "../../src/sounding/build.js";
import type { RawPressureLevel } from "../../src/sounding/build.js";
import type { Sounding, SurfaceState } from "../../src/sounding/types.js";
import type { Site } from "../../src/types/site.js";

export const FLAT_SITE: Site = {
  name: "synthetic",
  latDeg: 40,
  lonDeg: -4,
  elevationMslM: m(0),
  timezone: "Europe/Madrid",
  surface: { type: "cropland" },
};

export function surfaceState(tempC: number, dewC: number, windMs = 3): SurfaceState {
  return {
    tempK: celsiusToK(tempC),
    dewpointK: celsiusToK(dewC),
    pressurePa: hPaToPa(1013),
    mslPressurePa: hPaToPa(1013),
    windSpeedMs: mps(windMs),
    windFromDeg: deg(270),
    shortwaveWm2: wm2(850),
    cloudCoverFrac: 0,
    cloudCoverLowFrac: 0,
    cloudCoverMidFrac: 0,
    cloudCoverHighFrac: 0,
  };
}

/**
 * Synthetic profile with mixed boundary layer up to `capMslM` and a capping inversion of `capK` degrees above.
 *
 * Pressures are hydrostatically integrated from the temperature profile.
 */
export function cappedProfile(
  surfaceTempC: number,
  capMslM: number,
  capK: number,
  dewC = 0,
): RawPressureLevel[] {
  const heights = [
    110, 340, 560, 780, 1010, 1250, 1500, 1760, 2030, 2320, 3000, 4200, 5000, 5900,
  ];
  // Slightly superadiabatic so surface parcel is buoyant.
  const mixedLapse = 0.01;
  const aboveLapse = 0.006;

  const tempAt = (z: number): number =>
    z <= capMslM
      ? surfaceTempC - mixedLapse * z
      : surfaceTempC - mixedLapse * capMslM + capK - aboveLapse * (z - capMslM);

  let pressureHPa = 1013;
  let previousZ = 0;
  let previousT = surfaceTempC;

  return heights.map((z) => {
    const tempC = tempAt(z);
    const meanTk = (tempC + previousT) / 2 + 273.15;
    pressureHPa *= Math.exp((-G * (z - previousZ)) / (RD * meanTk));
    previousZ = z;
    previousT = tempC;
    return {
      pressurePa: hPaToPa(pressureHPa),
      geopotentialMslM: m(z),
      tempK: celsiusToK(tempC),
      dewpointK: celsiusToK(Math.min(dewC, tempC)),
      windSpeedMs: mps(5),
      windFromDeg: deg(270),
    };
  });
}

export function syntheticSounding(
  surfaceTempC: number,
  capMslM: number,
  capK: number,
  dewC = 0,
): Sounding {
  const built = buildSounding({
    site: FLAT_SITE,
    timeUtc: "2026-08-18T12:00",
    surface: surfaceState(surfaceTempC, dewC),
    pressureLevels: cappedProfile(surfaceTempC, capMslM, capK, dewC),
  });
  if (!built.ok) throw new Error(built.error.message);
  return built.value;
}

/**
 * Mountain wave sounding: strong stable layer above ridge crest with near-neutral layer above.
 */
export function waveSounding(
  lowerLapseKPerKm: number,
  upperLapseKPerKm: number,
  windMs: number,
  transitionMslM = 3000,
  windFromDeg = 270,
): Sounding {
  const heights = [
    200, 500, 900, 1300, 1700, 2100, 2500, 2900, 3300, 3800, 4400, 5000, 5900,
  ];
  const surfaceTempC = 20;

  const tempAt = (z: number): number =>
    z <= transitionMslM
      ? surfaceTempC - (lowerLapseKPerKm / 1000) * z
      : surfaceTempC -
        (lowerLapseKPerKm / 1000) * transitionMslM -
        (upperLapseKPerKm / 1000) * (z - transitionMslM);

  let pressureHPa = 1013;
  let previousZ = 0;
  let previousT = surfaceTempC;

  const levels: RawPressureLevel[] = heights.map((z) => {
    const tempC = tempAt(z);
    const meanTk = (tempC + previousT) / 2 + 273.15;
    pressureHPa *= Math.exp((-G * (z - previousZ)) / (RD * meanTk));
    previousZ = z;
    previousT = tempC;
    return {
      pressurePa: hPaToPa(pressureHPa),
      geopotentialMslM: m(z),
      tempK: celsiusToK(tempC),
      dewpointK: celsiusToK(tempC - 25),
      windSpeedMs: mps(windMs),
      windFromDeg: deg(windFromDeg),
    };
  });

  const built = buildSounding({
    site: FLAT_SITE,
    timeUtc: "2026-08-18T12:00",
    surface: {
      ...surfaceState(surfaceTempC, -5),
      windSpeedMs: mps(windMs),
      windFromDeg: deg(windFromDeg),
    },
    pressureLevels: levels,
  });
  if (!built.ok) throw new Error(built.error.message);
  return built.value;
}
