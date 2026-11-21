/**
 * Open-Meteo contract test suite.
 *
 * Excluded from standard CI runs; intended for manual execution via `pnpm test:network`
 * and scheduled pipeline runs to verify external API stability against `docs/OPEN_METEO_INTEGRATION.md`.
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
import {
  DAYTIME_RADIATION_THRESHOLD_WM2,
  MIN_SAMPLES_FOR_DETECTION,
  detectFluxSign,
} from "../../src/convection/heatFluxSign.js";
import { FUENTEMILANOS_SITE } from "../helpers/sites.js";
import type { OpenMeteoModel } from "../../src/openmeteo/models.js";
import type { HourlySeries, OpenMeteoResponse } from "../../src/openmeteo/types.js";

/**
 * The scheduled run once lost ~100 s of Open-Meteo slowness to the library
 * defaults (10 s, one retry), failing five tests on timeouts that said nothing
 * about the contract. The suite waits longer than a consumer would.
 */
const REQUEST_TIMEOUT_MS = 20_000;
const REQUEST_RETRIES = 3;
/** Worst case for one `live()` call, with margin for backoff; CT-4 makes two. */
const TIMEOUT_MS = 2 * (REQUEST_RETRIES + 1) * REQUEST_TIMEOUT_MS + 10_000;

const REQUEST_OPTIONS = {
  timeoutMs: REQUEST_TIMEOUT_MS,
  retries: REQUEST_RETRIES,
} as const;

/** Error text with `detail` attached, so a timeout reads as one in the CI log. */
function describeError(error: {
  message: string;
  detail?: Readonly<Record<string, unknown>>;
}) {
  return error.detail === undefined
    ? error.message
    : `${error.message} ${JSON.stringify(error.detail)}`;
}

async function live(model: OpenMeteoModel): Promise<OpenMeteoResponse> {
  const request = buildForecastRequest(FUENTEMILANOS_SITE, { model, forecastDays: 1 });
  const result = await sendRequest(request, REQUEST_OPTIONS);
  if (!result.ok) throw new Error(`${model}: ${describeError(result.error)}`);
  return result.value;
}

const numbers = (response: OpenMeteoResponse, key: string): (number | null)[] =>
  (response.hourly[key] ?? []) as HourlySeries as (number | null)[];

describe("Open-Meteo API contract", () => {
  // CT-1, CT-3, CT-5, CT-6
  it(
    "ICON-EU serves requested variables with expected units and echo",
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
    "ICON-EU continues omitting boundary_layer_height and lifted_index",
    async () => {
      const response = await live("icon_eu");
      expect(hasData(response, "sensible_heat_flux")).toBe(true);
      expect(hasData(response, "boundary_layer_height")).toBe(false);
      expect(hasData(response, "lifted_index")).toBe(false);
    },
    TIMEOUT_MS,
  );

  it(
    "GFS continues serving boundary_layer_height and lifted_index",
    async () => {
      const response = await live("gfs_seamless");
      expect(hasData(response, "boundary_layer_height")).toBe(true);
      expect(hasData(response, "lifted_index")).toBe(true);
      expect(hasData(response, "sensible_heat_flux")).toBe(true);
    },
    TIMEOUT_MS,
  );

  // CT-4: flux sign inversion check
  it(
    "heat flux signs remain inverted between ICON and GFS",
    async (context) => {
      const icon = await live("icon_eu");
      const gfs = await live("gfs_seamless");
      const detect = (response: OpenMeteoResponse) =>
        detectFluxSign(
          numbers(response, "shortwave_radiation").map((radiation, index) => ({
            shortwaveWm2: radiation ?? 0,
            fluxWm2: numbers(response, "sensible_heat_flux")[index] ?? null,
          })),
        );
      const iconSign = detect(icon);
      const gfsSign = detect(gfs);
      // An overcast day leaves no hour above the radiation threshold, and the
      // detector rightly answers "unknown". That says nothing about the
      // contract, so the test is skipped rather than failed.
      const fewest = Math.min(iconSign.samplesUsed, gfsSign.samplesUsed);
      if (fewest < MIN_SAMPLES_FOR_DETECTION) {
        context.skip(
          `only ${String(fewest)} hour(s) above ${String(DAYTIME_RADIATION_THRESHOLD_WM2)} W/m² today`,
        );
      }
      expect(iconSign.convention).toBe("down_positive");
      expect(gfsSign.convention).toBe("up_positive");
    },
    TIMEOUT_MS,
  );

  // CT-8
  it(
    "ECMWF continues omitting pressure levels at this coordinate",
    async () => {
      const response = await live("ecmwf_ifs");
      expect(usableLevels(response, [900, 850, 800, 700])).toEqual([]);
    },
    TIMEOUT_MS,
  );

  // CT-9
  it(
    "underground pressure levels return non-physical values and are pruned",
    async () => {
      const request = buildForecastRequest(
        { ...FUENTEMILANOS_SITE, elevationMslM: FUENTEMILANOS_SITE.elevationMslM },
        { model: "icon_eu", forecastDays: 1 },
      );
      // Pruned request omits 1000 hPa...
      expect(request.body.getAll("hourly")).not.toContain("temperature_1000hPa");

      // Explicit query returns populated but non-physical values.
      const withUnderground = buildForecastRequest(
        { ...FUENTEMILANOS_SITE, elevationMslM: FUENTEMILANOS_SITE.elevationMslM },
        { model: "icon_eu", forecastDays: 1 },
      );
      withUnderground.body.append("hourly", "temperature_1000hPa");
      withUnderground.body.append("hourly", "geopotential_height_1000hPa");
      const result = await sendRequest(withUnderground, REQUEST_OPTIONS);
      if (!result.ok) throw new Error(`icon_eu: ${describeError(result.error)}`);
      expect(hasData(result.value, "temperature_1000hPa")).toBe(true);
      const heights = numbers(result.value, "geopotential_height_1000hPa");
      expect(Math.max(...heights.map((h) => h ?? 0))).toBeLessThan(
        FUENTEMILANOS_SITE.elevationMslM,
      );
    },
    TIMEOUT_MS,
  );

  it(
    "invalid variable names return HTTP 400 and fail request",
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
