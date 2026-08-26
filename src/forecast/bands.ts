/**
 * Puntuación por bandas.
 *
 * Una banda define dónde un factor vale 1 (entre `idealMin` e `idealMax`) y
 * dónde vale 0 (por debajo de `zeroMin` o por encima de `zeroMax`), con rampa
 * lineal entre medias.
 */

export interface Band {
  readonly idealMin: number;
  readonly idealMax: number;
  readonly zeroMin: number;
  readonly zeroMax: number;
}

/**
 * Puntuación de un valor dentro de su banda, en el intervalo [0, 1].
 *
 * @source Versión pura del criterio de bandas del predecesor
 *         (`calculations.py:686-694`), sin marcado ni efectos.
 */
export function scoreBand(value: number, band: Band): number {
  if (value >= band.idealMin && value <= band.idealMax) return 1;
  if (value < band.idealMin) {
    if (value <= band.zeroMin) return 0;
    return (value - band.zeroMin) / (band.idealMin - band.zeroMin);
  }
  if (value >= band.zeroMax) return 0;
  return (band.zeroMax - value) / (band.zeroMax - band.idealMax);
}
