/**
 * Construcción de la petición.
 *
 * Se usa **POST con campos repetidos**. Dos motivos medidos:
 *
 * - La petición de sondeo completo lleva unas 90 variables y la URL supera el
 *   kilobyte; un GET así falla en la capa de transporte.
 * - Open-Meteo acepta POST, pero los arrays van como **campos repetidos**:
 *   `hourly=a&hourly=b`. Unirlos por comas devuelve HTTP 400 con
 *   `Cannot initialize SurfacePressureAndHeightVariable… from invalid String value`.
 */

import type { Site } from "../types/site.js";
import type { OpenMeteoModel } from "./models.js";
import { MODEL_CAPABILITIES } from "./models.js";
import { DAILY_VARIABLES, SURFACE_VARIABLES, levelVariableNames } from "./variables.js";

export const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
export const COMMERCIAL_FORECAST_URL = "https://customer-api.open-meteo.com/v1/forecast";

/**
 * Margen bajo la elevación por debajo del cual un nivel se considera bajo
 * tierra. Deja pasar los que quedan justo en el límite, porque la atmósfera
 * estándar solo aproxima la relación entre presión y altura.
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
  /** Niveles realmente pedidos, tras podar los que caen bajo tierra. */
  readonly levelsHpa: readonly number[];
}

/**
 * Altura de un nivel de presión en la atmósfera estándar internacional.
 *
 *     z = (1 − (p/p0)^(1/5.25588)) / 2.25577e-5
 *
 * @source Atmósfera estándar internacional (ISA), capa troposférica.
 */
export function standardAtmosphereHeightM(pressureHpa: number): number {
  return (1 - Math.pow(pressureHpa / 1013.25, 1 / 5.25588)) / 2.25577e-5;
}

/**
 * Niveles que merece la pena pedir para un emplazamiento.
 *
 * En Fuentemilanos (1001 m) descarta 1000, 975, 950 y 925 hPa: cuatro niveles,
 * veinticuatro variables, más de dos llamadas de cuota por modelo y día.
 *
 * @source R-1.2 y §5.2 de docs/OPEN_METEO_INTEGRATION.md.
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
 * Petición de previsión para un modelo.
 *
 * Envía **siempre** `elevation`, `timezone` del emplazamiento y
 * `wind_speed_unit=ms`. Nunca `timezone=UTC` con fechas locales: en España en
 * verano eso convierte el día en las 02:00 a 02:00 hora local y se pierden las
 * dos últimas horas de tarde térmica.
 *
 * @source R-13.3 a R-13.5 de docs/REQUIREMENTS.md.
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
