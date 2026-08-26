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

import { evaluateVetoes, aggregate, findWindows, bestHour, confidenceFrom, DEFAULT_FACTORS, buildFactor } from "../../../src/forecast/index.js";
import { capeRisk } from "../../../src/stability/index.js";
import { m, mps } from "../../../src/units/index.js";

/** `soarwx/forecast` */
export async function example(): Promise<unknown> {
  const factors = [
    buildFactor("climb_strength", 1.9, DEFAULT_FACTORS.climb_strength),
    buildFactor("usable_ceiling", 2364, DEFAULT_FACTORS.usable_ceiling),
  ];
  
  const vetoes = evaluateVetoes({
    hasConvection: true,
    overcast: false,
    usableCeilingAglM: m(2364),
    liftedIndex: 1.5,          // positive, but the layer has depth: does NOT veto
    cape: capeRisk(800),
    kIndex: 18,
    surfaceWindMs: 4,
  });
  
  const score = aggregate(factors, vetoes);
  score.level;              // 1..5 after applying the caps
  score.levelBeforeVetoes;  // the level it would have scored without them
  score.factors;            // each with value, score, weight and band
  score.limitingFactors;    // those scoring below 0.6, worst first
  
  // Windows of at least two consecutive hours above level 3:
  const windows = findWindows(hours, 3);
  
  // Confidence as spread between models, not as a made-up number:
  const confidence = confidenceFrom([
    { model: "icon_eu", ceilingAglM: m(2364), wStarMs: mps(3.28) },
    { model: "gfs_seamless", ceilingAglM: m(2537), wStarMs: mps(3.11) },
  ]);
  confidence?.level;             // "low" | "medium" | "high"
  confidence?.ceilingSpreadM;    // 173
  confidence?.modelsUsed;        // null altogether if only one model was available
  void [evaluateVetoes, aggregate, findWindows, bestHour, confidenceFrom, DEFAULT_FACTORS, buildFactor, capeRisk, m, mps, factors, vetoes, score, windows, confidence];
  return undefined;
}
