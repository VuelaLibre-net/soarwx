/**
 * English texts for pilots.
 *
 * The core returns numbers and enums — this module turns them into
 * readable English. The Spanish counterpart lives in `es.ts`.
 *
 * Uses glider pilot vocabulary, not meteorologist jargon.
 */

import type { FactorId } from "../forecast/factors.js";
import type { VetoId } from "../forecast/vetoes.js";
import type { SoaringLevel } from "../forecast/score.js";
import type { ConfidenceLevel } from "../forecast/confidence.js";
import type { CeilingLimit } from "../clouds/ceiling.js";
import type { OverdevelopmentLevel } from "../clouds/overdevelopment.js";
import type { CapeBand } from "../stability/capeRisk.js";
import type { LiftedIndexBand } from "../stability/indices.js";
import type { ThermalQuality } from "../convection/buoyancyShear.js";
import type { RidgeLiftBand } from "../orographic/ridgeLift.js";
import type { WaveMethod, WavePotential } from "../orographic/wave.js";
import type { StableLayerKind } from "../sounding/inversion.js";
import type { HeatFluxSource } from "../convection/heatFlux.js";
import type { LiftedIndexSource } from "../report/types.js";

const LEVELS: Readonly<Record<SoaringLevel, string>> = {
  1: "Unflyable",
  2: "Weak",
  3: "Usable",
  4: "Good",
  5: "Excellent",
};

const FACTORS: Readonly<Record<FactorId, string>> = {
  climb_strength: "Climb strength",
  usable_ceiling: "Usable ceiling",
  lapse_rate: "Lapse rate",
  thermal_quality: "Thermal quality",
  surface_wind: "Surface wind",
  moisture: "Moisture",
  cloud_cover: "Cloud cover",
};

const VETOES: Readonly<Record<VetoId, string>> = {
  no_convection: "No convection: thermals are not forming",
  overcast: "Overcast: cloud cover is killing convection",
  ceiling_too_low: "Ceiling too low to fly",
  stable_atmosphere: "Stable atmosphere above a shallow convective layer",
  cape_severe: "Severe convective energy: high storm risk",
  cape_with_storm_index: "High convective energy with stormy index",
  wind_too_strong: "Surface wind too strong",
};

const CEILING_LIMITS: Readonly<Record<CeilingLimit, string>> = {
  cloudbase: "limited by cloudbase",
  hcrit: "limited by thermal strength",
  boundary_layer: "limited by the top of the convective layer",
  overcast: "limited by overcast skies",
  no_convection: "no convection",
};

const THERMAL_QUALITY: Readonly<Record<ThermalQuality, string>> = {
  broken: "Thermals broken up by shear",
  tilted: "Thermals tilted by wind",
  organised: "Well-organised thermals",
};

const OVERDEVELOPMENT: Readonly<Record<OverdevelopmentLevel, string>> = {
  none: "No overdevelopment risk",
  low: "Low overdevelopment risk",
  moderate: "Moderate overdevelopment risk",
  high: "High overdevelopment risk",
  severe: "Overdevelopment very likely",
};

const CAPE_BANDS: Readonly<Record<CapeBand, string>> = {
  none: "No significant convective energy",
  weak: "Weak convective energy",
  moderate: "Moderate convective energy",
  strong: "Strong convective energy",
  extreme: "Extreme convective energy",
};

const LIFTED_INDEX: Readonly<Record<LiftedIndexBand, string>> = {
  stable: "Stable",
  marginally_unstable: "Marginally unstable",
  moderately_unstable: "Moderately unstable",
  very_unstable: "Very unstable",
  extremely_unstable: "Extremely unstable",
};

const CONFIDENCE: Readonly<Record<ConfidenceLevel, string>> = {
  low: "Low confidence: models disagree",
  medium: "Medium confidence",
  high: "High confidence: models agree",
};

const RIDGE_BANDS: Readonly<Record<RidgeLiftBand, string>> = {
  insufficient: "Wind too light for ridge soaring",
  marginal: "Marginal ridge conditions",
  optimal: "Ridge working well",
  dangerous: "Dangerous wind on the ridge",
};

const WAVE: Readonly<Record<WavePotential, string>> = {
  none: "No wave",
  marginal: "Marginal wave",
  likely: "Wave likely",
  strong: "Strong wave",
};

const WAVE_METHODS: Readonly<Record<WaveMethod, string>> = {
  scorer: "from Scorer parameter",
  heuristic: "estimated from wind, no usable profile",
};

const LAYERS: Readonly<Record<StableLayerKind, string>> = {
  inversion: "inversion",
  stable: "stable layer",
  isothermal: "isothermal layer",
};

const HEAT_FLUX_SOURCES: Readonly<Record<HeatFluxSource, string>> = {
  model: "heat flux from the model",
  energy_balance: "heat flux reconstructed from energy balance",
};

const LIFTED_INDEX_SOURCES: Readonly<Record<LiftedIndexSource, string>> = {
  model: "lifted index from the model",
  computed: "lifted index computed from the sounding",
  unavailable: "lifted index not available",
};

export const describeLevel = (level: SoaringLevel): string => LEVELS[level];
export const describeFactor = (id: FactorId): string => FACTORS[id];
export const describeVeto = (id: VetoId): string => VETOES[id];
export const describeCeilingLimit = (limit: CeilingLimit): string =>
  CEILING_LIMITS[limit];
export const describeThermalQuality = (q: ThermalQuality): string => THERMAL_QUALITY[q];
export const describeOverdevelopment = (l: OverdevelopmentLevel): string =>
  OVERDEVELOPMENT[l];
export const describeCapeBand = (band: CapeBand): string => CAPE_BANDS[band];
export const describeLiftedIndex = (band: LiftedIndexBand): string => LIFTED_INDEX[band];
export const describeConfidence = (level: ConfidenceLevel): string => CONFIDENCE[level];
export const describeRidgeLift = (band: RidgeLiftBand): string => RIDGE_BANDS[band];
export const describeWave = (potential: WavePotential): string => WAVE[potential];
export const describeWaveMethod = (method: WaveMethod): string => WAVE_METHODS[method];
export const describeLayer = (kind: StableLayerKind): string => LAYERS[kind];
export const describeHeatFluxSource = (source: HeatFluxSource): string =>
  HEAT_FLUX_SOURCES[source];
export const describeLiftedIndexSource = (source: LiftedIndexSource): string =>
  LIFTED_INDEX_SOURCES[source];

/** Site-local date and time, formatted in English. */
export function formatInstant(iso: string, timezone: string): string {
  const date = new Date(iso.length <= 16 ? `${iso}:00Z` : iso);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Local time only, for compact labels. */
export function formatHour(iso: string, timezone: string): string {
  const date = new Date(iso.length <= 16 ? `${iso}:00Z` : iso);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Disclaimer the consumer must display alongside any forecast. */
export const DISCLAIMER =
  "Advisory forecast only. This does not replace an official weather briefing or the pilot in command's judgment.";
