/**
 * HTTP request construction for Open-Meteo API.
 *
 * Employs HTTP POST with repeated form fields to avoid URL length constraints.
 */

import type { Site } from "../types/site.js";
import type { OpenMeteoModel } from "./models.js";
import { MODEL_CAPABILITIES } from "./models.js";
import { DAILY_VARIABLES, SURFACE_VARIABLES, levelVariableNames } from "./variables.js";

export const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
export const COMMERCIAL_FORECAST_URL = "https://customer-api.open-meteo.com/v1/forecast";

/**
 * Margin below site elevation (metres) below which pressure levels are pruned.
 */
export const BELOW_GROUND_MARGIN_M = 150;

export interface ForecastRequestOptions {
  readonly model: OpenMeteoModel;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly forecastDays?: number;
  readonly apiKey?: string;
  readonly baseUrl?: string;
}

export interface HttpRequest {
  readonly url: string;
  readonly method: "POST";
  readonly body: URLSearchParams;
  /** Actual pressure levels requested after underground pruning. */
  readonly levelsHpa: readonly number[];
}

/**
 * Computes geopotential altitude of a pressure level in the International Standard Atmosphere (ISA).
 *
 *     z = (1 − (p/p0)^(1/5.25588)) / 2.25577e-5
 *
 * @source International Standard Atmosphere (ISA) tropospheric formula.
 */
export function standardAtmosphereHeightM(pressureHpa: number): number {
  return (1 - Math.pow(pressureHpa / 1013.25, 1 / 5.25588)) / 2.25577e-5;
}

/**
 * Identifies pressure levels above ground elevation for a site.
 *
 * Pruning underground levels avoids redundant network bandwidth and API quota usage.
 *
 * @source Requirement R-1.2 and §5.2 of docs/OPEN_METEO_INTEGRATION.md.
 */
export function levelsForSite(
  site: Site,
  available: readonly number[],
  marginM: number = BELOW_GROUND_MARGIN_M,
): readonly number[] {
  return available.filter(
    (hpa) => standardAtmosphereHeightM(hpa) >= site.elevationMslM - marginM,
  );
}

/**
 * Constructs an HTTP request for Open-Meteo forecast API.
 *
 * Always includes site elevation, timezone, and SI wind speed units (`wind_speed_unit=ms`).
 *
 * @source Requirements R-13.3 through R-13.5 from docs/REQUIREMENTS.md.
 */
export function buildForecastRequest(
  site: Site,
  options: ForecastRequestOptions,
): HttpRequest {
  const capabilities = MODEL_CAPABILITIES[options.model];
  const levelsHpa = levelsForSite(site, capabilities.pressureLevelsHpa);

  const body = new URLSearchParams();
  body.append("latitude", site.latDeg.toFixed(6));
  body.append("longitude", site.lonDeg.toFixed(6));
  body.append("elevation", String(site.elevationMslM));
  body.append("timezone", site.timezone);
  body.append("wind_speed_unit", "ms");
  body.append("timeformat", "iso8601");
  body.append("models", options.model);

  if (options.startDate !== undefined && options.endDate !== undefined) {
    body.append("start_date", options.startDate);
    body.append("end_date", options.endDate);
  } else {
    body.append("forecast_days", String(options.forecastDays ?? 3));
  }

  for (const variable of DAILY_VARIABLES) body.append("daily", variable);
  for (const variable of SURFACE_VARIABLES) body.append("hourly", variable);
  for (const variable of levelVariableNames(levelsHpa)) body.append("hourly", variable);

  if (options.apiKey !== undefined) body.append("apikey", options.apiKey);

  return {
    url:
      options.baseUrl ??
      (options.apiKey === undefined ? FORECAST_URL : COMMERCIAL_FORECAST_URL),
    method: "POST",
    body,
    levelsHpa,
  };
}
