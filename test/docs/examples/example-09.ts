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

import { mixedLayerMean, cumulusBase, cumulusDepth, isBlueDay, usableCeiling, overdevelopmentRisk } from "../../../src/clouds/index.js";
import { m } from "../../../src/units/index.js";

/** `soarwx/clouds` */
export async function example(): Promise<unknown> {
  // Promedios ponderados por masa de la capa mezclada.
  const ml = mixedLayerMean(sounding, m(2400));
  
  // La base es el CCL de la parcela de capa mezclada, no el LCL de los 2 m.
  const base = cumulusBase(sounding, m(2400), maxSurfaceTempK, m(2777));
  const cloudBaseAglM = base.ok && base.value.sufficientMoisture ? base.value.baseAglM : null;
  
  const ceiling = usableCeiling({
    hcritAglM: m(2364),
    thermalTopAglM: m(2777),
    cloudBaseAglM,
    overcast: false,
    elevationMslM: m(1013),
  });
  ceiling.aglM;        // 2364
  ceiling.limitedBy;   // "hcrit" — el motivo va con el número, siempre
  
  // Día azul: la capa se acaba antes de que la parcela condense.
  cloudBaseAglM === null || isBlueDay(cloudBaseAglM, m(2777));
  
  // Sobredesarrollo como escala ordinal, con los indicadores que lo empujan.
  const od = overdevelopmentRisk({
    cumulusDepthM: m(1200),
    midLevelHumidityFrac: 0.55,
    capeBand: "moderate",
    convectiveInhibitionJkg: 20,
    cloudCoverMidFrac: 0.3,
  });
  od.level;     // "none" | "low" | "moderate" | "high" | "severe"
  od.drivers;   // ["depth", "midlevel_moisture", ...] — qué lo está subiendo
  void [mixedLayerMean, cumulusBase, cumulusDepth, isBlueDay, usableCeiling, overdevelopmentRisk, m, ml, base, cloudBaseAglM, ceiling, od];
  return undefined;
}
