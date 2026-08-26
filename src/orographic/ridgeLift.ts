/**
 * Sustentación de ladera.
 *
 * **Sin sierras con nombre.** El relieve entra como `RidgeSpec`: orientación de
 * la cresta, pendiente de la cara y altitud. El predecesor tenía los 310° del
 * Guadarrama y un factor empírico de 0.08 incrustados en la física general, y
 * ese factor implicaba una pendiente efectiva de unos 4.6° que no corresponde a
 * ninguna ladera concreta.
 */

import { mps } from "../units/branded.js";
import type { MPerS } from "../units/branded.js";
import { toComponents } from "../sounding/wind.js";
import type { WindVector } from "../sounding/types.js";
import type { RidgeSpec } from "../types/site.js";

export type RidgeLiftBand = "insufficient" | "marginal" | "optimal" | "dangerous";

export interface RidgeLiftResult {
  /** Componente del viento perpendicular a la cresta, en valor absoluto. */
  readonly perpendicularMs: MPerS;
  /** Velocidad vertical del aire forzado a subir por la ladera. */
  readonly verticalMs: MPerS;
  /** Ángulo entre el viento y la perpendicular a la cresta, 0 = de frente. */
  readonly incidenceDeg: number;
  readonly band: RidgeLiftBand;
}

/**
 * Umbrales de la componente perpendicular, en m/s.
 *
 * Son **empíricos y orientativos**, equivalentes a 8, 15 y 28 nudos, que es el
 * escalón que manejan habitualmente los pilotos. No proceden de ninguna
 * publicación con derivación, así que se exponen como constantes para que el
 * consumidor pueda recalibrarlos.
 */
export const RIDGE_LIFT_THRESHOLDS_MS = {
  marginal: 4.1,
  optimal: 7.7,
  dangerous: 14.4,
} as const;

const DEG_TO_RAD = Math.PI / 180;

/**
 * Sustentación de ladera a partir del viento a la altura de la cresta.
 *
 *     U⊥ = |viento · n|,  n perpendicular a la cresta
 *     w  = U⊥ · sen(pendiente)
 *
 * La velocidad vertical sale de la geometría real de la ladera, no de un factor
 * ajustado. Una cara de 15° con 10 m/s perpendiculares da 2.6 m/s de ascendencia;
 * el factor 0.08 del predecesor daba 0.8 m/s, que corresponde a una pendiente de
 * 4.6°.
 *
 * @source Flujo forzado sobre relieve; Stull, Practical Meteorology, cap. 17.
 */
export function ridgeLift(ridge: RidgeSpec, windAtCrest: WindVector): RidgeLiftResult {
  const wind = toComponents(windAtCrest.speedMs, windAtCrest.fromDeg);

  // Vector normal a la cresta, en el plano horizontal.
  const bearing = ridge.bearingDeg * DEG_TO_RAD;
  const normalX = Math.cos(bearing);
  const normalY = -Math.sin(bearing);

  const signed = wind.uMs * normalX + wind.vMs * normalY;
  const perpendicular = Math.abs(signed);
  const vertical = perpendicular * Math.sin(ridge.slopeDeg * DEG_TO_RAD);

  const incidenceDeg =
    windAtCrest.speedMs <= 0
      ? 90
      : Math.acos(Math.min(1, perpendicular / windAtCrest.speedMs)) / DEG_TO_RAD;

  return {
    perpendicularMs: mps(perpendicular),
    verticalMs: mps(vertical),
    incidenceDeg,
    band: classify(perpendicular),
  };
}

function classify(perpendicularMs: number): RidgeLiftBand {
  if (perpendicularMs >= RIDGE_LIFT_THRESHOLDS_MS.dangerous) return "dangerous";
  if (perpendicularMs >= RIDGE_LIFT_THRESHOLDS_MS.optimal) return "optimal";
  if (perpendicularMs >= RIDGE_LIFT_THRESHOLDS_MS.marginal) return "marginal";
  return "insufficient";
}
