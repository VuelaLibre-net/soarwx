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

import { fetchSoaringDay, memoryCache, MODEL_CAPABILITIES, soundingModels } from "../../../src/openmeteo/index.js";
import { GLIDER_CLUB } from "../../../src/aircraft/index.js";

/** `soarwx/openmeteo` */
export async function example(): Promise<unknown> {
  // Varios modelos + confianza por dispersión, en una llamada:
  const result = await fetchSoaringDay(site, "2026-08-19", {
    models: ["icon_eu", "gfs_seamless"],
    profile: GLIDER_CLUB,
    timeoutMs: 8000,
    retries: 2,
    cache: memoryCache(),
  });
  if (result.ok) {
    result.value.day;       // SoaringDay ya calculado
    result.value.failed;    // modelos que no respondieron: fallo parcial, no total
  }
  
  // En pruebas, sin red: se inyecta el fetch.
  await fetchSoaringDay(site, "2026-08-19", {
    fetch: async () => new Response(JSON.stringify(fixture), { status: 200 }),
  });
  
  // Qué sirve cada modelo, verificado en vivo y no copiado de la documentación:
  MODEL_CAPABILITIES.icon_eu.hasBoundaryLayerHeight;   // false — ICON no la sirve
  MODEL_CAPABILITIES.icon_eu.hasLiftedIndex;           // false — se calcula del sondeo
  MODEL_CAPABILITIES.icon_eu.pressureLevelsHpa;        // los que existen de verdad
  soundingModels();                                    // los que sirven perfil vertical
  void [fetchSoaringDay, memoryCache, MODEL_CAPABILITIES, soundingModels, GLIDER_CLUB, result];
  return undefined;
}
