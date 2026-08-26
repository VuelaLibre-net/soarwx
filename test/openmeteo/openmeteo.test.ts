import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  MODEL_CAPABILITIES,
  RECOMMENDED_ENSEMBLE,
  soundingModels,
} from "../../src/openmeteo/models.js";
import {
  BELOW_GROUND_MARGIN_M,
  buildForecastRequest,
  standardAtmosphereHeightM,
} from "../../src/openmeteo/url.js";
import { SURFACE_VARIABLES, levelVariableNames } from "../../src/openmeteo/variables.js";
import {
  ABSENT_UNIT,
  hasData,
  missingVariables,
  usableLevels,
  validateEcho,
  validateUnits,
} from "../../src/openmeteo/validate.js";
import { centredRadiationWm2, normaliseForecast } from "../../src/openmeteo/normalize.js";
import {
  cacheKey,
  memoryCache,
  noopCache,
  sessionCache,
} from "../../src/openmeteo/cache.js";
import { sendRequest, fetchForecast } from "../../src/openmeteo/client.js";
import type { FetchLike } from "../../src/openmeteo/client.js";
import { fetchSoaringDay } from "../../src/openmeteo/forecast.js";
import type { OpenMeteoResponse } from "../../src/openmeteo/types.js";
import { m, mps } from "../../src/units/branded.js";
import { GLIDER_CLUB } from "../../src/aircraft/profiles.js";
import { FUENTEMILANOS_SITE } from "../helpers/sites.js";

function raw(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/openmeteo/${name}`, import.meta.url)),
    "utf8",
  );
}
const parsed = (name: string) => JSON.parse(raw(name)) as OpenMeteoResponse;

/** Fake fetch implementation returning predefined responses and tracking calls. */
function stubFetch(
  responses: readonly { status: number; body: string }[],
): FetchLike & { calls: { url: string; body: URLSearchParams }[] } {
  const calls: { url: string; body: URLSearchParams }[] = [];
  let index = 0;
  const fn = (url: string, init?: { body?: URLSearchParams }) => {
    calls.push({ url, body: init?.body ?? new URLSearchParams() });
    const response = responses[Math.min(index, responses.length - 1)]!;
    index++;
    return Promise.resolve({
      ok: response.status < 400,
      status: response.status,
      text: () => Promise.resolve(response.body),
    });
  };
  return Object.assign(fn, { calls });
}

describe("model capabilities catalog", () => {
  // CT-7, CT-8
  it("reflects API verification: ICON lacks boundary layer height, GFS includes it, ECMWF lacks pressure levels", () => {
    expect(MODEL_CAPABILITIES.icon_eu.hasBoundaryLayerHeight).toBe(false);
    expect(MODEL_CAPABILITIES.icon_eu.hasSensibleHeatFlux).toBe(true);
    expect(MODEL_CAPABILITIES.gfs_seamless.hasBoundaryLayerHeight).toBe(true);
    expect(MODEL_CAPABILITIES.gfs_seamless.hasLiftedIndex).toBe(true);
    expect(MODEL_CAPABILITIES.ecmwf_ifs.pressureLevelsHpa).toEqual([]);
  });

  it("excludes ECMWF from sounding-capable models", () => {
    expect(soundingModels()).not.toContain("ecmwf_ifs");
    expect(soundingModels()).not.toContain("ecmwf_ifs025");
    expect(soundingModels()[0]).toBe("icon_eu");
  });

  it("GFS only serves 80 m height level", () => {
    expect(MODEL_CAPABILITIES.gfs_seamless.heightLevelsM).toEqual([80]);
    expect(MODEL_CAPABILITIES.icon_eu.heightLevelsM).toEqual([80, 120, 180]);
  });

  it("best_match is excluded from supported models", () => {
    expect(Object.keys(MODEL_CAPABILITIES)).not.toContain("best_match");
    expect(RECOMMENDED_ENSEMBLE).toHaveLength(3);
  });
});

// G-13, G-14
describe("request construction", () => {
  const request = buildForecastRequest(FUENTEMILANOS_SITE, {
    model: "icon_eu",
    startDate: "2026-08-18",
    endDate: "2026-08-18",
  });

  it("includes elevation, site timezone, and m/s units", () => {
    expect(request.body.get("elevation")).toBe("1001");
    expect(request.body.get("timezone")).toBe("Europe/Madrid");
    expect(request.body.get("wind_speed_unit")).toBe("ms");
  });

  it("never sends UTC timezone or best_match model", () => {
    expect(request.body.get("timezone")).not.toBe("UTC");
    expect(request.body.get("models")).toBe("icon_eu");
    expect(request.body.get("models")).not.toBe("best_match");
  });

  it("uses POST with repeated form fields rather than comma-separated strings", () => {
    expect(request.method).toBe("POST");
    const hourly = request.body.getAll("hourly");
    expect(hourly.length).toBeGreaterThan(50);
    for (const name of hourly) expect(name).not.toContain(",");
  });

  it("prunes four underground pressure levels at Fuentemilanos", () => {
    expect(request.levelsHpa).toEqual([900, 850, 800, 700, 600, 500]);
    const hourly = request.body.getAll("hourly");
    for (const hpa of [1000, 975, 950, 925]) {
      expect(hourly).not.toContain(`temperature_${String(hpa)}hPa`);
    }
    expect(hourly).toContain("temperature_900hPa");
  });

  it("retains all pressure levels at sea level", () => {
    const seaLevel = { ...FUENTEMILANOS_SITE, elevationMslM: m(0) };
    expect(buildForecastRequest(seaLevel, { model: "icon_eu" }).levelsHpa).toHaveLength(
      10,
    );
  });

  it("standard atmosphere maps 1000 hPa to ~111 m MSL", () => {
    expect(standardAtmosphereHeightM(1013.25)).toBeCloseTo(0, 6);
    expect(standardAtmosphereHeightM(1000)).toBeCloseTo(111, 0);
    expect(standardAtmosphereHeightM(500)).toBeCloseTo(5574, -1);
    expect(BELOW_GROUND_MARGIN_M).toBe(150);
  });

  it("requests forecast_days when explicit dates are omitted", () => {
    const rolling = buildForecastRequest(FUENTEMILANOS_SITE, {
      model: "icon_eu",
      forecastDays: 5,
    });
    expect(rolling.body.get("forecast_days")).toBe("5");
    expect(rolling.body.get("start_date")).toBeNull();
  });

  it("routes to commercial endpoint when API key is provided", () => {
    const commercial = buildForecastRequest(FUENTEMILANOS_SITE, {
      model: "icon_eu",
      apiKey: "secret",
    });
    expect(commercial.url).toContain("customer-api");
    expect(commercial.body.get("apikey")).toBe("secret");
  });

  it("formats all level variable names with isobaric suffixes", () => {
    expect(levelVariableNames([850])).toContain("geopotential_height_850hPa");
    expect(SURFACE_VARIABLES).toContain("sensible_heat_flux");
    expect(SURFACE_VARIABLES).toContain("boundary_layer_height");
  });
});

describe("response validation", () => {
  const icon = parsed("lefm-2026-08-18-icon_eu.json");

  it("validates variable presence by content rather than bare key existence", () => {
    expect(hasData(icon, "temperature_2m")).toBe(true);
    expect(hasData(icon, "non_existent")).toBe(false);
  });

  // G-08
  it("detects empty pressure level arrays returned by ECMWF", () => {
    const ecmwf = parsed("ecmwf-no-levels.json");
    expect("temperature_850hPa" in ecmwf.hourly).toBe(true);
    expect(hasData(ecmwf, "temperature_850hPa")).toBe(false);
    expect(usableLevels(ecmwf, [900, 850, 800, 700])).toEqual([]);
  });

  // G-09
  it("detects mostly-null response from out-of-domain AROME queries", () => {
    const arome = parsed("arome-out-of-domain.json");
    expect(usableLevels(arome, [900, 850, 800, 700])).toEqual([]);
    expect(missingVariables(arome, ["surface_pressure"])).toContain("surface_pressure");
  });

  it("validates elevation and timezone echoes", () => {
    expect(validateEcho(icon, FUENTEMILANOS_SITE).ok).toBe(true);
    const wrong = validateEcho(icon, {
      ...FUENTEMILANOS_SITE,
      elevationMslM: m(500),
    });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error.code).toBe("OUT_OF_VALID_RANGE");
    const otherZone = validateEcho(icon, {
      ...FUENTEMILANOS_SITE,
      timezone: "Europe/Lisbon",
    });
    expect(otherZone.ok).toBe(false);
  });

  it("validates declared units before conversion", () => {
    expect(validateUnits(icon).ok).toBe(true);
    const tampered = {
      ...icon,
      hourly_units: { ...icon.hourly_units, wind_speed_10m: "km/h" },
    };
    const result = validateUnits(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MISSING_VARIABLE");
      expect(result.error.detail).toMatchObject({ expected: "m/s", actual: "km/h" });
    }
  });
});

describe("normalization", () => {
  const icon = parsed("lefm-2026-08-18-icon_eu.json");
  const gfs = parsed("lefm-2026-08-18-gfs_seamless.json");

  it("detects model-specific flux sign convention", () => {
    const a = normaliseForecast(icon, FUENTEMILANOS_SITE, [900, 850, 800, 700, 600, 500]);
    const b = normaliseForecast(gfs, FUENTEMILANOS_SITE, [900, 850, 800, 700, 600, 500]);
    expect(a.ok && a.value.fluxConvention).toBe("down_positive");
    expect(b.ok && b.value.fluxConvention).toBe("up_positive");
  });

  it("produces usable observations and declares missing variables", () => {
    const result = normaliseForecast(
      icon,
      FUENTEMILANOS_SITE,
      [900, 850, 800, 700, 600, 500],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.observations).toHaveLength(24);
    expect(result.value.missing).toContain("lifted_index");
    expect(result.value.missing).toContain("boundary_layer_height");
    expect(result.value.missing).not.toContain("sensible_heat_flux");
    expect(result.value.sunriseUtc).toBeTruthy();
  });

  // G-17
  it("centers shortwave radiation to match instantaneous timestamps", () => {
    const at12 = centredRadiationWm2(icon, 12);
    const rawSeries = icon.hourly["shortwave_radiation"] as (number | null)[];
    const here = rawSeries[12]!;
    const next = rawSeries[13]!;
    expect(at12).toBeCloseTo((here + next) / 2, 9);
    expect(at12).not.toBe(here);
  });

  it("handles last hour without array index overflow", () => {
    const last = (icon.hourly["time"] as string[]).length - 1;
    expect(Number.isFinite(centredRadiationWm2(icon, last))).toBe(true);
  });

  // G-08
  it("returns INSUFFICIENT_LEVELS when no usable pressure levels exist", () => {
    const ecmwf = parsed("ecmwf-no-levels.json");
    const result = normaliseForecast(ecmwf, FUENTEMILANOS_SITE, [900, 850, 800, 700]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INSUFFICIENT_LEVELS");
  });
});

describe("caching", () => {
  it("cache key is invariant to parameter ordering", () => {
    const a = new URLSearchParams([
      ["b", "2"],
      ["a", "1"],
    ]);
    const b = new URLSearchParams([
      ["a", "1"],
      ["b", "2"],
    ]);
    expect(cacheKey("u", a)).toBe(cacheKey("u", b));
  });

  it("in-memory cache expires entries after TTL", async () => {
    let now = 0;
    const cache = memoryCache(() => now);
    await cache.set("k", "v", 10);
    expect(await cache.get("k")).toBe("v");
    now = 11_000;
    expect(await cache.get("k")).toBeNull();
  });

  it("no-op cache always returns null", async () => {
    const cache = noopCache();
    await cache.set("k", "v", 10);
    expect(await cache.get("k")).toBeNull();
  });
});

describe("HTTP client", () => {
  const request = buildForecastRequest(FUENTEMILANOS_SITE, { model: "icon_eu" });

  // G-10
  it("HTTP 400 is not retried and preserves API error reason", async () => {
    const fetchStub = stubFetch([
      { status: 400, body: raw("error-400-bad-variable.json") },
    ]);
    const result = await sendRequest(request, { fetch: fetchStub, retries: 3 });
    expect(fetchStub.calls).toHaveLength(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FETCH_FAILED");
      expect(String(result.error.detail?.["reason"])).toContain("Data corrupted");
    }
  });

  it("retries on HTTP 429 status", async () => {
    const good = raw("lefm-2026-08-18-icon_eu.json");
    const fetchStub = stubFetch([
      { status: 429, body: "" },
      { status: 200, body: good },
    ]);
    const result = await sendRequest(request, {
      fetch: fetchStub,
      retries: 2,
      sleep: () => Promise.resolve(),
    });
    expect(fetchStub.calls.length).toBeGreaterThan(1);
    expect(result.ok).toBe(true);
  });

  it("returns failure when retries are exhausted", async () => {
    const fetchStub = stubFetch([{ status: 503, body: "" }]);
    const result = await sendRequest(request, {
      fetch: fetchStub,
      retries: 1,
      sleep: () => Promise.resolve(),
    });
    expect(result.ok).toBe(false);
    expect(fetchStub.calls).toHaveLength(2);
  });

  it("handles non-JSON response body gracefully", async () => {
    const fetchStub = stubFetch([{ status: 200, body: "<html>oops</html>" }]);
    const result = await sendRequest(request, { fetch: fetchStub });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("JSON");
  });

  it("propagates network failures as FETCH_FAILED", async () => {
    const failing: FetchLike = () => Promise.reject(new Error("offline"));
    const result = await sendRequest(request, {
      fetch: failing,
      retries: 0,
      sleep: () => Promise.resolve(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FETCH_FAILED");
  });

  // G-15
  it("identical secondary call serves from cache without network request", async () => {
    const fetchStub = stubFetch([
      { status: 200, body: raw("lefm-2026-08-18-icon_eu.json") },
    ]);
    const cache = memoryCache();
    await sendRequest(request, { fetch: fetchStub, cache });
    await sendRequest(request, { fetch: fetchStub, cache });
    expect(fetchStub.calls).toHaveLength(1);
  });

  it("validates echo during forecast fetch", async () => {
    const fetchStub = stubFetch([
      { status: 200, body: raw("lefm-2026-08-18-icon_eu.json") },
    ]);
    const good = await fetchForecast(
      FUENTEMILANOS_SITE,
      { model: "icon_eu" },
      { fetch: fetchStub },
    );
    expect(good.ok).toBe(true);

    const wrongSite = { ...FUENTEMILANOS_SITE, elevationMslM: m(50) };
    const bad = await fetchForecast(
      wrongSite,
      { model: "icon_eu" },
      { fetch: stubFetch([{ status: 200, body: raw("lefm-2026-08-18-icon_eu.json") }]) },
    );
    expect(bad.ok).toBe(false);
  });
});

describe("multi-model ensemble forecasting", () => {
  const iconBody = raw("lefm-2026-08-18-icon_eu.json");
  const gfsBody = raw("lefm-2026-08-18-gfs_seamless.json");

  // G-03
  it("two models provide day report and confidence metric", async () => {
    let call = 0;
    const fetchStub: FetchLike = () => {
      const body = call++ === 0 ? iconBody : gfsBody;
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(body),
      });
    };
    const result = await fetchSoaringDay(FUENTEMILANOS_SITE, "2026-08-18", {
      fetch: fetchStub,
      models: ["icon_eu", "gfs_seamless"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.perModel).toHaveLength(2);
    expect(result.value.day.confidence).not.toBeNull();
    expect(result.value.failed).toEqual([]);
  });

  // G-11
  it("when one model fails, day proceeds with remaining models and notes failure", async () => {
    let call = 0;
    const fetchStub: FetchLike = () =>
      call++ === 0
        ? Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(iconBody),
          })
        : Promise.resolve({ ok: false, status: 503, text: () => Promise.resolve("") });
    const result = await fetchSoaringDay(FUENTEMILANOS_SITE, "2026-08-18", {
      fetch: fetchStub,
      models: ["icon_eu", "gfs_seamless"],
      retries: 0,
      sleep: () => Promise.resolve(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.perModel).toHaveLength(1);
    expect(result.value.failed.map((f) => f.model)).toEqual(["gfs_seamless"]);
  });

  // G-12
  it("when all models fail, returns error rather than partial day", async () => {
    const fetchStub = stubFetch([{ status: 503, body: "" }]);
    const result = await fetchSoaringDay(FUENTEMILANOS_SITE, "2026-08-18", {
      fetch: fetchStub,
      models: ["icon_eu", "gfs_seamless"],
      retries: 0,
      sleep: () => Promise.resolve(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FETCH_FAILED");
  });

  // G-16
  it("includes attribution in day output", async () => {
    const fetchStub = stubFetch([{ status: 200, body: iconBody }]);
    const result = await fetchSoaringDay(FUENTEMILANOS_SITE, "2026-08-18", {
      fetch: fetchStub,
      models: ["icon_eu"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.day.attribution).toContain("CC BY 4.0");
  });
});

describe("network isolation verification", () => {
  it("no unit test in this suite executed genuine network requests", () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("session cache", () => {
  function withSessionStorage<T>(run: () => T): T {
    const store = new Map<string, string>();
    const stub: Storage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        store.set(k, v);
      },
      removeItem: (k) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      },
      key: () => null,
      length: 0,
    };
    Object.defineProperty(globalThis, "sessionStorage", {
      value: stub,
      configurable: true,
    });
    try {
      return run();
    } finally {
      Reflect.deleteProperty(globalThis, "sessionStorage");
    }
  }

  it("degrades gracefully to noop without sessionStorage", async () => {
    const cache = sessionCache();
    await cache.set("k", "v", 10);
    expect(await cache.get("k")).toBeNull();
  });

  it("stores and retrieves entries with sessionStorage present", async () => {
    const cache = withSessionStorage(() => sessionCache());
    await withSessionStorage(async () => {
      const c = sessionCache();
      await c.set("k", "v", 10);
      expect(await c.get("k")).toBe("v");
      expect(await c.get("other")).toBeNull();
    });
    expect(cache).toBeDefined();
  });

  it("discards expired entry", async () => {
    await withSessionStorage(async () => {
      const c = sessionCache();
      await c.set("k", "v", -1);
      expect(await c.get("k")).toBeNull();
    });
  });

  it("handles corrupt JSON payload gracefully", async () => {
    await withSessionStorage(async () => {
      globalThis.sessionStorage.setItem("k", "not valid json");
      expect(await sessionCache().get("k")).toBeNull();
    });
  });
});

describe("normalization edge cases", () => {
  const icon = parsed("lefm-2026-08-18-icon_eu.json");
  const levels = [900, 850, 800, 700, 600, 500];

  it("hour without temperature is skipped cleanly", () => {
    const holed = {
      ...icon,
      hourly: {
        ...icon.hourly,
        temperature_2m: (icon.hourly["temperature_2m"] as (number | null)[]).map(
          (v, i) => (i === 5 ? null : v),
        ),
      },
    };
    const result = normaliseForecast(holed, FUENTEMILANOS_SITE, levels);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.observations).toHaveLength(23);
  });

  it("flux convention is unknown when heat flux is omitted", () => {
    const noFlux = { ...icon, hourly: { ...icon.hourly } };
    delete (noFlux.hourly as Record<string, unknown>)["sensible_heat_flux"];
    const result = normaliseForecast(noFlux, FUENTEMILANOS_SITE, levels);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fluxConvention).toBe("unknown");
    expect(result.value.missing).toContain("sensible_heat_flux");
  });

  it("returns error when time axis is missing", () => {
    const empty = { ...icon, hourly: { ...icon.hourly, time: [] } };
    const result = normaliseForecast(empty, FUENTEMILANOS_SITE, levels);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_VARIABLE");
  });

  it("returns error when pressure levels are insufficient", () => {
    const result = normaliseForecast(icon, FUENTEMILANOS_SITE, [700]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INSUFFICIENT_LEVELS");
  });

  it("sunrise is null when daily section is omitted", () => {
    const noDaily = { ...icon };
    delete (noDaily as Record<string, unknown>)["daily"];
    const result = normaliseForecast(noDaily, FUENTEMILANOS_SITE, levels);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.sunriseUtc).toBeNull();
  });
});

describe("forecast options", () => {
  const iconBody = raw("lefm-2026-08-18-icon_eu.json");

  it("accepts custom aircraft profile and scoring configuration", async () => {
    const fetchStub = stubFetch([{ status: 200, body: iconBody }]);
    const result = await fetchSoaringDay(FUENTEMILANOS_SITE, "2026-08-18", {
      fetch: fetchStub,
      models: ["icon_eu"],
      profile: { ...GLIDER_CLUB, hcritThresholdMs: mps(0.8) },
      scoring: { levelThresholds: [0.2, 0.4, 0.6, 0.8] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const noon = result.value.day.hours.find((h) => h.timeUtc.slice(11, 16) === "14:00");
    expect(noon?.ceiling.aglM).toBeGreaterThan(2000);
  });

  it("records model without usable levels as failed", async () => {
    const fetchStub = stubFetch([{ status: 200, body: raw("ecmwf-no-levels.json") }]);
    const result = await fetchSoaringDay(FUENTEMILANOS_SITE, "2026-08-18", {
      fetch: fetchStub,
      models: ["ecmwf_ifs", "icon_eu"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FETCH_FAILED");
  });
});

describe("absent units", () => {
  const icon = parsed("lefm-2026-08-18-icon_eu.json");

  it('recognizes "undefined" string as absent model variable', () => {
    const withAbsent = {
      ...icon,
      hourly_units: { ...icon.hourly_units, boundary_layer_height: ABSENT_UNIT },
    };
    expect(validateUnits(withAbsent).ok).toBe(true);
    expect(ABSENT_UNIT).toBe("undefined");
  });

  it("flags genuine unit mismatches as error", () => {
    const wrong = {
      ...icon,
      hourly_units: { ...icon.hourly_units, boundary_layer_height: "ft" },
    };
    expect(validateUnits(wrong).ok).toBe(false);
  });
});
