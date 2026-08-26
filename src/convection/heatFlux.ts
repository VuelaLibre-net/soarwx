/**
 * Flujo de calor sensible en superficie.
 *
 * Orden de preferencia, siempre declarado en el resultado:
 *
 * 1. **`sensible_heat_flux` del modelo**, con el signo normalizado. Es el mejor
 *    dato disponible: sale del esquema de superficie del modelo, con su albedo,
 *    su humedad de suelo y su tipo de terreno reales.
 * 2. **Reconstrucción por balance energético** cuando el modelo no lo sirve.
 *
 * Lo que **no** se hace es tomar una fracción fija de la radiación global. En
 * Fuentemilanos, el cociente real al mediodía es 0.26 en ICON-EU y 0.46 en GFS:
 * una constante acierta con uno por casualidad y falla con el otro, y en
 * cualquier caso varía con la hora, la estación, la humedad del suelo y el
 * modelo.
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

/** Constante de Stefan-Boltzmann, W/(m²·K⁴). */
const STEFAN_BOLTZMANN = 5.670374419e-8;

/** Fracción de la radiación neta que se va al suelo (Stull, método del porcentaje). */
export const GROUND_FLUX_FRACTION = 0.1;

export type HeatFluxSource = "model" | "energy_balance";

export interface HeatFluxInput {
  readonly shortwaveDownWm2: WPerM2;
  readonly surfaceTempK: Kelvin;
  readonly surfaceDewpointK: Kelvin;
  readonly surfacePressurePa: Pascal;
  readonly cloudCoverFrac: number;
  /** Valor crudo del modelo, con su signo sin normalizar. */
  readonly modelFluxWm2?: number | null;
  readonly fluxConvention?: FluxSignConvention;
  readonly surfaceType?: SurfaceType;
  readonly albedoFrac?: number;
  readonly bowenRatio?: number;
  readonly soilMoistureFrac?: number;
  /** Onda larga neta ascendente. Si falta, se parametriza y se declara. */
  readonly netLongwaveWm2?: number;
}

export interface HeatFluxResult {
  readonly netRadiationWm2: number;
  readonly groundFluxWm2: number;
  /** Flujo de calor sensible, **positivo hacia arriba**. */
  readonly sensibleHeatWm2: number;
  /** Flujo cinemático, QH = H/(ρ·cp), en K·m/s. */
  readonly kinematicHeatFluxKMs: number;
  /** Flujo virtual, Qov = QH·(1 + 0.61·w), en K·m/s. Es el que alimenta `w*`. */
  readonly virtualHeatFluxKMs: number;
  readonly bowenRatio: number;
  readonly albedoFrac: number;
  readonly airDensityKgM3: number;
  readonly source: HeatFluxSource;
  readonly estimated: readonly string[];
}

/**
 * Onda larga neta ascendente en superficie, parametrización de FAO-56 con la
 * nubosidad en lugar del cociente de radiación medida frente a cielo claro.
 *
 *     Rnl = σ·T⁴·(0.34 − 0.14·√ea)·(1 − 0.9·nubosidad)
 *
 * @source Allen, R. G. et al. (1998), FAO Irrigation and Drainage Paper 56,
 *         ec. 39 (adaptada para usar cobertura nubosa).
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
 * Flujo de calor sensible y su forma cinemática y virtual.
 *
 *     Rn = (1 − α)·SW↓ − Rnl
 *     G  = 0.1 · Rn                                      Stull
 *     H  = β/(1 + β) · (Rn − G)                           Allen ec. 2-3
 *     QH = H / (ρ·cp)                                     Allen ec. 4
 *     Qov= QH · (1 + 0.61·w)                              Allen ec. 5
 *
 * @source Allen, M. J. (2006), AIAA 2006-1510, ec. 2-5;
 *         Stull, Practical Meteorology, cap. 3 (flujo al suelo).
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
 * Razón de Bowen implícita en el flujo que da el modelo, para poder contrastar
 * la tabla de respaldo contra lo que el modelo realmente hace.
 *
 * @source Definición de la razón de Bowen; Stull, cap. 3.
 */
function impliedBowen(sensibleHeatWm2: number, netRadiationWm2: number): number {
  const available = netRadiationWm2 * (1 - GROUND_FLUX_FRACTION);
  const latent = available - sensibleHeatWm2;
  if (Math.abs(latent) < 1e-6) return Infinity;
  return sensibleHeatWm2 / latent;
}
