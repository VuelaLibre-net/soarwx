/**
 * Agregación del índice de vuelo.
 */

import { at } from "../types/array.js";
import type { Factor, FactorId } from "./factors.js";
import { FACTOR_OK_THRESHOLD } from "./factors.js";
import type { Veto } from "./vetoes.js";
import { vetoCap } from "./vetoes.js";

export type SoaringLevel = 1 | 2 | 3 | 4 | 5;

export interface SoaringScore {
  /** Media ponderada de los factores, en [0, 1]. */
  readonly value: number;
  readonly level: SoaringLevel;
  /** Nivel antes de aplicar los vetos, para poder ver cuánto han topado. */
  readonly levelBeforeVetoes: SoaringLevel;
  readonly factors: readonly Factor[];
  readonly vetoes: readonly Veto[];
  /** Factores por debajo del umbral, de peor a mejor. */
  readonly limitingFactors: readonly FactorId[];
}

/**
 * Umbrales de nivel sobre la puntuación agregada.
 * Cuatro cortes que separan los cinco niveles.
 */
export const DEFAULT_LEVEL_THRESHOLDS: readonly [number, number, number, number] = [
  0.3, 0.58, 0.78, 0.9,
];

/**
 * Índice de vuelo a partir de los factores y los vetos.
 *
 * El nivel 5 exige **todos** los factores cumplidos: una puntuación alta con un
 * factor flojo es un día muy bueno, no uno perfecto.
 *
 * @source R-10.1 a R-10.5 de docs/REQUIREMENTS.md.
 */
export function aggregate(
  factors: readonly Factor[],
  vetoes: readonly Veto[],
  thresholds: readonly [number, number, number, number] = DEFAULT_LEVEL_THRESHOLDS,
): SoaringScore {
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const value =
    totalWeight > 0
      ? factors.reduce((sum, f) => sum + f.score * f.weight, 0) / totalWeight
      : 0;

  let level = levelFor(value, thresholds);
  if (level === 5 && factors.some((f) => !f.ok)) level = 4;
  const levelBeforeVetoes = level;

  const cap = vetoCap(vetoes);
  const finalLevel: SoaringLevel = level < cap ? level : cap;

  const limitingFactors = factors
    .filter((f) => f.score < FACTOR_OK_THRESHOLD)
    .sort((a, b) => a.score - b.score)
    .map((f) => f.id);

  return {
    value,
    level: finalLevel,
    levelBeforeVetoes,
    factors,
    vetoes,
    limitingFactors,
  };
}

function levelFor(
  value: number,
  thresholds: readonly [number, number, number, number],
): SoaringLevel {
  if (value >= at(thresholds, 3)) return 5;
  if (value >= at(thresholds, 2)) return 4;
  if (value >= at(thresholds, 1)) return 3;
  if (value >= at(thresholds, 0)) return 2;
  return 1;
}
