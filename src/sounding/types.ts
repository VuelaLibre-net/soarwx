/**
 * Estructuras del sondeo vertical. Ver docs/SPEC.md §4.2.
 */

import type { Degrees, Kelvin, MPerS, Metres, Pascal, WPerM2 } from "../units/branded.js";
import type { Site } from "../types/site.js";

export type LevelSource = "surface" | "pressure_level" | "height_level" | "interpolated";

export interface Level {
  readonly pressurePa: Pascal;
  readonly geopotentialMslM: Metres;
  readonly tempK: Kelvin;
  readonly dewpointK: Kelvin;
  readonly windSpeedMs: MPerS;
  /** Dirección DE DONDE viene el viento. */
  readonly windFromDeg: Degrees;
  readonly cloudCoverFrac?: number;
  readonly source: LevelSource;
}

export interface SurfaceState {
  readonly tempK: Kelvin;
  readonly dewpointK: Kelvin;
  /** Presión de estación. **No** es el QNH. */
  readonly pressurePa: Pascal;
  /** Presión reducida al nivel del mar (QNH). Solo para altimetría. */
  readonly mslPressurePa: Pascal;
  readonly windSpeedMs: MPerS;
  readonly windFromDeg: Degrees;
  readonly windGustMs?: MPerS;
  readonly shortwaveWm2: WPerM2;
  readonly cloudCoverFrac: number;
  readonly cloudCoverLowFrac: number;
  readonly cloudCoverMidFrac: number;
  readonly cloudCoverHighFrac: number;
}

export interface SoundingQuality {
  /** Niveles de presión conservados por encima del terreno. */
  readonly pressureLevelsUsed: number;
  /** Niveles de presión descartados por caer bajo el terreno. */
  readonly levelsDiscardedBelowGround: number;
  /** Niveles de altura sobre el terreno incorporados. */
  readonly heightLevelsUsed: number;
  /** Total de niveles del sondeo, incluida la superficie. */
  readonly levelsUsed: number;
  /**
   * Mayor hueco vertical entre niveles consecutivos dentro de la ventana de
   * análisis. Un techo interpolado a través de un hueco grande no merece la
   * misma confianza que uno acotado de cerca (R-1.4b).
   */
  readonly maxVerticalGapM: Metres;
  readonly gapWindowTopAglM: Metres;
  /**
   * Separación entre la elevación declarada y la altura a la que la columna
   * geopotencial del modelo sitúa la presión de superficie. En Open-Meteo
   * `surface_pressure` está reescalado a la elevación pedida y
   * `geopotential_height_*hPa` no: son familias incoherentes entre sí. Se
   * declara, no se corrige.
   */
  readonly surfacePressureOffsetM: Metres;
  readonly missing: readonly string[];
  /** Magnitudes derivadas por suposición, no medidas. Nunca se presentan como medidas. */
  readonly estimated: readonly string[];
  readonly usable: boolean;
}

export interface Sounding {
  readonly site: Site;
  readonly timeUtc: string;
  readonly surface: SurfaceState;
  /** Ordenados por presión estrictamente descendente, todos sobre el terreno. */
  readonly levels: readonly Level[];
  readonly quality: SoundingQuality;
}

export interface WindVector {
  readonly speedMs: MPerS;
  readonly fromDeg: Degrees;
}
