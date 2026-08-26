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

import * as es from "../../../src/i18n/es.js";

/** `soarwx/i18n/es` */
export async function example(): Promise<unknown> {
  es.describeLevel(4);                       // el nivel, en palabras
  es.describeCeilingLimit("hcrit");          // por qué el techo es ese
  es.describeVeto("stable_atmosphere");      // "Atmósfera estable sobre una capa convectiva corta"
  es.describeThermalQuality("organised");
  es.describeConfidence("medium");
  
  es.formatHour("2026-08-19T14:00", site.timezone);      // "16:00" en verano
  es.formatInstant("2026-08-19T14:00", site.timezone);   // con día y mes
  
  es.DISCLAIMER;   // no sustituye al briefing oficial ni a la decisión del piloto
  void [es];
  return undefined;
}
