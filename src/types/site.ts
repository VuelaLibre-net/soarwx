/**
 * Emplazamiento y relieve. Ver docs/SPEC.md §4.1.
 *
 * El relieve entra como dato, nunca incrustado en la física: no hay ninguna
 * sierra con nombre en el código (R-8.1 de docs/REQUIREMENTS.md).
 */

import type { Degrees, Metres } from "../units/branded.js";

export type SurfaceType =
  "cropland" | "forest" | "grass" | "arid" | "urban" | "water" | "snow";

/**
 * Terreno del emplazamiento. Solo se usa para reconstruir el flujo de calor
 * cuando el modelo no lo sirve; con flujo del modelo no interviene.
 */
export interface SurfaceSpec {
  readonly albedoFrac?: number;
  readonly bowenRatio?: number;
  readonly roughnessLengthM?: Metres;
  readonly type?: SurfaceType;
}

/**
 * Geometría de una cresta, como dato. Ningún emplazamiento está codificado en
 * la librería: el consumidor aporta el relieve que quiere evaluar.
 */
export interface RidgeSpec {
  readonly name: string;
  /** Rumbo de la cresta, 0..180. */
  readonly bearingDeg: Degrees;
  /** Pendiente media de la cara expuesta. */
  readonly slopeDeg: Degrees;
  readonly crestMslM: Metres;
  readonly lengthM?: Metres;
}

/**
 * Emplazamiento a evaluar. `elevationMslM` y `timezone` son obligatorias: la
 * primera ancla el AGL y decide qué niveles caen bajo tierra, la segunda evita
 * que el «día» pedido empiece a las 02:00 locales.
 */
export interface Site {
  readonly latDeg: number;
  readonly lonDeg: number;
  /**
   * Obligatoria. Ancla AGL y MSL, y se envía a Open-Meteo: sin ella el
   * downscaling se hace contra la elevación de la celda, no la del aeródromo.
   */
  readonly elevationMslM: Metres;
  /** Zona horaria IANA. Nunca UTC cuando se pide un día local (R-13.4). */
  readonly timezone: string;
  readonly name?: string;
  readonly icao?: string;
  readonly ridges?: readonly RidgeSpec[];
  readonly surface?: SurfaceSpec;
}
