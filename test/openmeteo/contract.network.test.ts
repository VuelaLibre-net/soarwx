/**
 * Prueba de contrato con Open-Meteo.
 *
 * **Toca la red y está excluida del CI**: se ejecuta con `pnpm test:network` y
 * en un cron semanal. La API es de terceros y no debe romper el build; un
 * fallo aquí abre incidencia.
 *
 * Verifica que sigue siendo cierto lo que afirma `docs/OPEN_METEO_INTEGRATION.md`.
 */

import { describe, expect, it } from "vitest";
import { buildForecastRequest } from "../../src/openmeteo/url.js";
import { sendRequest } from "../../src/openmeteo/client.js";
import {
  hasData,
  usableLevels,
  validateEcho,
  validateUnits,
} from "../../src/openmeteo/validate.js";
import { detectFluxSign } from "../../src/convection/heatFluxSign.js";
import { FUENTEMILANOS_SITE } from "../helpers/sites.js";
import type { OpenMeteoModel } from "../../src/openmeteo/models.js";
import type { HourlySeries, OpenMeteoResponse } from "../../src/openmeteo/types.js";

const TIMEOUT_MS = 30_000;

async function live(model: OpenMeteoModel): Promise<OpenMeteoResponse> {
  const request = buildForecastRequest(FUENTEMILANOS_SITE, { model, forecastDays: 1 });
  const result = await sendRequest(request, { retries: 1 });
  if (!result.ok) throw new Error(`${model}: ${result.error.message}`);
  return result.value;
}

const numbers = (response: OpenMeteoResponse, key: string): (number | null)[] =>
  (response.hourly[key] ?? []) as HourlySeries as (number | null)[];

describe("contrato con Open-Meteo", () => {
  // CT-1, CT-3, CT-5, CT-6
  it(
    "ICON-EU acepta todas las variables, con las unidades y el eco esperados",
    async () => {
      const response = await live("icon_eu");
      expect(validateEcho(response, FUENTEMILANOS_SITE).ok).toBe(true);
      expect(validateUnits(response).ok).toBe(true);
      expect(response.utc_offset_seconds).toBeGreaterThan(0);
    },
    TIMEOUT_MS,
  );

  // CT-2, CT-7
  it(
    "ICON-EU sigue sin servir boundary_layer_height ni lifted_index",
    async () => {
      const response = await live("icon_eu");
      expect(hasData(response, "sensible_heat_flux")).toBe(true);
      expect(hasData(response, "boundary_layer_height")).toBe(false);
      expect(hasData(response, "lifted_index")).toBe(false);
    },
    TIMEOUT_MS,
  );

  it(
    "GFS sigue sirviendo boundary_layer_height y lifted_index",
    async () => {
      const response = await live("gfs_seamless");
      expect(hasData(response, "boundary_layer_height")).toBe(true);
      expect(hasData(response, "lifted_index")).toBe(true);
      expect(hasData(response, "sensible_heat_flux")).toBe(true);
    },
    TIMEOUT_MS,
  );

  // CT-4: la trampa que más silenciosamente rompe todo.
  it(
    "el signo del flujo sigue siendo opuesto entre ICON y GFS",
    async () => {
      const icon = await live("icon_eu");
      const gfs = await live("gfs_seamless");
      const sign = (response: OpenMeteoResponse) =>
        detectFluxSign(
          numbers(response, "shortwave_radiation").map((radiation, index) => ({
            shortwaveWm2: radiation ?? 0,
            fluxWm2: numbers(response, "sensible_heat_flux")[index] ?? null,
          })),
        ).convention;
      expect(sign(icon)).toBe("down_positive");
      expect(sign(gfs)).toBe("up_positive");
    },
    TIMEOUT_MS,
  );

  // CT-8
  it(
    "ECMWF sigue sin servir niveles de presión aquí",
    async () => {
      const response = await live("ecmwf_ifs");
      expect(usableLevels(response, [900, 850, 800, 700])).toEqual([]);
    },
    TIMEOUT_MS,
  );

  // CT-9
  it(
    "los niveles bajo tierra siguen llegando con valores, y por eso se podan",
    async () => {
      const request = buildForecastRequest(
        { ...FUENTEMILANOS_SITE, elevationMslM: FUENTEMILANOS_SITE.elevationMslM },
        { model: "icon_eu", forecastDays: 1 },
      );
      // La petición ya no los incluye...
      expect(request.body.getAll("hourly")).not.toContain("temperature_1000hPa");

      // ...pero si se piden, llegan con valores sin significado físico.
      const withUnderground = buildForecastRequest(
        { ...FUENTEMILANOS_SITE, elevationMslM: FUENTEMILANOS_SITE.elevationMslM },
        { model: "icon_eu", forecastDays: 1 },
      );
      withUnderground.body.append("hourly", "temperature_1000hPa");
      withUnderground.body.append("hourly", "geopotential_height_1000hPa");
      const result = await sendRequest(withUnderground, { retries: 1 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(hasData(result.value, "temperature_1000hPa")).toBe(true);
      const heights = numbers(result.value, "geopotential_height_1000hPa");
      expect(Math.max(...heights.map((h) => h ?? 0))).toBeLessThan(
        FUENTEMILANOS_SITE.elevationMslM,
      );
    },
    TIMEOUT_MS,
  );

  it(
    "un nombre de variable inválido sigue devolviendo 400 y tumbando la petición",
    async () => {
      const request = buildForecastRequest(FUENTEMILANOS_SITE, {
        model: "icon_eu",
        forecastDays: 1,
      });
      request.body.append("hourly", "aerosol_optical_depth_550nm");
      const result = await sendRequest(request, { retries: 0 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("FETCH_FAILED");
    },
    TIMEOUT_MS,
  );
});
