/* GENERADO por tools/checkApiExamples.ts a partir de docs/API.md.
   No editar a mano: se regenera con `pnpm docs:examples`.

   Si una firma de la librería cambia y el ejemplo deja de compilar, el
   `pnpm typecheck` de `pnpm check` falla, y la documentación se arregla
   antes de publicarse. */

import type * as Root from "../../../src/index.js";
import type * as Snd from "../../../src/sounding/index.js";
import type * as Cnv from "../../../src/convection/index.js";
import type * as Rep from "../../../src/report/index.js";
import type * as Fct from "../../../src/forecast/index.js";
import type * as Uni from "../../../src/units/index.js";
import type * as Om from "../../../src/openmeteo/index.js";

declare const site: Root.Site;
declare const fuentemilanos: Root.Site;
declare const sounding: Snd.Sounding;
declare const surface: Snd.SurfaceState;
declare const pressureLevels: readonly Snd.RawPressureLevel[];
declare const heightLevels: readonly Snd.RawHeightLevel[];
declare const samples: readonly Cnv.FluxSample[];
declare const hourly: readonly Rep.HourlyObservation[];
declare const hours: readonly Fct.ScoredHour[];
declare const day: Rep.SoaringDay;
declare const maxSurfaceTempK: Uni.Kelvin;
declare const wStarMs: Uni.MPerS;
declare const ziAglM: Uni.Metres;
declare const fixture: Om.OpenMeteoResponse;
declare const container: { innerHTML: string };

import { computeDay } from "../../../src/report/index.js";
import { GLIDER_CLUB } from "../../../src/aircraft/index.js";
import type { SoaringDay, SoaringHour } from "../../../src/report/index.js";

/** `soarwx/report` */
export async function example(): Promise<unknown> {
  const result = computeDay({
    site,
    hourly,                       // HourlyObservation[]
    dateLocal: "2026-08-19",
    sunriseUtc: "2026-08-19T05:31",
    sunsetUtc: "2026-08-19T19:09",
    profile: GLIDER_CLUB,         // opcional
  });
  if (!result.ok) throw new Error(result.error.code);
  
  const day: SoaringDay = result.value;
  day.best;            // SoaringHour | null — null es un día sin ventana, no un fallo
  day.windows;         // tramos continuos volables
  day.attribution;     // hay que mostrarlo: Open-Meteo es CC BY 4.0
  day.confidence;      // null con un solo modelo, no un valor fingido
  
  for (const hour of day.hours as readonly SoaringHour[]) {
    hour.thermal.wStarMs;
    hour.thermal.meanClimbMs;
    hour.ceiling.aglM;
    hour.ceiling.limitedBy;
    hour.cloud.blue;
    hour.quality.heatFluxSource;      // "model" o "energy_balance"
    hour.quality.pressureLevelsUsed;  // cuántos niveles sobrevivieron a la poda
  }
  void [computeDay, GLIDER_CLUB, result, day];
  return undefined;
}
