/**
 * Vetos.
 *
 * **Los vetos topan, no restan** (R-10.3). Un cielo cerrado no quita medio
 * punto: impide que el día pase de nivel 1, por muy bien que puntúe todo lo
 * demás. Cada veto lleva su motivo y el nivel al que topa.
 *
 * Ningún factor premia lo que un veto castiga: la CAPE, el viento fuerte y la
 * estabilidad solo aparecen aquí.
 */

import type { CapeRisk } from "../stability/capeRisk.js";
import type { Metres } from "../units/branded.js";

export type VetoId =
  | "no_convection"
  | "overcast"
  | "ceiling_too_low"
  | "stable_atmosphere"
  | "cape_severe"
  | "cape_with_storm_index"
  | "wind_too_strong";

export type VetoLevel = 1 | 2 | 3;

export interface Veto {
  readonly id: VetoId;
  readonly capsAtLevel: VetoLevel;
  /** Clave de motivo. El texto para el piloto vive en `soarwx/i18n/es`. */
  readonly reason: VetoId;
}

/** Techo por debajo del cual el día no da para volar. */
export const UNUSABLE_CEILING_AGL_M = 800;
/** CAPE a partir de la cual el veto es severo, en J/kg. */
export const SEVERE_CAPE_JKG = 3500;
/** K-Index a partir del cual una CAPE alta se considera tormentosa. */
export const STORM_K_INDEX = 25;
/** Viento en superficie a partir del cual el día se topa, en m/s (25 nudos). */
export const STRONG_WIND_MS = 12.87;
/**
 * Techo por debajo del cual una atmósfera estable sí limita el día.
 *
 * Por encima de esta altura la capa convectiva da de sí bastante para trabajar
 * aunque no haya inestabilidad profunda, y el LI deja de ser información
 * limitante. Es una elección de calibración, declarada como S6 en `AUDIT.md`.
 */
export const CAPPED_CEILING_AGL_M = 1500;
/** LI por encima del cual la estabilidad es franca, no marginal. */
export const STRONGLY_STABLE_LI = 2;

export interface VetoInput {
  readonly hasConvection: boolean;
  readonly overcast: boolean;
  readonly usableCeilingAglM: Metres;
  readonly liftedIndex: number | null;
  readonly cape: CapeRisk;
  readonly kIndex: number | null;
  readonly surfaceWindMs: number;
}

/**
 * Vetos aplicables a una hora.
 *
 * Un índice ausente **no dispara veto**: `liftedIndex === null` significa que
 * no se pudo calcular, no que valga cero. El predecesor colapsaba ambos casos y
 * un LI ausente vetaba el día como «atmósfera estable».
 *
 * Un LI positivo **tampoco veta por sí solo**: describe la atmósfera por encima
 * de la capa límite, no dentro de ella (R-10.6).
 *
 * @source R-10.3, R-10.6 y R-7.2 de docs/REQUIREMENTS.md; bandas de CAPE de
 *         Glendening (DrJack).
 */
export function evaluateVetoes(input: VetoInput): readonly Veto[] {
  const vetoes: Veto[] = [];
  const add = (id: VetoId, capsAtLevel: VetoLevel): void => {
    vetoes.push({ id, capsAtLevel, reason: id });
  };

  if (!input.hasConvection) add("no_convection", 1);
  if (input.overcast) add("overcast", 1);
  if (input.usableCeilingAglM < UNUSABLE_CEILING_AGL_M) add("ceiling_too_low", 2);

  // El LI evalúa una parcela alzada a 500 hPa: mide si hay convección profunda
  // sobre la capa límite, no si la capa límite funciona. Una capa mezclada de
  // 3000 m con LI +1.6 es un día excelente, y vetarla era heredar el error del
  // predecesor. La estabilidad solo veta cuando además la capa convectiva se
  // queda corta, y entonces sí gradúa según lo franca que sea.
  if (
    input.liftedIndex !== null &&
    input.liftedIndex >= 0 &&
    input.usableCeilingAglM < CAPPED_CEILING_AGL_M
  ) {
    add("stable_atmosphere", input.liftedIndex > STRONGLY_STABLE_LI ? 2 : 3);
  }

  const capeJkg = input.cape.capeJkg;
  if (capeJkg !== null && capeJkg > SEVERE_CAPE_JKG) {
    add("cape_severe", 2);
  } else if (input.cape.stormPotential && (input.kIndex ?? -Infinity) > STORM_K_INDEX) {
    add("cape_with_storm_index", 2);
  }

  if (input.surfaceWindMs > STRONG_WIND_MS) add("wind_too_strong", 3);

  return vetoes;
}

/** Nivel máximo que permiten los vetos presentes. */
export function vetoCap(vetoes: readonly Veto[]): 1 | 2 | 3 | 4 | 5 {
  let cap: 1 | 2 | 3 | 4 | 5 = 5;
  for (const veto of vetoes) {
    if (veto.capsAtLevel < cap) cap = veto.capsAtLevel;
  }
  return cap;
}
