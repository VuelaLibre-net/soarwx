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

import { fetchSoaringDay } from "../../../src/openmeteo/index.js";
import { GLIDER_CLUB } from "../../../src/aircraft/index.js";
import * as es from "../../../src/i18n/es.js";
import { m } from "../../../src/units/index.js";
import type { Site } from "../../../src/index.js";

/** El camino corto */
export async function example(): Promise<unknown> {
  const fuentemilanos: Site = {
    name: "Fuentemilanos",
    icao: "LEFM",
    latDeg: 40.9167,
    lonDeg: -4.2333,
    elevationMslM: m(1013),
    timezone: "Europe/Madrid",
    surface: { type: "cropland" },
  };
  
  const result = await fetchSoaringDay(fuentemilanos, "2026-08-19", {
    models: ["icon_eu", "gfs_seamless"],
    profile: GLIDER_CLUB,
  });
  
  if (!result.ok) throw new Error(result.error.code);
  
  const { day } = result.value;
  const best = day.best;
  if (best !== null) {
    console.log(`${es.describeLevel(best.score.level)} a las ${es.formatHour(best.timeUtc, fuentemilanos.timezone)}`);
    console.log(`techo ${Math.round(best.ceiling.aglM)} m AGL, ${es.describeCeilingLimit(best.ceiling.limitedBy)}`);
    for (const veto of best.score.vetoes) console.log("⚠", es.describeVeto(veto.id));
  }
  console.log(day.attribution);   // obligatorio mostrarlo: CC BY 4.0
  void [fetchSoaringDay, GLIDER_CLUB, es, m, fuentemilanos, result, best, day];
  return undefined;
}
