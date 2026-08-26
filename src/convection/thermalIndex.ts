/**
 * Thermal index and thermal ceiling via parcel method.
 *
 * Classical thermal soaring terminology:
 *
 *     TI(z) = T_env(z) − T_parcel(z)
 *
 * Negative indicates the parcel is warmer than ambient air: it accelerates upward.
 * The thermal top is where TI crosses zero.
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
 * Working thermal index. The absolute ceiling sits at TI = 0, but above
 * TI = −2 K thermals are generally too weak for gliders.
 */
export const WORKING_THERMAL_INDEX_K = -2;

/**
 * Reference height for measuring superadiabatic surface layer excess.
 * Above this layer, the convective profile is well mixed.
 */
export const SURFACE_LAYER_TOP_AGL_M = 200;

const BISECTION_STEPS = 60;

/**
 * Thermal index at a specified altitude above mean sea level.
 *
 * The parcel ascends dry adiabatically from the surface at the predicted
 * daily maximum temperature.
 *
 * @source Classical thermal index method; see Glendening (DrJack),
 *         "Thermal Index", and Stull, Practical Meteorology, ch. 5.
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
  /** Altitude where TI = 0: absolute surface parcel ceiling. */
  readonly topAglM: Metres;
  readonly topMslM: Metres;
  /** Altitude where TI = −2 K: working ceiling. */
  readonly workingTopAglM: Metres;
  /**
   * Mixed-layer parcel ceiling after subtracting superadiabatic surface excess.
   * More conservative and physically realistic: thermals ascending from the
   * ground do not maintain the 2m temperature excess throughout their depth.
   */
  readonly mixedLayerTopAglM: Metres;
  /**
   * Surface potential temperature excess over mixed layer.
   * Larger excess indicates greater overestimation by the classical parcel method.
   */
  readonly surfaceExcessK: number;
  /** Inversion capping convective ascent, if ceiling falls inside one. */
  readonly cappedByInversion: StableLayer | null;
  readonly method: "parcel";
}

/**
 * Surface layer superadiabatic potential temperature excess.
 *
 * At solar noon the surface layer is superadiabatic and the 2m thermometer
 * reads several degrees above the mixed-layer potential temperature: measured
 * at Fuentemilanos at 14:00, surface θ is 42.3 °C while mixed-layer θ is 40.2 °C.
 * Lifting the parcel directly from the surface value without discounting this
 * excess places the ceiling hundreds of metres higher than actual thermals reach.
 *
 * @source Convective surface layer structure; Stull, Practical Meteorology, ch. 18.
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
 * Thermal ceiling via parcel method: altitude where a surface parcel lifted
 * at maximum temperature ceases to be warmer than the environment.
 *
 * Does **not** use model `boundary_layer_height`. That variable is a diagnostic
 * Richardson-number depth including shear mixing and residual layers: measured
 * at Fuentemilanos with GFS, it peaks at 18:00 local time when solar radiation
 * has already fallen 30 % and thermals are decaying.
 *
 * @source Parcel method; Glendening (DrJack), note on model boundary layer height.
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

  // Buoyancy is evaluated at the first level **above** the surface:
  // at the surface itself parcel and environment match by construction
  // when max temp equals current surface temp.
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

  // Mixed layer parcel ceiling without surface superadiabatic excess.
  // If this parcel is not buoyant right above the ground, mixed-layer ceiling
  // is at ground level.
  const surfaceExcessK = superadiabaticExcessK(sounding);
  const mixedLayerParcelK = K(maxSurfaceTempK - surfaceExcessK);
  const firstAloft = at(levels, 1);
  const mixedLayerBuoyant =
    firstAloft.tempK -
      dryAdiabaticLift(mixedLayerParcelK, surfacePressurePa, firstAloft.pressurePa) <
    0;
  // Search for the **last** crossing, not the first: inside a well-mixed layer
  // TI ≈ 0 throughout its depth, so first crossing would fall at the base.
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
 * MSL altitude of the **last** thermal index crossing with the target value.
 *
 * Used for mixed-layer parcels where TI remains near zero throughout the layer.
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

/** MSL altitude where the thermal index first reaches the target value. */
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
