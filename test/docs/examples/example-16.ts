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

import { renderSkewT, renderUpdraftProfile, renderDayTimeline } from "../../../src/render/index.js";
import { GLIDER_CLUB } from "../../../src/aircraft/index.js";
import { m } from "../../../src/units/index.js";

/** `soarwx/render` */
export async function example(): Promise<unknown> {
  const best = day.best!;
  
  // Diagrama oblicuo con la parcela, el techo y el panel de viento a la derecha.
  const skewt = renderSkewT(best.sounding, {
    parcelFromK: best.sounding.surface.tempK,
    ceilingMslM: m(site.elevationMslM + best.ceiling.aglM),
    windUnit: "kmh",
    // `exactOptionalPropertyTypes` está activo: una opción ausente se omite,
    // no se pasa como `undefined`.
    ...(best.cloud.baseAglM === null ? {} : { lclMslM: m(site.elevationMslM + best.cloud.baseAglM) }),
  });
  
  // Ascendencia frente a altura: el núcleo y lo que marcaría el variómetro.
  const profile = renderUpdraftProfile(best.thermal.wStarMs, best.thermal.thermalTopAglM, GLIDER_CLUB, {
    marks: {
      hcritAglM: best.ceiling.aglM,
      ...(best.cloud.baseAglM === null ? {} : { cloudBaseAglM: best.cloud.baseAglM }),
    },
  });
  
  // Evolución del techo a lo largo del día, con la ventana y el mejor momento.
  const timeline = renderDayTimeline(day);
  
  container.innerHTML = skewt;   // son cadenas, no nodos
  void [profile, timeline];
  void [renderSkewT, renderUpdraftProfile, renderDayTimeline, GLIDER_CLUB, m, best, skewt, profile, timeline];
  return undefined;
}
