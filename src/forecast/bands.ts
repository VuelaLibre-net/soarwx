/**
 * Piecewise-linear scoring band interpolation.
 *
 * A band defines where a parameter scores 1 (between `idealMin` and `idealMax`)
 * and where it scores 0 (below `zeroMin` or above `zeroMax`), with linear interpolation in between.
 */

export interface Band {
  readonly idealMin: number;
  readonly idealMax: number;
  readonly zeroMin: number;
  readonly zeroMax: number;
}

/**
 * Evaluates parameter score within specified band, normalized to [0, 1].
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
