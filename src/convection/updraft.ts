/**
 * Perfil vertical de la térmica: velocidad media, radio y velocidad de núcleo.
 *
 * **Lo que ve el piloto es el núcleo, no la media sobre la sección.** Con
 * `w* = 2.56 m/s` y `zi = 1401 m` —el caso medio de la tabla 1 de Allen— a
 * media capa la media es 0.91 m/s y el núcleo 2.09 m/s. Medir la altura crítica
 * contra la media declararía involable un día perfectamente normal.
 *
 * El máximo del núcleo sale **entre 0.92 y 1.12 · w\*** para `zi` de 800 a
 * 3500 m, decreciendo al crecer `zi` porque las capas profundas dan térmicas
 * más anchas y con el núcleo relativamente menos marcado. Es decir,
 * `max(w_peak) ≈ w*`, lo que reconcilia a Allen con DrJack: este último trata
 * `W*` directamente como la ascendencia de la que hay que restar el régimen de
 * caída del planeador. Las dos referencias, que parecían usar convenciones
 * distintas, describen lo mismo.
 */

import { m, mps } from "../units/branded.js";
import type { MPerS, Metres } from "../units/branded.js";

/** Altura relativa a la que la velocidad media se anula: 1/1.1. */
export const ZERO_CROSSING_RATIO = 1 / 1.1;

/** Radio exterior mínimo, en metros (Allen ec. 12). */
export const MIN_OUTER_RADIUS_M = 10;

export interface ProfilePoint {
  readonly zAglM: Metres;
  readonly meanMs: MPerS;
  readonly peakMs: MPerS;
  readonly radiusM: Metres;
}

/**
 * Velocidad media de ascenso dentro de la térmica.
 *
 *     w̄(z) = w* · (z/zi)^(1/3) · (1 − 1.1·z/zi)
 *
 * Máximo 0.4577·w* en z/zi = 0.2273; negativa por encima de z/zi = 0.9091.
 *
 * @source Allen, M. J. (2006), AIAA 2006-1510, ec. 11, tomada de
 *         Lenschow & Stephens (1980).
 */
export function updraftMeanAt(wStarMs: MPerS, zAglM: Metres, ziAglM: Metres): MPerS {
  if (ziAglM <= 0 || zAglM < 0) return mps(0);
  const x = zAglM / ziAglM;
  return mps(wStarMs * Math.cbrt(x) * (1 - 1.1 * x));
}

/**
 * Radio exterior de la térmica.
 *
 *     r2 = max( 10, 0.102·(z/zi)^(1/3)·(1 − 0.25·z/zi)·zi )
 *
 * @source Allen, M. J. (2006), AIAA 2006-1510, ec. 12, de Lenschow (1980).
 */
export function updraftOuterRadius(zAglM: Metres, ziAglM: Metres): Metres {
  if (ziAglM <= 0 || zAglM < 0) return m(MIN_OUTER_RADIUS_M);
  const x = zAglM / ziAglM;
  return m(Math.max(MIN_OUTER_RADIUS_M, 0.102 * Math.cbrt(x) * (1 - 0.25 * x) * ziAglM));
}

/**
 * Cociente entre radio interior y exterior del trapecio revuelto.
 *
 *     r1/r2 = 0.0011·r2 + 0.14   si r2 < 600 m;  0.8 en otro caso
 *
 * @source Allen, M. J. (2006), AIAA 2006-1510, ec. 13 (ajuste a Konovalov).
 */
export function innerRadiusRatio(outerRadiusM: Metres): number {
  return outerRadiusM < 600 ? 0.0011 * outerRadiusM + 0.14 : 0.8;
}

/**
 * Velocidad en el núcleo de la térmica, a partir de la media y de la geometría
 * del trapecio revuelto.
 *
 *     w_peak = 3·w̄·(r2³ − r2²·r1) / (r2³ − r1³) = 3·w̄·(1 − ρ)/(1 − ρ³)
 *
 * @source Allen, M. J. (2006), AIAA 2006-1510, ec. 14-15.
 */
export function updraftPeakAt(wStarMs: MPerS, zAglM: Metres, ziAglM: Metres): MPerS {
  const mean = updraftMeanAt(wStarMs, zAglM, ziAglM);
  const ratio = innerRadiusRatio(updraftOuterRadius(zAglM, ziAglM));
  return mps(3 * mean * ((1 - ratio) / (1 - Math.pow(ratio, 3))));
}

export interface ProfileOptions {
  readonly stepM?: Metres;
  /** Fracción de `zi` hasta la que se muestrea. Por defecto 1.0. */
  readonly topFrac?: number;
}

/**
 * Perfil muestreado, para gráfica y para búsquedas numéricas.
 *
 * @source Allen, M. J. (2006), AIAA 2006-1510, ec. 11-15.
 */
export function updraftProfile(
  wStarMs: MPerS,
  ziAglM: Metres,
  options: ProfileOptions = {},
): readonly ProfilePoint[] {
  const step = options.stepM ?? m(Math.max(5, ziAglM / 200));
  const top = ziAglM * (options.topFrac ?? 1);
  const heights: number[] = [];
  for (let z = 0; z < top - 1e-9; z += step) heights.push(z);
  heights.push(top);

  return heights.map((z) => {
    const zAglM = m(z);
    return {
      zAglM,
      meanMs: updraftMeanAt(wStarMs, zAglM, ziAglM),
      peakMs: updraftPeakAt(wStarMs, zAglM, ziAglM),
      radiusM: updraftOuterRadius(zAglM, ziAglM),
    } satisfies ProfilePoint;
  });
}
