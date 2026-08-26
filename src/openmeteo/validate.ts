/**
 * Validación de la respuesta.
 *
 * Tres comprobaciones que evitan errores silenciosos:
 *
 * 1. **Detección por contenido, no por clave.** Open-Meteo no da error si se
 *    pide una variable que el modelo no tiene: la acepta, la lista en
 *    `hourly_units` y devuelve un array de `null`. Un cliente ingenuo ve la
 *    clave y asume el dato.
 * 2. **Eco de la petición.** Si la elevación o la zona horaria devueltas no son
 *    las pedidas, todo lo que sigue está mal anclado.
 * 3. **Unidades.** Se envía `wind_speed_unit=ms`, pero la conversión no se
 *    asume: se comprueba antes de convertir.
 */

import { err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import type { Site } from "../types/site.js";
import type { HourlySeries, OpenMeteoResponse } from "./types.js";

/**
 * Unidad que Open-Meteo devuelve para una variable que el modelo **no sirve**:
 * la cadena literal `"undefined"`, no la ausencia de la clave ni `null`.
 * Medido con `boundary_layer_height` en ICON-EU.
 */
export const ABSENT_UNIT = "undefined";

/** Tolerancia del eco de elevación, en metros. */
export const ELEVATION_ECHO_TOLERANCE_M = 1;

/** Unidades que se esperan de cada familia de variable. */
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
 * ¿La variable trae datos de verdad? Una clave presente con todo a `null` no
 * es un dato.
 *
 * @source §4.8 de docs/OPEN_METEO_INTEGRATION.md.
 */
export function hasData(response: OpenMeteoResponse, key: string): boolean {
  const series = response.hourly[key];
  if (!series) return false;
  return (series as HourlySeries).some((value) => value !== null);
}

/** Variables pedidas que llegaron completamente vacías. */
export function missingVariables(
  response: OpenMeteoResponse,
  requested: readonly string[],
): readonly string[] {
  return requested.filter((key) => !hasData(response, key));
}

/**
 * Comprueba que la respuesta corresponde a lo que se pidió.
 *
 * @source R-13.3 y R-13.4 de docs/REQUIREMENTS.md.
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
 * Comprueba las unidades declaradas antes de convertir nada.
 *
 * @source §4.7 de docs/OPEN_METEO_INTEGRATION.md.
 */
export function validateUnits(response: OpenMeteoResponse): Result<OpenMeteoResponse> {
  for (const [key, expected] of Object.entries(EXPECTED_UNITS)) {
    const actual = response.hourly_units[key];
    // `"undefined"` significa que el modelo no sirve esa variable. No es un
    // error de unidades: lo detecta `hasData`, que mira el contenido.
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

/** ¿La respuesta trae suficientes niveles de presión con datos? */
export function usableLevels(
  response: OpenMeteoResponse,
  levelsHpa: readonly number[],
): readonly number[] {
  return levelsHpa.filter((hpa) =>
    hasData(response, `geopotential_height_${String(hpa)}hPa`),
  );
}
