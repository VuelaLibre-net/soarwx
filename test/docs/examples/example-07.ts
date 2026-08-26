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

import { buildSounding, interpolateAtAgl, findInversions, meanWind, maxGapBelow } from "../../../src/sounding/index.js";
import { m } from "../../../src/units/index.js";

/** `soarwx/sounding` */
export async function example(): Promise<unknown> {
  const built = buildSounding({ site, timeUtc: "2026-08-19T14:00", surface, pressureLevels, heightLevels });
  if (!built.ok) throw new Error(built.error.code);
  const sounding = built.value;
  
  sounding.quality.levelsDiscardedBelowGround;  // cuántos cayeron bajo el terreno
  sounding.quality.maxVerticalGapM;             // el hueco más grande que queda
  
  // Temperatura a 1500 m sobre el campo, interpolando lineal en log-p:
  const level = interpolateAtAgl(sounding, m(1500));
  if (level.ok) level.value.tempK;
  
  // Inversiones y capas estables en los primeros 5 km, con espesor mínimo de 100 m:
  for (const layer of findInversions(sounding)) {
    layer.kind;          // "inversion" | "isothermal" | "stable"
    layer.baseMslM;
    layer.strengthK;
  }
  
  // Viento medio de la capa mezclada, promediando componentes U/V y no grados:
  const mean = meanWind(
    sounding.levels
      .filter((l) => l.geopotentialMslM < 3000)
      .map((l) => ({ wind: { speedMs: l.windSpeedMs, fromDeg: l.windFromDeg }, weight: 1 })),
  );
  mean.speedMs;
  mean.fromDeg;
  void [buildSounding, interpolateAtAgl, findInversions, meanWind, maxGapBelow, m, built, sounding, level, mean];
  return undefined;
}
