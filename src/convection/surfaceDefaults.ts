/**
 * Surface default values: albedo, Bowen ratio, and aerodynamic roughness length.
 *
 * Only used when the model does not provide `sensible_heat_flux`. **Open-Meteo's `albedo`
 * arrives null across all tested models**, making this fallback table essential.
 *
 * These represent standard textbook values: energy-balance heat flux reconstruction
 * is a fallback path rather than primary, and its uncertainty is explicitly declared
 * in `HeatFluxResult.estimated`.
 */

import { m } from "../units/branded.js";
import type { Metres } from "../units/branded.js";
import type { SurfaceType } from "../types/site.js";

export interface SurfaceDefaults {
  readonly albedoFrac: number;
  /** Bowen ratio for wet soil. */
  readonly bowenWetRatio: number;
  /** Bowen ratio for dry soil. */
  readonly bowenDryRatio: number;
  readonly roughnessLengthM: Metres;
}

/**
 * @source Stull, Practical Meteorology, ch. 3 (Bowen ratio by land cover) and
 *         ch. 18 (roughness length); standard handbook albedos.
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

/** Default surface type when site metadata leaves it unspecified. */
export const DEFAULT_SURFACE_TYPE: SurfaceType = "cropland";

/**
 * Bowen ratio linearly interpolated between dry and wet soil moisture conditions.
 *
 * Soil moisture is supplied as a 0..1 fraction of volumetric content relative
 * to reference saturation. This is a **rough** parameterisation and explicitly
 * flagged as such: the primary method relies on model-provided heat flux.
 *
 * @source Stull, Practical Meteorology, ch. 3.
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
