/**
 * Reconciliation between parcel-computed and model-diagnosed mixing heights.
 *
 * Both are exposed separately. **One never silently replaces the other**, and
 * the parcel method is always chosen as primary: parcel calculation is not
 * an alternative but the required path, because ICON-EU and ICON global
 * — the best sounding models for Spain — do not provide `boundary_layer_height`.
 */

import { m } from "../units/branded.js";
import type { Metres } from "../units/branded.js";

export interface MixingHeightResult {
  /** Height used downstream. Always the parcel-derived value. */
  readonly chosenAglM: Metres;
  readonly parcelAglM: Metres;
  readonly modelAglM: Metres | null;
  /** (model − parcel) / parcel. `null` if model does not provide BL height. */
  readonly divergenceFrac: number | null;
  /**
   * Model height significantly exceeds parcel height: mixing is likely
   * shear-driven or residual rather than thermal, and unusable by gliders.
   */
  readonly likelyShearDriven: boolean;
}

/**
 * Divergence threshold above which non-convective mixing is suspected.
 * Measured at Fuentemilanos with GFS at 18:00 local time, where `boundary_layer_height`
 * reported 4035 m despite solar radiation having fallen 30 % below peak.
 */
export const SHEAR_DRIVEN_DIVERGENCE_FRAC = 0.5;

/**
 * @source Glendening (DrJack): "when mixing results from shear rather than
 *         thermals, that height is unreachable by gliders".
 */
export function reconcileMixingHeight(
  parcelAglM: Metres,
  modelAglM: Metres | null,
  toleranceFrac: number = SHEAR_DRIVEN_DIVERGENCE_FRAC,
): MixingHeightResult {
  if (modelAglM === null || parcelAglM <= 0) {
    return {
      chosenAglM: parcelAglM,
      parcelAglM,
      modelAglM,
      divergenceFrac: null,
      likelyShearDriven: false,
    };
  }

  const divergenceFrac = (modelAglM - parcelAglM) / parcelAglM;
  return {
    chosenAglM: m(parcelAglM),
    parcelAglM,
    modelAglM,
    divergenceFrac,
    likelyShearDriven: divergenceFrac > toleranceFrac,
  };
}
