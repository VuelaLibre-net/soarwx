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

import { lcl, saturationVapourPressure, potentialTemperature, moistAdiabaticLift } from "../../../src/thermo/index.js";
import { K, Pa, celsiusToK, hPaToPa } from "../../../src/units/index.js";

/** `soarwx/thermo` */
export async function example(): Promise<unknown> {
  saturationVapourPressure(K(273.15));       // 611.2 Pa — el valor de manual
  
  const t = celsiusToK(34.6);
  const td = celsiusToK(6.8);
  const p = hPaToPa(909);
  
  const base = lcl(t, td, p);
  base.heightAboveParcelM;                   // 3461 m sobre el punto de partida
  base.pressurePa;                           // 60660 Pa
  
  // La regla de Espy que usaba el predecesor daba 3392 m para el mismo caso:
  // (34.6 - 6.8) * 122. Con spreads de 28 °C la aproximación ya no vale.
  
  potentialTemperature(t, p);                // 316.3 K — casi 9 K por encima de T
  void [lcl, saturationVapourPressure, potentialTemperature, moistAdiabaticLift, K, Pa, celsiusToK, hPaToPa, t, td, p, base];
  return undefined;
}
