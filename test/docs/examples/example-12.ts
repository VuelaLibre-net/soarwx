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

import { GLIDER_CLUB, ASH_25, RASP_REFERENCE, AIRCRAFT_PROFILES, findAircraftProfile } from "../../../src/aircraft/index.js";
import { criticalHeight, expectedVarioAt } from "../../../src/convection/index.js";

/** `soarwx/aircraft` */
export async function example(): Promise<unknown> {
  // El techo no depende del velero: lo fija el criterio de los 225 fpm.
  criticalHeight(wStarMs, ziAglM, GLIDER_CLUB);       // 2364 m AGL
  criticalHeight(wStarMs, ziAglM, ASH_25);            // los mismos 2364 m AGL
  
  // Lo que sí depende del velero es lo que marca el variómetro.
  expectedVarioAt(wStarMs, ziAglM, ziAglM, ASH_25);   // más que con GLIDER_CLUB
  
  // Con la referencia de RASP, el variómetro cae a cero justo en hcrit.
  RASP_REFERENCE.circlingSinkMs === RASP_REFERENCE.hcritThresholdMs;
  
  findAircraftProfile("duo-discus");                  // uno del catálogo
  AIRCRAFT_PROFILES.length;                           // 12
  void [GLIDER_CLUB, ASH_25, RASP_REFERENCE, AIRCRAFT_PROFILES, findAircraftProfile, criticalHeight, expectedVarioAt];
  return undefined;
}
