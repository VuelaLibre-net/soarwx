/**
 * Surface sensible heat flux.
 *
 * Precedence order, always declared in the result:
 *
 * 1. **Model `sensible_heat_flux`**, with sign normalised. This is the highest
 *    fidelity input: computed from model surface schemes with real albedo,
 *    soil moisture, and land cover.
 * 2. **Energy balance reconstruction** when model flux is unavailable.
 *
 * Fixed fractions of global solar radiation are **never** used. At Fuentemilanos,
 * the actual midday ratio is 0.26 in ICON-EU and 0.46 in GFS: a constant
 * matches one only by coincidence, and varies by time of day, season,
 * soil moisture, and model physics.
 */

import { kgkg } from "../units/branded.js";
import type { Kelvin, Pascal, WPerM2 } from "../units/branded.js";
import { CP, RD } from "../units/constants.js";
import { mixingRatio, saturationVapourPressure } from "../thermo/saturation.js";
import { virtualTemperature } from "../thermo/potential.js";
import type { SurfaceType } from "../types/site.js";
import {
  DEFAULT_SURFACE_TYPE,
  SURFACE_DEFAULTS,
  bowenRatioFor,
} from "./surfaceDefaults.js";
import { normaliseUpwardFlux } from "./heatFluxSign.js";
import type { FluxSignConvention } from "./heatFluxSign.js";

/** Stefan-Boltzmann constant, W/(m²·K⁴). */
const STEFAN_BOLTZMANN = 5.670374419e-8;

/** Fraction of net radiation entering the ground (Stull percentage method). */
export const GROUND_FLUX_FRACTION = 0.1;

export type HeatFluxSource = "model" | "energy_balance";

export interface HeatFluxInput {
  readonly shortwaveDownWm2: WPerM2;
  readonly surfaceTempK: Kelvin;
  readonly surfaceDewpointK: Kelvin;
  readonly surfacePressurePa: Pascal;
  readonly cloudCoverFrac: number;
  /** Raw model value with unnormalised sign convention. */
  readonly modelFluxWm2?: number | null;
  readonly fluxConvention?: FluxSignConvention;
  readonly surfaceType?: SurfaceType;
  readonly albedoFrac?: number;
  readonly bowenRatio?: number;
  readonly soilMoistureFrac?: number;
  /** Net upward longwave radiation. If omitted, parameterised and declared. */
  readonly netLongwaveWm2?: number;
}

export interface HeatFluxResult {
  readonly netRadiationWm2: number;
  readonly groundFluxWm2: number;
  /** Sensible heat flux, **positive upward**. */
  readonly sensibleHeatWm2: number;
  /** Kinematic heat flux, QH = H/(ρ·cp), in K·m/s. */
  readonly kinematicHeatFluxKMs: number;
  /** Virtual heat flux, Qov = QH·(1 + 0.61·w), in K·m/s. Drives `w*`. */
  readonly virtualHeatFluxKMs: number;
  readonly bowenRatio: number;
  readonly albedoFrac: number;
  readonly airDensityKgM3: number;
  readonly source: HeatFluxSource;
  readonly estimated: readonly string[];
}

/**
 * Net upward surface longwave radiation, FAO-56 parameterisation adapted
 * with cloud cover fraction instead of clear-sky solar ratio.
 *
 *     Rnl = σ·T⁴·(0.34 − 0.14·√ea)·(1 − 0.9·cloudCover)
 *
 * @source Allen, R. G. et al. (1998), FAO Irrigation and Drainage Paper 56,
 *         eq. 39 (adapted for cloud cover fraction).
 */
export function netLongwaveUpWm2(
  tempK: Kelvin,
  dewpointK: Kelvin,
  cloudCoverFrac: number,
): number {
  const eaKPa = saturationVapourPressure(dewpointK) / 1000;
  const emissivity = 0.34 - 0.14 * Math.sqrt(Math.max(eaKPa, 0));
  const cloudFactor = 1 - 0.9 * Math.min(Math.max(cloudCoverFrac, 0), 1);
  return STEFAN_BOLTZMANN * Math.pow(tempK, 4) * emissivity * cloudFactor;
}

/**
 * Sensible heat flux, along with kinematic and virtual representations.
 *
 *     Rn = (1 − α)·SW↓ − Rnl
 *     G  = 0.1 · Rn                                      Stull
 *     H  = β/(1 + β) · (Rn − G)                           Allen eq. 2-3
 *     QH = H / (ρ·cp)                                     Allen eq. 4
 *     Qov= QH · (1 + 0.61·w)                              Allen eq. 5
 *
 * @source Allen, M. J. (2006), AIAA 2006-1510, eq. 2-5;
 *         Stull, Practical Meteorology, ch. 3 (ground flux).
 */
export function surfaceHeatFlux(input: HeatFluxInput): HeatFluxResult {
  const estimated: string[] = [];
  const type = input.surfaceType ?? DEFAULT_SURFACE_TYPE;
  const defaults = SURFACE_DEFAULTS[type];

  if (input.surfaceType === undefined) estimated.push("surface_type");

  const albedoFrac = input.albedoFrac ?? defaults.albedoFrac;
  if (input.albedoFrac === undefined) estimated.push("albedo");

  const netLongwave =
    input.netLongwaveWm2 ??
    netLongwaveUpWm2(input.surfaceTempK, input.surfaceDewpointK, input.cloudCoverFrac);
  if (input.netLongwaveWm2 === undefined) estimated.push("net_longwave");

  const netRadiationWm2 = (1 - albedoFrac) * input.shortwaveDownWm2 - netLongwave;
  const groundFluxWm2 = GROUND_FLUX_FRACTION * netRadiationWm2;

  const bowenRatio = input.bowenRatio ?? bowenRatioFor(type, input.soilMoistureFrac);
  if (input.bowenRatio === undefined) estimated.push("bowen_ratio");

  const w = mixingRatio(input.surfaceDewpointK, input.surfacePressurePa);
  const tv = virtualTemperature(input.surfaceTempK, w);
  const airDensityKgM3 = input.surfacePressurePa / (RD * tv);

  const modelFlux =
    input.modelFluxWm2 === undefined || input.modelFluxWm2 === null
      ? null
      : normaliseUpwardFlux(input.modelFluxWm2, input.fluxConvention ?? "unknown");

  const useModel = modelFlux !== null;
  const sensibleHeatWm2 = useModel
    ? modelFlux
    : (bowenRatio / (1 + bowenRatio)) * (netRadiationWm2 - groundFluxWm2);

  if (!useModel) estimated.push("sensible_heat_flux");

  const kinematicHeatFluxKMs = sensibleHeatWm2 / (airDensityKgM3 * CP);
  const virtualHeatFluxKMs = kinematicHeatFluxKMs * (1 + 0.61 * kgkg(w));

  return {
    netRadiationWm2,
    groundFluxWm2,
    sensibleHeatWm2,
    kinematicHeatFluxKMs,
    virtualHeatFluxKMs,
    bowenRatio: useModel ? impliedBowen(sensibleHeatWm2, netRadiationWm2) : bowenRatio,
    albedoFrac,
    airDensityKgM3,
    source: useModel ? "model" : "energy_balance",
    estimated: useModel ? estimated.filter((e) => e !== "bowen_ratio") : estimated,
  };
}

/**
 * Implied Bowen ratio from model sensible heat flux, allowing comparison
 * between fallback tables and actual model behavior.
 *
 * @source Bowen ratio definition; Stull, ch. 3.
 */
function impliedBowen(sensibleHeatWm2: number, netRadiationWm2: number): number {
  const available = netRadiationWm2 * (1 - GROUND_FLUX_FRACTION);
  const latent = available - sensibleHeatWm2;
  if (Math.abs(latent) < 1e-6) return Infinity;
  return sensibleHeatWm2 / latent;
}
