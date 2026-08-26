/**
 * Índice térmico y techo térmico por el método de la parcela.
 *
 * El vocabulario clásico de la previsión térmica, que el predecesor no tenía:
 * se limitaba a leer `boundary_layer_height` del modelo.
 *
 *     TI(z) = T_entorno(z) − T_parcela(z)
 *
 * Negativo significa que la parcela está más caliente que el aire que la rodea:
 * sube. El techo está donde cambia de signo.
 */

import { K, m } from "../units/branded.js";
import type { Kelvin, Metres, Pascal } from "../units/branded.js";
import { err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import { dryAdiabaticLift } from "../thermo/parcel.js";
import { interpolateAtHeight } from "../sounding/interpolate.js";
import { potentialTemperature } from "../thermo/potential.js";
import { at, consecutivePairs } from "../types/array.js";
import type { Sounding } from "../sounding/types.js";
import type { StableLayer } from "../sounding/inversion.js";
import { findInversions } from "../sounding/inversion.js";

/**
 * Índice térmico de trabajo. El techo absoluto está en TI = 0, pero por encima
 * de TI = −2 K las térmicas suelen ser ya demasiado débiles para el planeador.
 */
export const WORKING_THERMAL_INDEX_K = -2;

/**
 * Altura de referencia para medir el exceso superadiabático de la capa
 * superficial. Por encima de ella el perfil ya está mezclado.
 */
export const SURFACE_LAYER_TOP_AGL_M = 200;

const BISECTION_STEPS = 60;

/**
 * Índice térmico a una altura sobre el nivel del mar.
 *
 * La parcela parte de la superficie con la temperatura máxima prevista del día
 * y asciende por la adiabática seca.
 *
 * @source Método clásico del índice térmico; ver Glendening (DrJack),
 *         «Thermal Index», y Stull, Practical Meteorology, cap. 5.
 */
export function thermalIndexAt(
  sounding: Sounding,
  maxSurfaceTempK: Kelvin,
  mslM: Metres,
): Result<number> {
  const level = interpolateAtHeight(sounding, mslM);
  if (!level.ok) return level;
  return ok(
    level.value.tempK -
      parcelTempAt(maxSurfaceTempK, sounding.surface.pressurePa, level.value.pressurePa),
  );
}

function parcelTempAt(
  maxSurfaceTempK: Kelvin,
  surfacePressurePa: Pascal,
  pressurePa: Pascal,
): number {
  return dryAdiabaticLift(maxSurfaceTempK, surfacePressurePa, pressurePa);
}

export interface ThermalTopResult {
  /** Altura donde TI = 0: techo absoluto de la parcela de superficie. */
  readonly topAglM: Metres;
  readonly topMslM: Metres;
  /** Altura donde TI = −2 K: techo de trabajo. */
  readonly workingTopAglM: Metres;
  /**
   * Techo de una parcela a la que se le ha quitado el exceso superadiabático de
   * la capa superficial. Más conservador y físicamente más defendible: una
   * térmica que sale del suelo no conserva hasta arriba los grados de más que
   * marca el termómetro a dos metros.
   */
  readonly mixedLayerTopAglM: Metres;
  /**
   * Exceso de temperatura potencial de la superficie sobre la capa mezclada.
   * Cuanto mayor, más sobreestima el método clásico.
   */
  readonly surfaceExcessK: number;
  /** Capa estable que corta el ascenso, si el techo cae dentro de una. */
  readonly cappedByInversion: StableLayer | null;
  readonly method: "parcel";
}

/**
 * Exceso de temperatura potencial de la superficie sobre la capa mezclada.
 *
 * Al mediodía la capa superficial es superadiabática y el termómetro de dos
 * metros marca varios grados por encima de la temperatura potencial de la capa
 * mezclada: medido en Fuentemilanos a las 14:00, θ en superficie es 42.3 °C y
 * en la capa mezclada 40.2 °C. Lanzar la parcela desde el valor de superficie
 * sin descontar ese exceso la lleva cientos de metros más arriba de lo que
 * llega una térmica real.
 *
 * @source Estructura de la capa superficial convectiva; Stull, Practical
 *         Meteorology, cap. 18.
 */
export function superadiabaticExcessK(
  sounding: Sounding,
  referenceAglM: Metres = m(SURFACE_LAYER_TOP_AGL_M),
): number {
  const surface = at(sounding.levels, 0);
  const thetaSurface = potentialTemperature(surface.tempK, surface.pressurePa);
  const reference = interpolateAtHeight(
    sounding,
    m(sounding.site.elevationMslM + referenceAglM),
  );
  if (!reference.ok) return 0;
  const thetaReference = potentialTemperature(
    reference.value.tempK,
    reference.value.pressurePa,
  );
  return Math.max(0, thetaSurface - thetaReference);
}

/**
 * Techo térmico por el método de la parcela: altura a la que una parcela que
 * parte de la superficie con la temperatura máxima prevista deja de estar más
 * caliente que el entorno.
 *
 * **No** se usa `boundary_layer_height` del modelo. Esa variable es una
 * profundidad diagnóstica por número de Richardson que incluye mezcla por
 * cizalladura y capas residuales: medida en Fuentemilanos con GFS, alcanza su
 * máximo a las 18:00 hora local, cuando la radiación ya ha caído un 30 % desde
 * el pico y las térmicas se están muriendo.
 *
 * @source Método de la parcela; Glendening (DrJack), advertencia sobre el
 *         techo de capa límite del modelo.
 */
export function thermalTop(
  sounding: Sounding,
  maxSurfaceTempK: Kelvin,
): Result<ThermalTopResult> {
  const levels = sounding.levels;
  if (levels.length < 2) return err("INSUFFICIENT_LEVELS", "sounding has no layers");

  const surfacePressurePa = sounding.surface.pressurePa;
  const ti = (level: { tempK: Kelvin; pressurePa: Pascal }): number =>
    level.tempK - parcelTempAt(maxSurfaceTempK, surfacePressurePa, level.pressurePa);

  // La flotabilidad se juzga en el primer nivel **por encima** de la
  // superficie: en el propio nivel de superficie la parcela y el entorno
  // coinciden por construcción cuando la máxima prevista es la temperatura
  // actual, y el criterio daría siempre negativo.
  const firstAloftTi = ti(at(levels, 1));
  if (firstAloftTi >= 0) {
    return err("NO_CONVECTION", "parcel is not buoyant above the surface", {
      maxSurfaceTempK,
      thermalIndexK: firstAloftTi,
    });
  }

  const topMslM = crossing(sounding, maxSurfaceTempK, 0);
  if (topMslM === null) {
    return err("OUT_OF_VALID_RANGE", "parcel stays buoyant above the sounding top", {
      topOfSoundingMslM: at(levels, levels.length - 1).geopotentialMslM,
    });
  }
  const workingMslM = crossing(sounding, maxSurfaceTempK, WORKING_THERMAL_INDEX_K);

  // Techo de la parcela sin el exceso superadiabático de la capa superficial.
  // Si esa parcela ya no flota justo por encima del suelo, no hay térmica que
  // valga: el techo de capa mezclada es el propio suelo.
  const surfaceExcessK = superadiabaticExcessK(sounding);
  const mixedLayerParcelK = K(maxSurfaceTempK - surfaceExcessK);
  const firstAloft = at(levels, 1);
  const mixedLayerBuoyant =
    firstAloft.tempK -
      dryAdiabaticLift(mixedLayerParcelK, surfacePressurePa, firstAloft.pressurePa) <
    0;
  // Se busca el **último** cruce, no el primero: dentro de una capa bien
  // mezclada TI ≈ 0 en todo su espesor, así que el primer cruce cae en la base
  // y daría un techo de decenas de metros en pleno día térmico.
  const mixedLayerMslM = mixedLayerBuoyant
    ? Math.min(lastCrossing(sounding, mixedLayerParcelK, 0) ?? topMslM, topMslM)
    : at(levels, 0).geopotentialMslM;

  const elevation = sounding.site.elevationMslM;
  const capping =
    findInversions(sounding).find(
      (layer) => topMslM >= layer.baseMslM && topMslM <= layer.topMslM,
    ) ?? null;

  return ok({
    topAglM: m(topMslM - elevation),
    topMslM: m(topMslM),
    workingTopAglM: m(Math.max(0, (workingMslM ?? topMslM) - elevation)),
    mixedLayerTopAglM: m(Math.max(0, mixedLayerMslM - elevation)),
    surfaceExcessK,
    cappedByInversion: capping,
    method: "parcel",
  });
}

/**
 * Altura MSL del **último** cruce del índice térmico con el valor objetivo.
 *
 * Es lo que corresponde a una parcela de capa mezclada: dentro de la capa el
 * índice ronda cero en todo su espesor, y lo que interesa es dónde deja de
 * hacerlo, no dónde empieza.
 */
function lastCrossing(
  sounding: Sounding,
  maxSurfaceTempK: Kelvin,
  targetK: number,
): number | null {
  const surfacePressurePa = sounding.surface.pressurePa;
  const ti = (level: { tempK: Kelvin; pressurePa: Pascal }): number =>
    level.tempK - parcelTempAt(maxSurfaceTempK, surfacePressurePa, level.pressurePa);

  const pairs = [...consecutivePairs(sounding.levels)];
  for (let i = pairs.length - 1; i >= 0; i--) {
    const pair = pairs[i];
    if (!pair) continue;
    const [lower, upper] = pair;
    if (ti(lower) < targetK && ti(upper) >= targetK) {
      return bisect(sounding, maxSurfaceTempK, targetK, lower, upper);
    }
  }
  return null;
}

function bisect(
  sounding: Sounding,
  maxSurfaceTempK: Kelvin,
  targetK: number,
  lower: { geopotentialMslM: Metres },
  upper: { geopotentialMslM: Metres },
): number {
  let low = lower.geopotentialMslM as number;
  let high = upper.geopotentialMslM as number;
  for (let i = 0; i < BISECTION_STEPS; i++) {
    const mid = (low + high) / 2;
    const value = thermalIndexAt(sounding, maxSurfaceTempK, m(mid));
    if (!value.ok) break;
    if (value.value < targetK) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** Altura MSL donde el índice térmico alcanza el valor objetivo por primera vez. */
function crossing(
  sounding: Sounding,
  maxSurfaceTempK: Kelvin,
  targetK: number,
): number | null {
  const surfacePressurePa = sounding.surface.pressurePa;
  const ti = (level: { tempK: Kelvin; pressurePa: Pascal }): number =>
    level.tempK - parcelTempAt(maxSurfaceTempK, surfacePressurePa, level.pressurePa);

  for (const [lower, upper] of consecutivePairs(sounding.levels)) {
    if (ti(lower) < targetK && ti(upper) >= targetK) {
      return bisect(sounding, maxSurfaceTempK, targetK, lower, upper);
    }
  }
  return null;
}
