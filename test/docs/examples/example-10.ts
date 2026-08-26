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

import { liftedIndex, liftedIndexBand, kIndex, totalTotals, capeRisk } from "../../../src/stability/index.js";

/** `soarwx/stability` */
export async function example(): Promise<unknown> {
  const li = liftedIndex(sounding, maxSurfaceTempK);
  if (li.ok) liftedIndexBand(li.value);      // "stable" | "marginally_unstable" | ...
  // li.error.code === "MISSING_VARIABLE" when the 500 hPa level is missing.
  // Never returns 0.0 for absent data: a real 0.0 and absent are distinguishable.
  
  const risk = capeRisk(2800, 15);   // (CAPE, CIN) — both can be null
  risk.band;            // "moderate"
  risk.stormPotential;  // feeds the vetoes, never the factors
  risk.inhibited;       // enough CIN to cap deep convection
  risk.capeJkg;         // null if the model didn't serve it
  void [liftedIndex, liftedIndexBand, kIndex, totalTotals, capeRisk, li, risk];
  return undefined;
}
