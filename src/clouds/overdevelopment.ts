/**
 * Riesgo de sobredesarrollo.
 *
 * **Ordinal, nunca binario.** El sobredesarrollo no es un umbral que se cruza:
 * es una tendencia que crece con el espesor del cumulus, la humedad en niveles
 * medios y la energía disponible por encima de la capa límite.
 *
 * Los pesos son empíricos y así se declaran. Lo que no se hace es puntuar la
 * CAPE como algo bueno: aquí solo suma riesgo.
 */

import type { Metres } from "../units/branded.js";
import type { CapeBand } from "../stability/capeRisk.js";

export type OverdevelopmentLevel = "none" | "low" | "moderate" | "high" | "severe";

export type OverdevelopmentDriver =
  "depth" | "midlevel_moisture" | "cape" | "low_inhibition" | "cloud_cover";

export interface OverdevelopmentInput {
  readonly cumulusDepthM: Metres;
  /** Humedad relativa media entre 700 y 500 hPa, fracción 0..1. */
  readonly midLevelHumidityFrac?: number;
  readonly capeBand?: CapeBand;
  readonly convectiveInhibitionJkg?: number | null;
  readonly cloudCoverMidFrac?: number;
}

export interface OverdevelopmentResult {
  readonly level: OverdevelopmentLevel;
  /** Puntos acumulados por los indicadores. Adimensional, empírico. */
  readonly riskPoints: number;
  readonly drivers: readonly OverdevelopmentDriver[];
}

/** Espesores de cumulus, en metros, a partir de los que empieza a preocupar. */
export const DEPTH_THRESHOLDS_M = [1000, 2000, 3000] as const;

/** Inhibición por debajo de la cual nada frena el desarrollo, en J/kg. */
export const WEAK_INHIBITION_JKG = 25;

/**
 * @source Indicadores clásicos de desarrollo convectivo; bandas de CAPE de
 *         Glendening (DrJack); ponderación empírica declarada.
 */
export function overdevelopmentRisk(input: OverdevelopmentInput): OverdevelopmentResult {
  const drivers: OverdevelopmentDriver[] = [];
  let points = 0;

  const depthPoints = DEPTH_THRESHOLDS_M.filter((t) => input.cumulusDepthM >= t).length;
  if (depthPoints > 0) {
    points += depthPoints;
    drivers.push("depth");
  }

  if (input.midLevelHumidityFrac !== undefined) {
    if (input.midLevelHumidityFrac >= 0.8) {
      points += 2;
      drivers.push("midlevel_moisture");
    } else if (input.midLevelHumidityFrac >= 0.6) {
      points += 1;
      drivers.push("midlevel_moisture");
    }
  }

  const capePoints = capeContribution(input.capeBand);
  if (capePoints > 0) {
    points += capePoints;
    drivers.push("cape");
  }

  const cin = input.convectiveInhibitionJkg;
  if (cin !== undefined && cin !== null && Math.abs(cin) < WEAK_INHIBITION_JKG) {
    points += 1;
    drivers.push("low_inhibition");
  }

  if ((input.cloudCoverMidFrac ?? 0) >= 0.5) {
    points += 1;
    drivers.push("cloud_cover");
  }

  return { level: classify(points), riskPoints: points, drivers };
}

function capeContribution(band: CapeBand | undefined): number {
  switch (band) {
    case "moderate":
      return 1;
    case "strong":
      return 2;
    case "extreme":
      return 3;
    default:
      return 0;
  }
}

function classify(points: number): OverdevelopmentLevel {
  if (points <= 0) return "none";
  if (points <= 2) return "low";
  if (points <= 4) return "moderate";
  if (points <= 6) return "high";
  return "severe";
}
