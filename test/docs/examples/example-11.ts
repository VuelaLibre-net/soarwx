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

import { ridgeLift, scorerParameter, wavePotential } from "../../../src/orographic/index.js";
import { deg, m, mps } from "../../../src/units/index.js";

/** `soarwx/orographic` */
export async function example(): Promise<unknown> {
  const mujerMuerta = { name: "La Mujer Muerta", bearingDeg: deg(68), slopeDeg: deg(16), crestMslM: m(2197) };
  
  const lift = ridgeLift(mujerMuerta, { speedMs: mps(9), fromDeg: deg(340) });
  lift.perpendicularMs;  // wind component perpendicular to the ridge
  lift.verticalMs;       // U_perp * sin(slope)
  lift.incidenceDeg;     // 0 = head-on
  lift.band;             // "insufficient" | "marginal" | "optimal" | "dangerous"
  
  const wave = wavePotential(sounding, mujerMuerta);
  if (wave.ok) {
    wave.value.potential;         // "none" | "marginal" | "likely" | "strong"
    wave.value.method;            // "scorer" or "heuristic": never hidden
    wave.value.trappedLeeWave;
    wave.value.estimatedWavelengthM;
  }
  void [ridgeLift, scorerParameter, wavePotential, deg, m, mps, mujerMuerta, lift, wave];
  return undefined;
}
