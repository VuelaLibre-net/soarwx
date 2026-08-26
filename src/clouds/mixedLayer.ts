/**
 * Promedios de la capa mezclada.
 *
 * La base de los cumulus **no** sale de la parcela instantánea de dos metros,
 * sino de la razón de mezcla media de la capa mezclada. Al mediodía el aire
 * junto al suelo está más seco y más caliente que la capa que hay encima, y una
 * térmica que sale del suelo se lleva la mezcla de la capa, no el valor puntual
 * del termómetro y del higrómetro.
 */

import { K, kgkg, m } from "../units/branded.js";
import type { Kelvin, KgPerKg, Metres } from "../units/branded.js";
import { err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import { mixingRatio } from "../thermo/saturation.js";
import { potentialTemperature } from "../thermo/potential.js";
import { consecutivePairs } from "../types/array.js";
import type { Sounding } from "../sounding/types.js";

export interface MixedLayerResult {
  /** Razón de mezcla media, ponderada por masa. */
  readonly meanMixingRatioKgKg: KgPerKg;
  /** Temperatura potencial media, ponderada por masa. */
  readonly meanPotentialTempK: Kelvin;
  readonly topAglM: Metres;
  readonly levelsUsed: number;
}

/**
 * Medias ponderadas por masa (por espesor en presión) desde la superficie hasta
 * el techo de la capa mezclada.
 *
 * @source Definición de parcela de capa mezclada; Stull, Practical Meteorology,
 *         cap. 5 y 18.
 */
export function mixedLayerMean(
  sounding: Sounding,
  topAglM: Metres,
): Result<MixedLayerResult> {
  const topMslM = sounding.site.elevationMslM + topAglM;

  let weight = 0;
  let mixingSum = 0;
  let thetaSum = 0;
  let levelsUsed = 0;

  for (const [lower, upper] of consecutivePairs(sounding.levels)) {
    if (lower.geopotentialMslM >= topMslM) break;

    // El tramo se recorta en el techo de la capa.
    const fraction =
      upper.geopotentialMslM <= topMslM
        ? 1
        : (topMslM - lower.geopotentialMslM) /
          (upper.geopotentialMslM - lower.geopotentialMslM);
    const dp = (lower.pressurePa - upper.pressurePa) * fraction;
    if (dp <= 0) continue;

    const wLower = mixingRatio(lower.dewpointK, lower.pressurePa);
    const wUpper = mixingRatio(upper.dewpointK, upper.pressurePa);
    const thetaLower = potentialTemperature(lower.tempK, lower.pressurePa);
    const thetaUpper = potentialTemperature(upper.tempK, upper.pressurePa);

    mixingSum += ((wLower + wUpper) / 2) * dp;
    thetaSum += ((thetaLower + thetaUpper) / 2) * dp;
    weight += dp;
    levelsUsed++;
  }

  if (weight <= 0 || levelsUsed === 0) {
    return err("INSUFFICIENT_LEVELS", "no levels inside the mixed layer", {
      topAglM,
      levels: sounding.levels.length,
    });
  }

  return ok({
    meanMixingRatioKgKg: kgkg(mixingSum / weight),
    meanPotentialTempK: K(thetaSum / weight),
    topAglM: m(topAglM),
    levelsUsed,
  });
}
