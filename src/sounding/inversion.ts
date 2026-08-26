/**
 * Capas estables e inversiones.
 *
 * Con 6-9 niveles utilizables y huecos de hasta 500 m dentro de la capa
 * límite, la detección es necesariamente gruesa: una inversión de menos de
 * 100 m de espesor no se ve. Es una limitación de los datos, no del método, y
 * se documenta como tal.
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
  /** Gradiente térmico. Negativo significa que la temperatura sube con la altura. */
  readonly lapseRateKPerM: number;
  readonly kind: StableLayerKind;
  /** Salto de temperatura potencial a través de la capa. */
  readonly strengthK: number;
}

/**
 * Umbral de estabilidad en temperatura potencial. Por debajo se considera capa
 * mezclada: en una capa límite bien mezclada dθ/dz ≈ 0, pero el ruido del
 * modelo y la resolución vertical producen gradientes pequeños espurios.
 */
export const STABLE_THETA_GRADIENT_K_PER_KM = 2;

/** Por debajo de este gradiente térmico en módulo la capa se llama isoterma. */
export const ISOTHERMAL_LAPSE_K_PER_KM = 0.5;

/**
 * Espesor mínimo para considerar una capa. Con niveles separados decenas de
 * metros, el ruido entre familias de variables del modelo produce microcapas
 * espurias: en Fuentemilanos, el tramo de 1060 a 1081 m aparece como isotermo
 * con 0.2 K de salto solo porque compara un nivel de presión con uno de altura.
 *
 * Una inversión más fina que esto no se detecta. Es una limitación de la
 * resolución vertical de los datos, no del método.
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
 * Capas estables e inversiones por debajo de una altura dada.
 *
 * Las capas contiguas del mismo tipo se funden: dos tramos consecutivos de
 * inversión son una sola inversión, no dos.
 *
 * @source Definición estándar de inversión y de estabilidad estática seca
 *         (dθ/dz > 0); Stull, Practical Meteorology, cap. 5.
 */
export function findInversions(
  sounding: Sounding,
  maxMslM?: Metres,
  minThicknessM: number = MIN_LAYER_THICKNESS_M,
): readonly StableLayer[] {
  const ceiling = maxMslM ?? m(sounding.site.elevationMslM + 5000);

  // Primero se clasifica cada tramo entre niveles consecutivos, guardando los
  // niveles extremos; después se funden los tramos contiguos del mismo tipo y
  // se recalcula el gradiente sobre el espesor completo.
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
