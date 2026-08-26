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

import { isOk, OPEN_METEO_ATTRIBUTION } from "../../../src/index.js";
import type { Result, Site } from "../../../src/index.js";
import { m, deg } from "../../../src/units/index.js";

/** `soarwx` */
export async function example(): Promise<unknown> {
  const site: Site = {
    name: "Fuentemilanos",
    icao: "LEFM",
    latDeg: 40.9167,
    lonDeg: -4.2333,
    elevationMslM: m(1013),
    timezone: "Europe/Madrid",
    surface: { type: "cropland" },
    ridges: [
      {
        name: "La Mujer Muerta",
        bearingDeg: deg(68),      // bearing along the ridge axis, 0..180
        slopeDeg: deg(16),
        crestMslM: m(2197),
        lengthM: m(11000),
      },
    ],
  };
  
  // Terrain enters as data. There is not a single hardcoded site in the
  // library: `grep -ri "guadarrama" src/` is empty, and a test enforces it.
  
  function height<T extends { aglM: number }>(r: Result<T>): number | null {
    return isOk(r) ? r.value.aglM : null;
  }
  void [isOk, OPEN_METEO_ATTRIBUTION, m, deg, site, height];
  return undefined;
}
