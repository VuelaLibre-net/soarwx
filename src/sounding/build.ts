/**
 * Ensamblado y validación del sondeo.
 *
 * La responsabilidad crítica es **descartar los niveles bajo tierra**: en
 * Fuentemilanos (1001 m) los de 1000, 975, 950 y 925 hPa están por debajo del
 * suelo y sus valores son extrapolaciones sin significado físico — el de
 * 1000 hPa marcaba 38 °C a 136 m de altura geopotencial.
 */

import { m } from "../units/branded.js";
import type { Degrees, Kelvin, MPerS, Metres, Pascal } from "../units/branded.js";
import { err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import type { Site } from "../types/site.js";
import type { Level, Sounding, SoundingQuality, SurfaceState } from "./types.js";
import { heightLevelsToLevels } from "./heightLevels.js";
import type { RawHeightLevel } from "./heightLevels.js";
import { mixingRatio } from "../thermo/saturation.js";
import { at, consecutivePairs } from "../types/array.js";

export interface RawPressureLevel {
  readonly pressurePa: Pascal;
  readonly geopotentialMslM: Metres;
  readonly tempK: Kelvin;
  readonly dewpointK: Kelvin;
  readonly windSpeedMs: MPerS;
  readonly windFromDeg: Degrees;
  readonly cloudCoverFrac?: number;
}

export interface BuildOptions {
  /** Mínimo de niveles de presión sobre el terreno. Por defecto 3 (R-1.4). */
  readonly minPressureLevels?: number;
  /** Altura sobre el terreno hasta la que se mide el hueco vertical. Por defecto 4000 m. */
  readonly gapWindowTopAglM?: Metres;
}

export interface SoundingInput {
  readonly site: Site;
  readonly timeUtc: string;
  readonly surface: SurfaceState;
  readonly pressureLevels: readonly RawPressureLevel[];
  readonly heightLevels?: readonly RawHeightLevel[];
  readonly missing?: readonly string[];
  readonly options?: BuildOptions;
}

const DEFAULT_MIN_PRESSURE_LEVELS = 3;
/**
 * Techo por defecto de la ventana en la que se mide el hueco vertical. 3500 m
 * sobre el terreno cubre con holgura la capa límite de un día fuerte en la
 * meseta; por encima, los huecos son de atmósfera libre y no condicionan el
 * techo térmico.
 */
const DEFAULT_GAP_WINDOW_TOP_AGL_M = m(3500);

/**
 * Ensambla el sondeo: superficie, niveles de altura y niveles de presión, en
 * orden de presión estrictamente descendente y sin nada bajo tierra.
 *
 * @source R-1.1 a R-1.5 de docs/REQUIREMENTS.md.
 */
export function buildSounding(input: SoundingInput): Result<Sounding> {
  const { site, surface, pressureLevels } = input;
  const minLevels = input.options?.minPressureLevels ?? DEFAULT_MIN_PRESSURE_LEVELS;
  const gapWindowTopAglM =
    input.options?.gapWindowTopAglM ?? DEFAULT_GAP_WINDOW_TOP_AGL_M;

  const aboveGround = pressureLevels.filter(
    (l) => l.geopotentialMslM > site.elevationMslM && l.pressurePa < surface.pressurePa,
  );
  const discarded = pressureLevels.length - aboveGround.length;

  const column = aboveGround.map((l) => ({
    pressurePa: l.pressurePa,
    geopotentialMslM: l.geopotentialMslM,
  }));

  const heightLevels = heightLevelsToLevels(
    {
      surfacePressurePa: surface.pressurePa,
      surfaceTempK: surface.tempK,
      surfaceMixingRatioKgKg: mixingRatio(surface.dewpointK, surface.pressurePa),
      elevationMslM: site.elevationMslM,
      column,
    },
    input.heightLevels ?? [],
  );

  // Cuánto se separa la presión de superficie de donde la situaría la columna
  // geopotencial del modelo. En Open-Meteo `surface_pressure` está reescalado a
  // la elevación pedida y `geopotential_height_*hPa` no: medido en
  // Fuentemilanos, la diferencia es de unos 37 m. Se declara, no se corrige.
  const surfacePressureOffsetM = geopotentialOffset(
    column,
    surface.pressurePa,
    site.elevationMslM,
  );

  const surfaceLevel: Level = {
    pressurePa: surface.pressurePa,
    geopotentialMslM: site.elevationMslM,
    tempK: surface.tempK,
    dewpointK: surface.dewpointK,
    windSpeedMs: surface.windSpeedMs,
    windFromDeg: surface.windFromDeg,
    cloudCoverFrac: surface.cloudCoverFrac,
    source: "surface",
  };

  const levels: Level[] = [
    surfaceLevel,
    ...heightLevels,
    ...aboveGround.map((l): Level => ({
      pressurePa: l.pressurePa,
      geopotentialMslM: l.geopotentialMslM,
      tempK: l.tempK,
      dewpointK: l.dewpointK,
      windSpeedMs: l.windSpeedMs,
      windFromDeg: l.windFromDeg,
      ...(l.cloudCoverFrac === undefined ? {} : { cloudCoverFrac: l.cloudCoverFrac }),
      source: "pressure_level",
    })),
  ].sort((a, b) => b.pressurePa - a.pressurePa);

  const estimated: string[] = [];
  if (heightLevels.length > 0) {
    estimated.push("height_level_dewpoint");
    estimated.push("height_level_pressure");
  }

  const quality: SoundingQuality = {
    pressureLevelsUsed: aboveGround.length,
    levelsDiscardedBelowGround: discarded,
    heightLevelsUsed: heightLevels.length,
    levelsUsed: levels.length,
    maxVerticalGapM: maxGapBelowLevels(levels, m(site.elevationMslM + gapWindowTopAglM)),
    gapWindowTopAglM,
    surfacePressureOffsetM,
    missing: input.missing ?? [],
    estimated,
    usable: aboveGround.length >= minLevels,
  };

  if (!quality.usable) {
    return err(
      "INSUFFICIENT_LEVELS",
      `only ${String(aboveGround.length)} pressure levels above ground, need ${String(minLevels)}`,
      { quality },
    );
  }

  return ok({ site, timeUtc: input.timeUtc, surface, levels, quality });
}

/**
 * Mayor separación vertical entre niveles consecutivos por debajo de un techo.
 *
 * El hueco que cruza el techo se recorta en él: interesa la resolución dentro
 * de la ventana, no la de la atmósfera libre que queda encima.
 *
 * `quality.maxVerticalGapM` usa una ventana por defecto porque al ensamblar el
 * sondeo todavía no se conoce la altura de la capa límite. Cuando sí se
 * conoce, la fase de convección vuelve a llamar aquí con el techo real: un
 * techo interpolado a través de un hueco grande no merece la misma confianza
 * que uno acotado de cerca (R-1.4b).
 *
 * @source R-1.4b de docs/REQUIREMENTS.md.
 */
export function maxGapBelow(sounding: Sounding, topMslM: Metres): Metres {
  return maxGapBelowLevels(sounding.levels, topMslM);
}

function maxGapBelowLevels(levels: readonly Level[], topMslM: Metres): Metres {
  let worst = 0;
  for (const [lower, upper] of consecutivePairs(levels)) {
    if (lower.geopotentialMslM >= topMslM) break;
    const top = Math.min(upper.geopotentialMslM, topMslM);
    worst = Math.max(worst, top - lower.geopotentialMslM);
  }
  return m(worst);
}

/**
 * Diferencia entre la elevación declarada del emplazamiento y la altura a la
 * que la columna geopotencial del modelo sitúa la presión de superficie.
 *
 * Positiva significa que la presión de superficie corresponde a un punto más
 * bajo que la elevación declarada.
 *
 * @source docs/OPEN_METEO_INTEGRATION.md §4 (incoherencia medida entre
 *         `surface_pressure` reescalado y `geopotential_height_*hPa`).
 */
function geopotentialOffset(
  column: readonly { pressurePa: Pascal; geopotentialMslM: Metres }[],
  surfacePressurePa: Pascal,
  elevationMslM: Metres,
): Metres {
  if (column.length < 2) return m(0);
  const sorted = [...column].sort((a, b) => b.pressurePa - a.pressurePa);
  const a = at(sorted, 0);
  const b = at(sorted, 1);
  const span = Math.log(b.pressurePa / a.pressurePa);
  if (span === 0) return m(0);
  const f = Math.log(surfacePressurePa / a.pressurePa) / span;
  const implied = a.geopotentialMslM + f * (b.geopotentialMslM - a.geopotentialMslM);
  return m(elevationMslM - implied);
}
