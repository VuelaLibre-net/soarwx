/**
 * Viento: componentes, medias vectoriales y cizalladura.
 *
 * Todo se promedia por componentes, nunca por módulos. Dos capas con vientos
 * opuestos dan media cero, y eso es información, no un artefacto (R-5.4).
 */

import { deg, mps } from "../units/branded.js";
import type { Degrees, MPerS, Metres } from "../units/branded.js";
import { normaliseBearing } from "../units/convert.js";
import type { WindVector } from "./types.js";

export interface WindComponents {
  /** Componente hacia el este, m/s. */
  readonly uMs: MPerS;
  /** Componente hacia el norte, m/s. */
  readonly vMs: MPerS;
}

const DEG_TO_RAD = Math.PI / 180;

/**
 * Descompone un viento meteorológico (dirección DE DONDE viene) en componentes
 * cartesianas. Viento del 270° sopla hacia el este: u > 0, v = 0.
 *
 * @source Convención meteorológica estándar; WMO.
 */
export function toComponents(speedMs: MPerS, fromDeg: Degrees): WindComponents {
  const rad = fromDeg * DEG_TO_RAD;
  const speed: number = speedMs;
  return { uMs: mps(-speed * Math.sin(rad)), vMs: mps(-speed * Math.cos(rad)) };
}

/**
 * Recompone módulo y dirección de procedencia a partir de las componentes.
 *
 * @source Convención meteorológica estándar; WMO.
 */
export function fromComponents(uMs: number, vMs: number): WindVector {
  const speed = Math.hypot(uMs, vMs);
  if (speed < 1e-12) return { speedMs: mps(0), fromDeg: deg(0) };
  return {
    speedMs: mps(speed),
    fromDeg: normaliseBearing(Math.atan2(-uMs, -vMs) / DEG_TO_RAD),
  };
}

export interface ShearResult {
  /** Módulo de la diferencia vectorial de viento entre los dos extremos. */
  readonly deltaMs: MPerS;
  /** Cizalladura como diferencia vectorial por kilómetro de espesor. */
  readonly shearMsPerKm: number;
  readonly depthM: Metres;
}

/**
 * Cizalladura vectorial entre dos vientos separados por un espesor dado.
 *
 * Comparar solo módulos es un error: una inversión completa de dirección con el
 * mismo módulo da cizalladura cero, cuando en realidad es la máxima posible.
 *
 * @source Definición estándar de cizalladura vectorial; Stull, cap. 18.
 */
export function shearBetween(
  lower: WindVector,
  upper: WindVector,
  depthM: Metres,
): ShearResult {
  const a = toComponents(lower.speedMs, lower.fromDeg);
  const b = toComponents(upper.speedMs, upper.fromDeg);
  const delta = Math.hypot(b.uMs - a.uMs, b.vMs - a.vMs);
  const depth = Math.max(depthM, 1);
  return {
    deltaMs: mps(delta),
    shearMsPerKm: (delta / depth) * 1000,
    depthM,
  };
}

/**
 * Media vectorial de una lista de vientos con pesos (típicamente espesores).
 *
 * @source Media vectorial; ver DrJack, «Boundary Layer Average Wind».
 */
export function meanWind(
  samples: readonly { readonly wind: WindVector; readonly weight: number }[],
): WindVector {
  let u = 0;
  let v = 0;
  let total = 0;
  for (const { wind, weight } of samples) {
    if (weight <= 0) continue;
    const c = toComponents(wind.speedMs, wind.fromDeg);
    u += c.uMs * weight;
    v += c.vMs * weight;
    total += weight;
  }
  if (total === 0) return { speedMs: mps(0), fromDeg: deg(0) };
  return fromComponents(u / total, v / total);
}
