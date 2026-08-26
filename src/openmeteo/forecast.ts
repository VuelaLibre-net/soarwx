/**
 * Punto de entrada de alto nivel: de emplazamiento a día calculado.
 *
 * Los pasos 1 a 12 de `docs/OPEN_METEO_INTEGRATION.md` §6.1 viven aquí; el 13
 * es núcleo puro (`computeDay`) y el 14 vuelve aquí porque solo este módulo
 * sabe cuántos modelos hubo.
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
  /** Día del modelo mejor clasificado que respondió. */
  readonly day: SoaringDay;
  readonly perModel: readonly ModelDay[];
  /** Modelos que fallaron, con su motivo. */
  readonly failed: readonly { model: OpenMeteoModel; reason: string }[];
}

/**
 * Día de vuelo para un emplazamiento y una fecha local.
 *
 * Con varios modelos se consultan en paralelo y se calcula la confianza por
 * dispersión. Si cae uno, el día sale con los demás y el caído se anota; si
 * caen todos, es `FETCH_FAILED`. **Nunca se devuelve un día parcial haciéndolo
 * pasar por completo.**
 *
 * @source docs/OPEN_METEO_INTEGRATION.md §6.1 y §6.4.
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
