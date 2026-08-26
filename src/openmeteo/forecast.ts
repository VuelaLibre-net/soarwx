/**
 * High-level forecast entry point: site coordinates to computed soaring day.
 *
 * Implements forecast integration pipeline steps from `docs/OPEN_METEO_INTEGRATION.md` §6.1.
 */

import { ok, err } from "../types/result.js";
import type { Result } from "../types/result.js";
import type { Site } from "../types/site.js";
import { computeDay } from "../report/assemble.js";
import type { SoaringDay } from "../report/types.js";
import { confidenceFrom } from "../forecast/confidence.js";
import type { ModelSample } from "../forecast/confidence.js";
import type { ScoringConfig } from "../forecast/config.js";
import type { AircraftProfile } from "../aircraft/profiles.js";
import { fetchForecast } from "./client.js";
import type { OpenMeteoOptions } from "./client.js";
import { normaliseForecast } from "./normalize.js";
import { RECOMMENDED_ENSEMBLE } from "./models.js";
import type { OpenMeteoModel } from "./models.js";

export interface SoaringDayOptions extends OpenMeteoOptions {
  readonly profile?: AircraftProfile;
  readonly scoring?: ScoringConfig;
}

export interface ModelDay {
  readonly model: OpenMeteoModel;
  readonly day: SoaringDay;
}

export interface MultiModelResult {
  /** Day forecast from highest-ranked responding model. */
  readonly day: SoaringDay;
  readonly perModel: readonly ModelDay[];
  /** Models that failed, with failure error codes. */
  readonly failed: readonly { model: OpenMeteoModel; reason: string }[];
}

/**
 * Fetches and computes soaring day forecast for site and date across ensemble models.
 *
 * Parallel queries are executed across models to derive consensus confidence.
 * If all queried models fail, returns `FETCH_FAILED`.
 *
 * @source docs/OPEN_METEO_INTEGRATION.md §6.1 and §6.4.
 */
export async function fetchSoaringDay(
  site: Site,
  dateLocal: string,
  options: SoaringDayOptions = {},
): Promise<Result<MultiModelResult>> {
  const models = options.models ?? RECOMMENDED_ENSEMBLE;
  const settled = await Promise.all(
    models.map((model) => oneModel(site, dateLocal, model, options)),
  );

  const perModel: ModelDay[] = [];
  const failed: { model: OpenMeteoModel; reason: string }[] = [];
  const samples: ModelSample[] = [];

  settled.forEach((result, index) => {
    const model = models[index];
    if (model === undefined) return;
    if (!result.ok) {
      failed.push({ model, reason: result.error.code });
      return;
    }
    perModel.push({ model, day: result.value });
    const best = result.value.best;
    if (best !== null) {
      samples.push({
        model,
        ceilingAglM: best.ceiling.aglM,
        wStarMs: best.thermal.wStarMs,
      });
    }
  });

  const leader = perModel[0];
  if (leader === undefined) {
    return err("FETCH_FAILED", "no model produced a usable day", { failed });
  }

  return ok({
    day: { ...leader.day, confidence: confidenceFrom(samples) },
    perModel,
    failed,
  });
}

async function oneModel(
  site: Site,
  dateLocal: string,
  model: OpenMeteoModel,
  options: SoaringDayOptions,
): Promise<Result<SoaringDay>> {
  const fetched = await fetchForecast(
    site,
    { model, startDate: dateLocal, endDate: dateLocal },
    options,
  );
  if (!fetched.ok) return fetched;

  const normalised = normaliseForecast(
    fetched.value.response,
    site,
    fetched.value.request.levelsHpa,
  );
  if (!normalised.ok) return normalised;

  return computeDay({
    site,
    hourly: normalised.value.observations,
    dateLocal,
    sunriseUtc: normalised.value.sunriseUtc ?? "",
    sunsetUtc: normalised.value.sunsetUtc ?? "",
    ...(options.profile === undefined ? {} : { profile: options.profile }),
    ...(options.scoring === undefined ? {} : { scoring: options.scoring }),
  });
}
