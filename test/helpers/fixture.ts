/**
 * Loads Open-Meteo test fixture data and maps it to `SoundingInput`.
 *
 * Test helper module for test suites.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { celsiusToK, hPaToPa } from "../../src/units/convert.js";
import { deg, m, mps, wm2 } from "../../src/units/branded.js";
import type { SoundingInput, RawPressureLevel } from "../../src/sounding/build.js";
import type { RawHeightLevel } from "../../src/sounding/heightLevels.js";
import type { SurfaceState } from "../../src/sounding/types.js";
import type { Site } from "../../src/types/site.js";
import { buildSounding } from "../../src/sounding/build.js";
import type { HourlyObservation } from "../../src/report/types.js";
import type { FluxSignConvention } from "../../src/convection/heatFluxSign.js";

type Hourly = Record<string, (number | null)[] | string[]>;

export interface OpenMeteoFixture {
  readonly elevation: number;
  readonly timezone: string;
  readonly utc_offset_seconds: number;
  readonly hourly: Hourly;
  readonly daily: Record<string, string[]>;
}

export const FUENTEMILANOS: Site = {
  name: "Fuentemilanos",
  icao: "LEFM",
  latDeg: 40.9167,
  lonDeg: -4.2333,
  elevationMslM: m(1001),
  timezone: "Europe/Madrid",
};

export const PRESSURE_LEVELS_HPA = [
  1000, 975, 950, 925, 900, 850, 800, 700, 600, 500,
] as const;

export const HEIGHT_LEVELS_M = [80, 120, 180] as const;

/** Numerical series from fixture with missing entries as null. */
export function series(fixture: OpenMeteoFixture, key: string): (number | null)[] {
  const raw = fixture.hourly[key];
  if (!raw) throw new Error(`variable missing in fixture: ${key}`);
  return raw as (number | null)[];
}

/** Timestamps from fixture in site timezone. */
export function times(fixture: OpenMeteoFixture): string[] {
  return fixture.hourly["time"] as string[];
}

/** Maximum value of a series, ignoring nulls. */
export function seriesMax(fixture: OpenMeteoFixture, key: string): number {
  return Math.max(...series(fixture, key).map((v) => v ?? -Infinity));
}

export function loadFixture(name: string): OpenMeteoFixture {
  const path = fileURLToPath(new URL(`../fixtures/openmeteo/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as OpenMeteoFixture;
}

function has(hourly: Hourly, key: string, index: number): boolean {
  const series = hourly[key];
  return series !== undefined && typeof series[index] === "number";
}

function num(hourly: Hourly, key: string, index: number): number {
  const series = hourly[key];
  if (!series) throw new Error(`variable missing in fixture: ${key}`);
  const value = series[index];
  if (typeof value !== "number")
    throw new Error(`null value in ${key}[${String(index)}]`);
  return value;
}

/** Hourly index matching specified local hour. */
export function indexOfLocalHour(fixture: OpenMeteoFixture, hour: number): number {
  const times = fixture.hourly["time"] as string[];
  const found = times.findIndex((t) => Number(t.slice(11, 13)) === hour);
  if (found < 0) throw new Error(`local hour not found: ${String(hour)}`);
  return found;
}

export function toSoundingInput(
  fixture: OpenMeteoFixture,
  index: number,
  site: Site = FUENTEMILANOS,
): SoundingInput {
  const h = fixture.hourly;

  const surface: SurfaceState = {
    tempK: celsiusToK(num(h, "temperature_2m", index)),
    dewpointK: celsiusToK(num(h, "dew_point_2m", index)),
    pressurePa: hPaToPa(num(h, "surface_pressure", index)),
    mslPressurePa: hPaToPa(num(h, "pressure_msl", index)),
    windSpeedMs: mps(num(h, "wind_speed_10m", index)),
    windFromDeg: deg(num(h, "wind_direction_10m", index)),
    windGustMs: mps(num(h, "wind_gusts_10m", index)),
    shortwaveWm2: wm2(num(h, "shortwave_radiation", index)),
    cloudCoverFrac: num(h, "cloud_cover", index) / 100,
    cloudCoverLowFrac: num(h, "cloud_cover_low", index) / 100,
    cloudCoverMidFrac: num(h, "cloud_cover_mid", index) / 100,
    cloudCoverHighFrac: num(h, "cloud_cover_high", index) / 100,
  };

  const pressureLevels: RawPressureLevel[] = PRESSURE_LEVELS_HPA.map((hpa) => ({
    pressurePa: hPaToPa(hpa),
    geopotentialMslM: m(num(h, `geopotential_height_${String(hpa)}hPa`, index)),
    tempK: celsiusToK(num(h, `temperature_${String(hpa)}hPa`, index)),
    dewpointK: celsiusToK(num(h, `dew_point_${String(hpa)}hPa`, index)),
    windSpeedMs: mps(num(h, `wind_speed_${String(hpa)}hPa`, index)),
    windFromDeg: deg(num(h, `wind_direction_${String(hpa)}hPa`, index)),
    cloudCoverFrac: num(h, `cloud_cover_${String(hpa)}hPa`, index) / 100,
  }));

  const heightLevels: RawHeightLevel[] = HEIGHT_LEVELS_M.filter((z) =>
    has(h, `temperature_${String(z)}m`, index),
  ).map((z) => ({
    heightAglM: m(z),
    tempK: celsiusToK(num(h, `temperature_${String(z)}m`, index)),
    windSpeedMs: mps(num(h, `wind_speed_${String(z)}m`, index)),
    windFromDeg: deg(num(h, `wind_direction_${String(z)}m`, index)),
  }));

  return {
    site,
    timeUtc: (h["time"] as string[])[index] ?? "",
    surface,
    pressureLevels,
    heightLevels,
  };
}

/** Constructs hourly observations from fixture for `computeDay`. */
export function toHourlyObservations(
  fixture: OpenMeteoFixture,
  site: Site,
  convention: FluxSignConvention,
): HourlyObservation[] {
  const observations: HourlyObservation[] = [];
  const optional = (key: string, index: number): number | null => {
    const raw = fixture.hourly[key];
    if (!raw) return null;
    const value = (raw as (number | null)[])[index];
    return typeof value === "number" ? value : null;
  };

  times(fixture).forEach((time, index) => {
    const built = buildSounding(toSoundingInput(fixture, index, site));
    if (!built.ok) return;
    const blh = optional("boundary_layer_height", index);
    observations.push({
      timeUtc: time,
      sounding: built.value,
      modelFluxWm2: optional("sensible_heat_flux", index),
      fluxConvention: convention,
      capeJkg: optional("cape", index),
      convectiveInhibitionJkg: optional("convective_inhibition", index),
      modelLiftedIndex: optional("lifted_index", index),
      boundaryLayerHeightAglM: blh === null ? null : m(blh),
    });
  });
  return observations;
}
