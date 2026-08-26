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

import { K, Pa, m, mps, celsiusToK, msToKnots, hPaToPa, GAMMA_D, CP, G } from "../../../src/units/index.js";
import type { Kelvin, MPerS } from "../../../src/units/index.js";

/** `soarwx/units` */
export async function example(): Promise<unknown> {
  const t: Kelvin = celsiusToK(34.6);        // 307.75 K
  const p = hPaToPa(909);                    // 90900 Pa
  const wind: MPerS = mps(5.2);
  
  msToKnots(wind);                           // 10.1 — solo para presentar
  GAMMA_D === G / CP;                        // true: derivada, no tabulada
  
  // El marcado es lo que evita el bug de unidades:
  // saturationVapourPressure(p)   ← no compila: Pascal donde se espera Kelvin
  void [K, Pa, m, mps, celsiusToK, msToKnots, hPaToPa, GAMMA_D, CP, G, t, p, wind];
  return undefined;
}
