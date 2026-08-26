/**
 * Stable layers and temperature inversions.
 *
 * Given 6-9 usable levels with vertical gaps up to 500 m in the boundary layer,
 * detection is necessarily coarse: shallow inversions under 100 m thickness
 * cannot be resolved. This is a data resolution limitation, not an algorithmic one.
 */

import { m } from "../units/branded.js";
import type { Metres } from "../units/branded.js";
import { potentialTemperature } from "../thermo/potential.js";
import type { Level, Sounding } from "./types.js";
import { consecutivePairs } from "../types/array.js";

export type StableLayerKind = "inversion" | "isothermal" | "stable";

export interface StableLayer {
  readonly baseMslM: Metres;
  readonly topMslM: Metres;
  /** Thermal lapse rate. Negative indicates temperature increases with altitude. */
  readonly lapseRateKPerM: number;
  readonly kind: StableLayerKind;
  /** Potential temperature jump across the layer. */
  readonly strengthK: number;
}

/**
 * Stability threshold in potential temperature gradient. Below this, the layer
 * is considered mixed: in a well-mixed boundary layer dθ/dz ≈ 0, but model noise
 * and vertical discretization create small spurious gradients.
 */
export const STABLE_THETA_GRADIENT_K_PER_KM = 2;

/** Below this absolute lapse rate, the layer is classified as isothermal. */
export const ISOTHERMAL_LAPSE_K_PER_KM = 0.5;

/**
 * Minimum thickness required to identify a stable layer.
 * With levels spaced tens of metres apart, noise between model variable families
 * can generate spurious micro-layers.
 *
 * Inversions thinner than this threshold are not resolved.
 */
export const MIN_LAYER_THICKNESS_M = 100;

function classify(
  lapseKPerKm: number,
  thetaGradientKPerKm: number,
): StableLayerKind | null {
  if (lapseKPerKm < 0) return "inversion";
  if (lapseKPerKm <= ISOTHERMAL_LAPSE_K_PER_KM) return "isothermal";
  if (thetaGradientKPerKm >= STABLE_THETA_GRADIENT_K_PER_KM) return "stable";
  return null;
}

/**
 * Identifies stable layers and temperature inversions below a specified altitude.
 *
 * Adjacent segments of identical type are merged into single layers.
 *
 * @source Standard definitions of inversion and dry static stability (dθ/dz > 0);
 *         Stull, Practical Meteorology, ch. 5.
 */
export function findInversions(
  sounding: Sounding,
  maxMslM?: Metres,
  minThicknessM: number = MIN_LAYER_THICKNESS_M,
): readonly StableLayer[] {
  const ceiling = maxMslM ?? m(sounding.site.elevationMslM + 5000);

  // 1. Classify individual segments between consecutive levels.
  // 2. Merge adjacent segments of identical type and recompute gradient.
  const segments: { kind: StableLayerKind; lower: Level; upper: Level }[] = [];

  for (const [lower, upper] of consecutivePairs(sounding.levels)) {
    if (lower.geopotentialMslM >= ceiling) break;

    const dz = upper.geopotentialMslM - lower.geopotentialMslM;
    if (dz <= 0) continue;

    const lapseKPerKm = ((lower.tempK - upper.tempK) / dz) * 1000;
    const thetaGradientKPerKm =
      ((potentialTemperature(upper.tempK, upper.pressurePa) -
        potentialTemperature(lower.tempK, lower.pressurePa)) /
        dz) *
      1000;

    const kind = classify(lapseKPerKm, thetaGradientKPerKm);
    if (kind === null) continue;

    const previous = segments[segments.length - 1];
    if (previous?.kind === kind && previous.upper === lower) {
      previous.upper = upper;
    } else {
      segments.push({ kind, lower, upper });
    }
  }

  return segments
    .filter(
      ({ lower, upper }) =>
        upper.geopotentialMslM - lower.geopotentialMslM >= minThicknessM,
    )
    .map(({ kind, lower, upper }) => {
      const dz = upper.geopotentialMslM - lower.geopotentialMslM;
      return {
        baseMslM: lower.geopotentialMslM,
        topMslM: upper.geopotentialMslM,
        lapseRateKPerM: (lower.tempK - upper.tempK) / dz,
        kind,
        strengthK:
          potentialTemperature(upper.tempK, upper.pressurePa) -
          potentialTemperature(lower.tempK, lower.pressurePa),
      } satisfies StableLayer;
    });
}
