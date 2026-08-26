/**
 * Daily soaring report data structures. See docs/SPEC.md §11.1.
 */

import type { Degrees, Kelvin, MPerS, Metres } from "../units/branded.js";
import type { Sounding, SoundingQuality, WindVector } from "../sounding/types.js";
import type { Site } from "../types/site.js";
import type { FluxSignConvention } from "../convection/heatFluxSign.js";
import type { HeatFluxSource } from "../convection/heatFlux.js";
import type { BuoyancyShearResult } from "../convection/buoyancyShear.js";
import type { CeilingResult } from "../clouds/ceiling.js";
import type { OverdevelopmentResult } from "../clouds/overdevelopment.js";
import type { CapeRisk } from "../stability/capeRisk.js";
import type { SoaringScore } from "../forecast/score.js";
import type { Confidence } from "../forecast/confidence.js";
import type { SoaringWindow } from "../forecast/windows.js";

/** An hourly input observation normalized to SI units. */
export interface HourlyObservation {
  readonly timeUtc: string;
  readonly sounding: Sounding;
  /** Raw model surface flux value before sign normalization. */
  readonly modelFluxWm2?: number | null;
  readonly fluxConvention?: FluxSignConvention;
  readonly capeJkg?: number | null;
  readonly convectiveInhibitionJkg?: number | null;
  /** Model-native `lifted_index`, preferred over computed fallback when present. */
  readonly modelLiftedIndex?: number | null;
  readonly boundaryLayerHeightAglM?: Metres | null;
  readonly soilMoistureFrac?: number;
  readonly midLevelHumidityFrac?: number;
}

export type LiftedIndexSource = "model" | "computed" | "unavailable";

export interface HourThermal {
  readonly wStarMs: MPerS;
  /**
   * Surface sensible heat flux, **positive upward** (W/m²).
   *
   * Normalized from model conventions (e.g. ICON down vs GFS up).
   * Origin documented in `HourQuality.heatFluxSource`.
   */
  readonly surfaceHeatFluxWm2: number;
  /** Surface net radiation (W/m²). */
  readonly netRadiationWm2: number;
  /**
   * Expected mean variometer climb rate across the working band
   * (from 10% depth up to critical height hcrit).
   */
  readonly meanClimbMs: MPerS;
  readonly hcritAglM: Metres | null;
  readonly thermalTopAglM: Metres;
  readonly mixedLayerTopAglM: Metres;
  readonly modelBlhAglM: Metres | null;
  readonly likelyShearDriven: boolean;
  readonly triggerTempK: Kelvin | null;
  readonly surfaceExcessK: number;
  readonly suppressedByWind: boolean;
}

export interface HourCloud {
  readonly baseAglM: Metres | null;
  readonly depthM: Metres | null;
  readonly blue: boolean;
  readonly overcast: boolean;
  readonly odRisk: OverdevelopmentResult;
}

export interface HourStability {
  readonly liftedIndex: number | null;
  readonly liftedIndexSource: LiftedIndexSource;
  readonly kIndex: number | null;
  /** Total Totals Index. Dimensionless index. */
  readonly totalTotalsIndex: number | null;
  readonly cape: CapeRisk;
}

export interface HourWind {
  readonly surfaceMs: MPerS;
  readonly surfaceFromDeg: Degrees;
  readonly blMean: WindVector;
  readonly blTop: WindVector;
  readonly shearMsPerKm: number;
  readonly bs: BuoyancyShearResult | null;
}

export interface HourQuality extends SoundingQuality {
  readonly heatFluxSource: HeatFluxSource;
  readonly heatFluxEstimated: readonly string[];
}

export interface SoaringHour {
  readonly timeUtc: string;
  /** Complete atmospheric sounding profile for Skew-T rendering and verification. */
  readonly sounding: Sounding;
  readonly thermal: HourThermal;
  readonly cloud: HourCloud;
  readonly stability: HourStability;
  readonly wind: HourWind;
  readonly ceiling: CeilingResult;
  readonly score: SoaringScore;
  readonly quality: HourQuality;
}

export interface SoaringDay {
  readonly site: Site;
  readonly dateLocal: string;
  readonly hours: readonly SoaringHour[];
  readonly best: SoaringHour | null;
  readonly windows: readonly SoaringWindow[];
  readonly sunriseUtc: string;
  readonly sunsetUtc: string;
  readonly confidence: Confidence | null;
  /** Open-Meteo CC BY 4.0 license attribution. */
  readonly attribution: string;
}
