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

import { surfaceHeatFlux, convectiveVelocityScale, criticalHeight, meanClimbOverBand, detectFluxSign } from "../../../src/convection/index.js";
import { potentialTemperature } from "../../../src/thermo/index.js";
import { GLIDER_CLUB } from "../../../src/aircraft/index.js";
import { K, Pa, m, mps, wm2, celsiusToK, hPaToPa } from "../../../src/units/index.js";

/** `soarwx/convection` */
export async function example(): Promise<unknown> {
  // 1. Flux sign, inferred from the day's series, not hard-coded.
  const convention = detectFluxSign(samples);      // "up_positive" | "down_positive"
  
  // 2. Full energy chain: Rn -> G -> H -> Qov.
  const flux = surfaceHeatFlux({
    shortwaveDownWm2: wm2(894),
    surfaceTempK: celsiusToK(34.6),
    surfaceDewpointK: celsiusToK(6.8),
    surfacePressurePa: hPaToPa(909),
    cloudCoverFrac: 0.04,
    surfaceType: "cropland",
  });
  flux.netRadiationWm2;    // 617 W/m2
  flux.sensibleHeatWm2;    // 346 W/m2   (the predecessor used 0.30 * 894 = 268)
  flux.source;             // "model" | "energy_balance" — always declared
  
  // 3. Deardorff's convective velocity scale.
  const w = convectiveVelocityScale({
    virtualHeatFluxKMs: flux.virtualHeatFluxKMs,
    mixingHeightAglM: m(3365),
    surfacePotentialTempK: potentialTemperature(celsiusToK(34.6), hPaToPa(909)),
    surfaceWindMs: mps(2.57),
    profile: GLIDER_CLUB,
  });
  if (!w.ok) throw new Error(w.error.code);       // NO_CONVECTION means it's night
  w.value.wStarMs;          // 3.28 m/s
  w.value.suppressedByWind; // true if wind exceeded the cutoff
  
  // 4. Practical ceiling: where the core stops offsetting the sink while circling.
  const h = criticalHeight(w.value.wStarMs, m(3365), GLIDER_CLUB);
  if (h.ok) {
    h.value.hcritAglM;      // 2364 m AGL
    h.value.peakHeightAglM; // 642 m — the peak is low, not at mid-layer
    h.value.peakClimbMs;    // 2.79 m/s
  }
  
  // 5. What the vario would show, averaged over the working band.
  const climb = meanClimbOverBand(w.value.wStarMs, m(3365), GLIDER_CLUB);
  if (climb.ok) climb.value;   // 1.11 m/s
  void [surfaceHeatFlux, convectiveVelocityScale, criticalHeight, meanClimbOverBand, detectFluxSign, potentialTemperature, GLIDER_CLUB, K, Pa, m, mps, wm2, celsiusToK, hPaToPa, convention, flux, w, h, climb];
  return undefined;
}
