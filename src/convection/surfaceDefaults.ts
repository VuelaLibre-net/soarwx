/**
 * Valores por defecto de superficie: albedo, razón de Bowen y rugosidad.
 *
 * Solo se usan cuando el modelo no sirve `sensible_heat_flux`. **El `albedo` de
 * Open-Meteo llega nulo en todos los modelos probados**, así que esta tabla no
 * es opcional.
 *
 * Son valores orientativos de manual: la reconstrucción del flujo de calor por
 * balance energético es un respaldo, no la vía principal, y su incertidumbre se
 * declara en `HeatFluxResult.estimated`.
 */

import { m } from "../units/branded.js";
import type { Metres } from "../units/branded.js";
import type { SurfaceType } from "../types/site.js";

export interface SurfaceDefaults {
  readonly albedoFrac: number;
  /** Razón de Bowen con suelo húmedo. */
  readonly bowenWetRatio: number;
  /** Razón de Bowen con suelo seco. */
  readonly bowenDryRatio: number;
  readonly roughnessLengthM: Metres;
}

/**
 * @source Stull, Practical Meteorology, cap. 3 (razón de Bowen por terreno) y
 *         cap. 18 (longitud de rugosidad); albedos de manual.
 */
export const SURFACE_DEFAULTS: Readonly<Record<SurfaceType, SurfaceDefaults>> = {
  cropland: {
    albedoFrac: 0.2,
    bowenWetRatio: 0.3,
    bowenDryRatio: 3.0,
    roughnessLengthM: m(0.1),
  },
  forest: {
    albedoFrac: 0.12,
    bowenWetRatio: 0.4,
    bowenDryRatio: 1.5,
    roughnessLengthM: m(1.0),
  },
  grass: {
    albedoFrac: 0.2,
    bowenWetRatio: 0.4,
    bowenDryRatio: 2.5,
    roughnessLengthM: m(0.03),
  },
  arid: {
    albedoFrac: 0.3,
    bowenWetRatio: 2.0,
    bowenDryRatio: 10.0,
    roughnessLengthM: m(0.05),
  },
  urban: {
    albedoFrac: 0.15,
    bowenWetRatio: 1.0,
    bowenDryRatio: 3.0,
    roughnessLengthM: m(1.0),
  },
  water: {
    albedoFrac: 0.08,
    bowenWetRatio: 0.1,
    bowenDryRatio: 0.1,
    roughnessLengthM: m(0.0002),
  },
  snow: {
    albedoFrac: 0.7,
    bowenWetRatio: 0.5,
    bowenDryRatio: 0.5,
    roughnessLengthM: m(0.005),
  },
};

/** Terreno supuesto cuando el emplazamiento no lo declara. */
export const DEFAULT_SURFACE_TYPE: SurfaceType = "cropland";

/**
 * Razón de Bowen interpolada entre suelo seco y húmedo.
 *
 * La humedad de suelo entra como fracción 0..1 del contenido volumétrico
 * respecto a un valor de referencia. Es una parametrización **gruesa** y así se
 * declara: la vía correcta es que el modelo sirva el flujo ya calculado.
 *
 * @source Stull, Practical Meteorology, cap. 3.
 */
export function bowenRatioFor(type: SurfaceType, soilMoistureFrac?: number): number {
  const defaults = SURFACE_DEFAULTS[type];
  if (soilMoistureFrac === undefined)
    return (defaults.bowenWetRatio + defaults.bowenDryRatio) / 2;
  const wetness = Math.min(Math.max(soilMoistureFrac, 0), 1);
  return (
    defaults.bowenDryRatio + (defaults.bowenWetRatio - defaults.bowenDryRatio) * wetness
  );
}
