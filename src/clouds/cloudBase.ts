/**
 * Base de los cumulus.
 *
 * Se calcula como el nivel de condensación de una parcela de **capa mezclada**:
 * la temperatura máxima prevista en superficie con la razón de mezcla media de
 * la capa, no con el punto de rocío instantáneo de dos metros.
 */

import { m } from "../units/branded.js";
import type { Kelvin, KgPerKg, Metres } from "../units/branded.js";
import { andThen, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import { dewpointFromMixingRatio } from "../thermo/saturation.js";
import { lcl } from "../thermo/lcl.js";
import type { Sounding } from "../sounding/types.js";
import { mixedLayerMean } from "./mixedLayer.js";

export interface CloudBaseResult {
  readonly baseAglM: Metres;
  readonly baseMslM: Metres;
  readonly method: "mixed_layer_ccl";
  readonly mixedLayerMixingRatioKgKg: KgPerKg;
  /** Verdadero si la base queda por debajo del techo térmico: puede haber cumulus. */
  readonly sufficientMoisture: boolean;
}

/**
 * Base de cumulus por el nivel de condensación de la parcela de capa mezclada.
 *
 * @source Bolton, D. (1980), Monthly Weather Review 108, ec. 15 (LCL);
 *         parcela de capa mezclada, Stull, Practical Meteorology, cap. 5.
 */
export function cumulusBase(
  sounding: Sounding,
  mixingHeightAglM: Metres,
  maxSurfaceTempK: Kelvin,
  thermalTopAglM: Metres = mixingHeightAglM,
): Result<CloudBaseResult> {
  return andThen(mixedLayerMean(sounding, mixingHeightAglM), (mixed) => {
    const dewpointK = dewpointFromMixingRatio(
      mixed.meanMixingRatioKgKg,
      sounding.surface.pressurePa,
    );
    const result = lcl(maxSurfaceTempK, dewpointK, sounding.surface.pressurePa);
    const baseAglM = m(result.heightAboveParcelM);

    return ok({
      baseAglM,
      baseMslM: m(sounding.site.elevationMslM + baseAglM),
      method: "mixed_layer_ccl",
      mixedLayerMixingRatioKgKg: mixed.meanMixingRatioKgKg,
      sufficientMoisture: baseAglM < thermalTopAglM,
    } satisfies CloudBaseResult);
  });
}
