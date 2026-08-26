/**
 * Cumulus cloudbase computation.
 *
 * Computed as the condensation level of a **mixed layer parcel**:
 * forecast maximum surface temperature combined with mass-weighted mean
 * mixing ratio of the convective boundary layer.
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
  /** True when cloudbase lies below thermal ceiling (cumulus formation possible). */
  readonly sufficientMoisture: boolean;
}

/**
 * Cumulus cloudbase via condensation level of mixed-layer parcel.
 *
 * @source Bolton, D. (1980), Monthly Weather Review 108, eq. 15 (LCL);
 *         mixed-layer parcel method, Stull, Practical Meteorology, ch. 5.
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
