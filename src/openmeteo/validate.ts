/**
 * Open-Meteo response validation.
 *
 * Performs three key verifications:
 * 1. **Content-based detection**: checks for populated data rather than bare key presence.
 * 2. **Request echo**: verifies returned elevation and timezone match query parameters.
 * 3. **Units validation**: validates expected units before normalization.
 */

import { err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import type { Site } from "../types/site.js";
import type { HourlySeries, OpenMeteoResponse } from "./types.js";

/**
 * Unit string returned by Open-Meteo when a variable is unsupported by the requested model.
 */
export const ABSENT_UNIT = "undefined";

/** Elevation echo tolerance in metres. */
export const ELEVATION_ECHO_TOLERANCE_M = 1;

/** Expected units per variable category. */
export const EXPECTED_UNITS: Readonly<Record<string, string>> = {
  temperature_2m: "°C",
  surface_pressure: "hPa",
  pressure_msl: "hPa",
  wind_speed_10m: "m/s",
  wind_direction_10m: "°",
  shortwave_radiation: "W/m²",
  sensible_heat_flux: "W/m²",
  cape: "J/kg",
  boundary_layer_height: "m",
};

/**
 * Checks whether a variable contains non-null values.
 *
 * @source §4.8 of docs/OPEN_METEO_INTEGRATION.md.
 */
export function hasData(response: OpenMeteoResponse, key: string): boolean {
  const series = response.hourly[key];
  if (!series) return false;
  return (series as HourlySeries).some((value) => value !== null);
}

/** Returns requested variable names that yielded entirely empty (all-null) series. */
export function missingVariables(
  response: OpenMeteoResponse,
  requested: readonly string[],
): readonly string[] {
  return requested.filter((key) => !hasData(response, key));
}

/**
 * Verifies that response metadata matches requested site parameters.
 *
 * @source Requirements R-13.3 and R-13.4 from docs/REQUIREMENTS.md.
 */
export function validateEcho(
  response: OpenMeteoResponse,
  site: Site,
): Result<OpenMeteoResponse> {
  const elevationOffM = Math.abs(response.elevation - site.elevationMslM);
  if (elevationOffM > ELEVATION_ECHO_TOLERANCE_M) {
    return err("OUT_OF_VALID_RANGE", "elevation echo does not match the request", {
      requestedM: site.elevationMslM,
      returnedM: response.elevation,
    });
  }
  if (response.timezone !== site.timezone) {
    return err("OUT_OF_VALID_RANGE", "timezone echo does not match the request", {
      requested: site.timezone,
      returned: response.timezone,
    });
  }
  return ok(response);
}

/**
 * Validates declared response units against expected SI/meteorological units.
 *
 * @source §4.7 of docs/OPEN_METEO_INTEGRATION.md.
 */
export function validateUnits(response: OpenMeteoResponse): Result<OpenMeteoResponse> {
  for (const [key, expected] of Object.entries(EXPECTED_UNITS)) {
    const actual = response.hourly_units[key];
    if (actual !== undefined && actual !== ABSENT_UNIT && actual !== expected) {
      return err("MISSING_VARIABLE", `unexpected unit for ${key}`, {
        variable: key,
        expected,
        actual,
      });
    }
  }
  return ok(response);
}

/** Filters requested pressure levels down to those containing valid geopotential data. */
export function usableLevels(
  response: OpenMeteoResponse,
  levelsHpa: readonly number[],
): readonly number[] {
  return levelsHpa.filter((hpa) =>
    hasData(response, `geopotential_height_${String(hpa)}hPa`),
  );
}
