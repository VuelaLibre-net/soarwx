/**
 * Forecast response normalization to internal SI structures.
 *
 * Handles model-specific sensible heat flux sign conventions and hourly centering of shortwave radiation.
 */

import { deg, m, mps, wm2 } from "../units/branded.js";
import { celsiusToK, hPaToPa } from "../units/convert.js";
import { err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import type { Site } from "../types/site.js";
import { buildSounding } from "../sounding/build.js";
import type { RawPressureLevel } from "../sounding/build.js";
import type { RawHeightLevel } from "../sounding/heightLevels.js";
import type { SurfaceState } from "../sounding/types.js";
import { detectFluxSign } from "../convection/heatFluxSign.js";
import type { FluxSignConvention } from "../convection/heatFluxSign.js";
import type { HourlyObservation } from "../report/types.js";
import { HEIGHT_LEVELS_M } from "./variables.js";
import { hasData, usableLevels } from "./validate.js";
import type { HourlySeries, OpenMeteoResponse } from "./types.js";

function series(response: OpenMeteoResponse, key: string): HourlySeries | null {
  const raw = response.hourly[key];
  if (!raw) return null;
  return raw as HourlySeries;
}

function value(response: OpenMeteoResponse, key: string, index: number): number | null {
  const raw = series(response, key);
  if (!raw) return null;
  const item = raw[index];
  return typeof item === "number" ? item : null;
}

function times(response: OpenMeteoResponse): readonly string[] {
  return (response.hourly["time"] ?? []) as readonly string[];
}

/**
 * Returns centered shortwave radiation value (W/m²).
 *
 * Open-Meteo `shortwave_radiation` represents preceding hour average.
 * It is averaged with the subsequent timestamp to align with instantaneous temperature readings.
 *
 * @source §4.7 of docs/OPEN_METEO_INTEGRATION.md.
 */
export function centredRadiationWm2(response: OpenMeteoResponse, index: number): number {
  const here = value(response, "shortwave_radiation", index) ?? 0;
  const next = value(response, "shortwave_radiation", index + 1);
  return next === null ? here : (here + next) / 2;
}

export interface NormalisedForecast {
  readonly observations: readonly HourlyObservation[];
  readonly fluxConvention: FluxSignConvention;
  readonly levelsUsedHpa: readonly number[];
  readonly missing: readonly string[];
  readonly sunriseUtc: string | null;
  readonly sunsetUtc: string | null;
}

/**
 * Normalizes Open-Meteo response into hourly observations for `computeDay`.
 *
 * @source docs/OPEN_METEO_INTEGRATION.md §6.1, steps 9 to 12.
 */
export function normaliseForecast(
  response: OpenMeteoResponse,
  site: Site,
  requestedLevelsHpa: readonly number[],
): Result<NormalisedForecast> {
  const timestamps = times(response);
  if (timestamps.length === 0) {
    return err("MISSING_VARIABLE", "response has no time axis");
  }

  const levelsUsedHpa = usableLevels(response, requestedLevelsHpa);
  if (levelsUsedHpa.length === 0) {
    return err("INSUFFICIENT_LEVELS", "the model served no pressure levels here", {
      requested: requestedLevelsHpa,
    });
  }

  const fluxSeries = series(response, "sensible_heat_flux");
  const radiationSeries = series(response, "shortwave_radiation");
  const fluxConvention =
    fluxSeries === null || radiationSeries === null
      ? "unknown"
      : detectFluxSign(
          timestamps.map((_, i) => ({
            shortwaveWm2: (radiationSeries[i] as number | null) ?? 0,
            fluxWm2: (fluxSeries[i] as number | null) ?? null,
          })),
        ).convention;

  const heightLevelsAvailable = HEIGHT_LEVELS_M.filter((z) =>
    hasData(response, `temperature_${String(z)}m`),
  );

  const missing: string[] = [];
  for (const key of ["lifted_index", "boundary_layer_height", "sensible_heat_flux"]) {
    if (!hasData(response, key)) missing.push(key);
  }

  const observations: HourlyObservation[] = [];

  for (let index = 0; index < timestamps.length; index++) {
    const surface = readSurface(response, index);
    if (surface === null) continue;

    const pressureLevels: RawPressureLevel[] = [];
    for (const hpa of levelsUsedHpa) {
      const level = readPressureLevel(response, hpa, index);
      if (level !== null) pressureLevels.push(level);
    }

    const heightLevels: RawHeightLevel[] = [];
    for (const z of heightLevelsAvailable) {
      const level = readHeightLevel(response, z, index);
      if (level !== null) heightLevels.push(level);
    }

    const sounding = buildSounding({
      site,
      timeUtc: timestamps[index] ?? "",
      surface,
      pressureLevels,
      heightLevels,
      missing,
    });
    if (!sounding.ok) continue;

    const blh = value(response, "boundary_layer_height", index);
    observations.push({
      timeUtc: timestamps[index] ?? "",
      sounding: sounding.value,
      modelFluxWm2: value(response, "sensible_heat_flux", index),
      fluxConvention,
      capeJkg: value(response, "cape", index),
      convectiveInhibitionJkg: value(response, "convective_inhibition", index),
      modelLiftedIndex: value(response, "lifted_index", index),
      boundaryLayerHeightAglM: blh === null ? null : m(blh),
      ...(value(response, "soil_moisture_0_to_1cm", index) === null
        ? {}
        : { soilMoistureFrac: value(response, "soil_moisture_0_to_1cm", index) ?? 0 }),
    });
  }

  if (observations.length === 0) {
    return err("INSUFFICIENT_LEVELS", "no hour produced a usable sounding");
  }

  return ok({
    observations,
    fluxConvention,
    levelsUsedHpa,
    missing,
    sunriseUtc: response.daily?.["sunrise"]?.[0] ?? null,
    sunsetUtc: response.daily?.["sunset"]?.[0] ?? null,
  });
}

function readSurface(response: OpenMeteoResponse, index: number): SurfaceState | null {
  const temp = value(response, "temperature_2m", index);
  const dew = value(response, "dew_point_2m", index);
  const pressure = value(response, "surface_pressure", index);
  if (temp === null || dew === null || pressure === null) return null;

  const gust = value(response, "wind_gusts_10m", index);
  return {
    tempK: celsiusToK(temp),
    dewpointK: celsiusToK(dew),
    pressurePa: hPaToPa(pressure),
    mslPressurePa: hPaToPa(value(response, "pressure_msl", index) ?? pressure),
    windSpeedMs: mps(value(response, "wind_speed_10m", index) ?? 0),
    windFromDeg: deg(value(response, "wind_direction_10m", index) ?? 0),
    ...(gust === null ? {} : { windGustMs: mps(gust) }),
    shortwaveWm2: wm2(centredRadiationWm2(response, index)),
    cloudCoverFrac: (value(response, "cloud_cover", index) ?? 0) / 100,
    cloudCoverLowFrac: (value(response, "cloud_cover_low", index) ?? 0) / 100,
    cloudCoverMidFrac: (value(response, "cloud_cover_mid", index) ?? 0) / 100,
    cloudCoverHighFrac: (value(response, "cloud_cover_high", index) ?? 0) / 100,
  };
}

function readPressureLevel(
  response: OpenMeteoResponse,
  hpa: number,
  index: number,
): RawPressureLevel | null {
  const suffix = `_${String(hpa)}hPa`;
  const height = value(response, `geopotential_height${suffix}`, index);
  const temp = value(response, `temperature${suffix}`, index);
  const dew = value(response, `dew_point${suffix}`, index);
  if (height === null || temp === null || dew === null) return null;

  const cover = value(response, `cloud_cover${suffix}`, index);
  return {
    pressurePa: hPaToPa(hpa),
    geopotentialMslM: m(height),
    tempK: celsiusToK(temp),
    dewpointK: celsiusToK(dew),
    windSpeedMs: mps(value(response, `wind_speed${suffix}`, index) ?? 0),
    windFromDeg: deg(value(response, `wind_direction${suffix}`, index) ?? 0),
    ...(cover === null ? {} : { cloudCoverFrac: cover / 100 }),
  };
}

function readHeightLevel(
  response: OpenMeteoResponse,
  heightM: number,
  index: number,
): RawHeightLevel | null {
  const temp = value(response, `temperature_${String(heightM)}m`, index);
  if (temp === null) return null;
  return {
    heightAglM: m(heightM),
    tempK: celsiusToK(temp),
    windSpeedMs: mps(value(response, `wind_speed_${String(heightM)}m`, index) ?? 0),
    windFromDeg: deg(value(response, `wind_direction_${String(heightM)}m`, index) ?? 0),
  };
}
