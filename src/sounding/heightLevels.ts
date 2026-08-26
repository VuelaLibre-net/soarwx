/**
 * Niveles de altura sobre el terreno (80, 120, 180 m) como niveles del sondeo.
 *
 * En un emplazamiento a 1000 m la mitad de los niveles de presión cae bajo
 * tierra y el primero que sobrevive está a unos 60 m sobre el suelo: sin estos
 * niveles, los primeros cientos de metros del perfil son una recta entre dos
 * puntos, justo donde la capa superficial es superadiabática (R-1.1b).
 *
 * Open-Meteo sirve temperatura y viento a estas alturas, **pero no humedad ni
 * presión**, así que ambas hay que derivarlas.
 */

import { K, Pa, kgkg, m } from "../units/branded.js";
import type { Degrees, Kelvin, MPerS, Metres, Pascal } from "../units/branded.js";
import { G, RD } from "../units/constants.js";
import { dewpointFromMixingRatio, saturationMixingRatio } from "../thermo/saturation.js";
import { virtualTemperature } from "../thermo/potential.js";
import type { Level } from "./types.js";
import { at, consecutivePairs } from "../types/array.js";

export interface RawHeightLevel {
  readonly heightAglM: Metres;
  readonly tempK: Kelvin;
  readonly windSpeedMs: MPerS;
  readonly windFromDeg: Degrees;
}

/** Par (presión, altura) del que se deduce la relación p(z) del modelo. */
export interface PressureHeightPair {
  readonly pressurePa: Pascal;
  readonly geopotentialMslM: Metres;
}

/**
 * Presión a una altura sobre la superficie por la ecuación hipsométrica.
 *
 *     p(z) = p_sfc · exp( −g·Δz / (Rd·Tv_media) )
 *
 * Solo se usa como respaldo: la vía principal es
 * {@link pressureFromGeopotentialProfile}, que mantiene el perfil coherente con
 * la propia columna del modelo.
 *
 * @source Wallace & Hobbs, Atmospheric Science, ec. 3.23 (ecuación hipsométrica).
 */
export function pressureAtHeight(
  surfacePressurePa: Pascal,
  surfaceTempK: Kelvin,
  tempAtHeightK: Kelvin,
  mixingRatioKgKg: number,
  depthM: Metres,
): Pascal {
  const w = kgkg(mixingRatioKgKg);
  const tvMean =
    (virtualTemperature(surfaceTempK, w) + virtualTemperature(tempAtHeightK, w)) / 2;
  return Pa(surfacePressurePa * Math.exp((-G * depthM) / (RD * tvMean)));
}

/**
 * Presión a una altura, interpolando linealmente `ln(p)` frente a la altura
 * geopotencial **del propio modelo**.
 *
 * Esta es la vía principal, y no por elegancia. En Open-Meteo `surface_pressure`
 * está reescalado a la elevación pedida mientras que `geopotential_height_*hPa`
 * no lo está, y las dos familias no son mutuamente coherentes: medido en
 * Fuentemilanos, la presión de superficie cae 37 m por debajo de donde la
 * columna geopotencial la situaría. Derivar la presión de los niveles de altura
 * desde la de superficie produce un perfil **no monótono**, con un nivel de
 * 80 m por encima del suelo pero a más presión que el nivel de 900 hPa.
 *
 * @source Relación hidrostática log-lineal; ver docs/OPEN_METEO_INTEGRATION.md §4.
 */
export function pressureFromGeopotentialProfile(
  column: readonly PressureHeightPair[],
  targetMslM: Metres,
): Pascal | null {
  if (column.length < 2) return null;

  const sorted = [...column].sort((a, b) => a.geopotentialMslM - b.geopotentialMslM);
  let lower = at(sorted, 0);
  let upper = at(sorted, 1);

  for (const [a, b] of consecutivePairs(sorted)) {
    lower = a;
    upper = b;
    if (targetMslM <= b.geopotentialMslM) break;
  }

  const dz = upper.geopotentialMslM - lower.geopotentialMslM;
  if (dz === 0) return lower.pressurePa;
  const f = (targetMslM - lower.geopotentialMslM) / dz;
  return Pa(
    Math.exp(
      Math.log(lower.pressurePa) + f * Math.log(upper.pressurePa / lower.pressurePa),
    ),
  );
}

export interface HeightLevelContext {
  readonly surfacePressurePa: Pascal;
  readonly surfaceTempK: Kelvin;
  readonly surfaceMixingRatioKgKg: number;
  readonly elevationMslM: Metres;
  /** Columna de presión del modelo, ya podada de niveles bajo tierra. */
  readonly column: readonly PressureHeightPair[];
}

/**
 * Convierte niveles de altura en niveles del sondeo.
 *
 * El punto de rocío se deriva conservando la razón de mezcla de superficie, que
 * es lo correcto en una capa mezclada, saturándolo a la temperatura del nivel
 * para no producir un rocío imposible. Esa derivación es una **suposición** y
 * el sondeo la declara en `quality.estimated`.
 *
 * @source Conservación de la razón de mezcla en la capa mezclada (Stull, cap. 18).
 */
export function heightLevelsToLevels(
  context: HeightLevelContext,
  raw: readonly RawHeightLevel[],
): readonly Level[] {
  return raw.map((level) => {
    const geopotentialMslM = m(context.elevationMslM + level.heightAglM);
    const pressurePa =
      pressureFromGeopotentialProfile(context.column, geopotentialMslM) ??
      pressureAtHeight(
        context.surfacePressurePa,
        context.surfaceTempK,
        level.tempK,
        context.surfaceMixingRatioKgKg,
        level.heightAglM,
      );

    const wSat = saturationMixingRatio(level.tempK, pressurePa);
    const w = kgkg(Math.min(context.surfaceMixingRatioKgKg, wSat));
    return {
      pressurePa,
      geopotentialMslM,
      tempK: level.tempK,
      dewpointK: K(Math.min(dewpointFromMixingRatio(w, pressurePa), level.tempK)),
      windSpeedMs: level.windSpeedMs,
      windFromDeg: level.windFromDeg,
      source: "height_level",
    } satisfies Level;
  });
}
