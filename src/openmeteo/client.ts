/**
 * Cliente HTTP. **El único punto de la librería que toca la red.**
 *
 * `fetch` se inyecta: así las pruebas no tocan la red y el mismo código sirve
 * en navegador y en Node.
 */

import { err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import type { Site } from "../types/site.js";
import type { OpenMeteoModel } from "./models.js";
import { MODEL_CAPABILITIES } from "./models.js";
import { buildForecastRequest } from "./url.js";
import type { ForecastRequestOptions, HttpRequest } from "./url.js";
import { cacheKey, noopCache } from "./cache.js";
import { validateEcho, validateUnits } from "./validate.js";
import type { CacheAdapter, OpenMeteoError, OpenMeteoResponse } from "./types.js";

export type FetchLike = (
  input: string,
  init?: { method?: string; body?: URLSearchParams; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export interface OpenMeteoOptions {
  /** Inyectable: pruebas sin red, y el mismo código en navegador y en Node. */
  readonly fetch?: FetchLike;
  readonly models?: readonly OpenMeteoModel[];
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly cache?: CacheAdapter;
  readonly timeoutMs?: number;
  readonly retries?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_RETRIES = 2;
/** Reintentos solo para estos códigos. Un 400 es error de programación. */
export const RETRYABLE_STATUS = [429, 500, 502, 503, 504] as const;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Lanza una petición con reintentos y caché.
 *
 * **Un HTTP 400 no se reintenta.** Significa que se pidió una variable con un
 * nombre que no existe, y eso no mejora insistiendo: es un error del código.
 *
 * @source §6.4 de docs/OPEN_METEO_INTEGRATION.md.
 */
export async function sendRequest(
  request: HttpRequest,
  options: OpenMeteoOptions = {},
): Promise<Result<OpenMeteoResponse>> {
  // `fetch` es global en Node 22 y en todo navegador vigente. Se inyecta para
  // poder probar sin red, no porque pueda faltar.
  const doFetch: FetchLike = options.fetch ?? globalThis.fetch;

  const cache = options.cache ?? noopCache();
  const key = cacheKey(request.url, request.body);
  const cached = await cache.get(key);
  if (cached !== null) return parseBody(cached);

  const retries = options.retries ?? DEFAULT_RETRIES;
  const sleep = options.sleep ?? defaultSleep;
  let lastStatus = 0;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await attemptOnce(doFetch, request, options.timeoutMs);
    if (!response.ok) {
      lastStatus = 0;
      if (attempt === retries) return response;
      await sleep(backoffMs(attempt));
      continue;
    }

    const { status, text } = response.value;
    if (status >= 200 && status < 300) {
      const parsed = parseBody(text);
      if (parsed.ok) {
        await cache.set(key, text, ttlSecondsFor(request));
      }
      return parsed;
    }

    lastStatus = status;
    if (!isRetryable(status)) return httpError(status, text);
    if (attempt === retries) return httpError(status, text);
    await sleep(backoffMs(attempt));
  }

  return err("FETCH_FAILED", "exhausted retries", { status: lastStatus });
}

async function attemptOnce(
  doFetch: FetchLike,
  request: HttpRequest,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Result<{ status: number; text: string }>> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const response = await doFetch(request.url, {
      method: request.method,
      body: request.body,
      signal: controller.signal,
    });
    return ok({ status: response.status, text: await response.text() });
  } catch (cause) {
    return err("FETCH_FAILED", "network request failed", {
      cause: cause instanceof Error ? cause.message : String(cause),
    });
  } finally {
    clearTimeout(timer);
  }
}

function isRetryable(status: number): boolean {
  return (RETRYABLE_STATUS as readonly number[]).includes(status);
}

/** Espera exponencial con jitter. */
function backoffMs(attempt: number): number {
  return 250 * Math.pow(2, attempt) * (0.75 + Math.random() * 0.5);
}

function httpError(status: number, text: string): Result<OpenMeteoResponse> {
  let reason = text.slice(0, 300);
  try {
    const parsed = JSON.parse(text) as Partial<OpenMeteoError>;
    if (typeof parsed.reason === "string") reason = parsed.reason;
  } catch {
    // El cuerpo no era JSON; se conserva el texto recortado.
  }
  return err("FETCH_FAILED", `HTTP ${String(status)}`, { status, reason });
}

function parseBody(text: string): Result<OpenMeteoResponse> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return err("FETCH_FAILED", "response body is not valid JSON");
  }
  const candidate = parsed as Partial<OpenMeteoError & OpenMeteoResponse>;
  if (candidate.error === true) {
    return err("FETCH_FAILED", "Open-Meteo rejected the request", {
      reason: candidate.reason ?? "unknown",
    });
  }
  if (typeof candidate.elevation !== "number" || candidate.hourly === undefined) {
    return err("FETCH_FAILED", "response is missing the expected fields");
  }
  return ok(parsed as OpenMeteoResponse);
}

/** La caché no sobrevive al ciclo del modelo, y como mucho dura una hora. */
function ttlSecondsFor(request: HttpRequest): number {
  const model = request.body.get("models");
  const capabilities =
    model === null ? undefined : MODEL_CAPABILITIES[model as OpenMeteoModel];
  const hours = Math.min(capabilities?.updateIntervalHours ?? 1, 1);
  return hours * 3600;
}

/** Pide la previsión de un modelo y valida el eco y las unidades. */
export async function fetchForecast(
  site: Site,
  options: ForecastRequestOptions,
  clientOptions: OpenMeteoOptions = {},
): Promise<Result<{ response: OpenMeteoResponse; request: HttpRequest }>> {
  const request = buildForecastRequest(site, {
    ...options,
    ...(clientOptions.baseUrl === undefined ? {} : { baseUrl: clientOptions.baseUrl }),
    ...(clientOptions.apiKey === undefined ? {} : { apiKey: clientOptions.apiKey }),
  });

  const sent = await sendRequest(request, clientOptions);
  if (!sent.ok) return sent;

  const echo = validateEcho(sent.value, site);
  if (!echo.ok) return echo;
  const units = validateUnits(sent.value);
  if (!units.ok) return units;

  return ok({ response: sent.value, request });
}
