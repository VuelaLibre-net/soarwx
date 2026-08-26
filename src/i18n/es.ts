/**
 * Textos en español para pilotos.
 *
 * **El núcleo devuelve números y enums; aquí se traducen.** El predecesor
 * incrustaba marcado de presentación dentro de los valores de retorno
 * (`"[green]Bajo[/green]"`), lo que obligó a escribir después una función para
 * limpiarlo al exportar a PDF. El acoplamiento se paga dos veces.
 *
 * El vocabulario es el del piloto de planeador, no el del meteorólogo.
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
  1: "No volable",
  2: "Flojo",
  3: "Aprovechable",
  4: "Bueno",
  5: "Excelente",
};

const FACTORS: Readonly<Record<FactorId, string>> = {
  climb_strength: "Fuerza de la ascendencia",
  usable_ceiling: "Techo utilizable",
  lapse_rate: "Gradiente térmico",
  thermal_quality: "Calidad de la térmica",
  surface_wind: "Viento en superficie",
  moisture: "Humedad",
  cloud_cover: "Nubosidad",
};

const VETOES: Readonly<Record<VetoId, string>> = {
  no_convection: "Sin convección: no hay térmicas",
  overcast: "Cielo cerrado: la nubosidad corta la convección",
  ceiling_too_low: "Techo demasiado bajo para volar",
  stable_atmosphere: "Atmósfera estable sobre una capa convectiva corta",
  cape_severe: "Energía convectiva severa: riesgo de tormenta fuerte",
  cape_with_storm_index: "Energía convectiva alta con índice tormentoso",
  wind_too_strong: "Viento demasiado fuerte en superficie",
};

const CEILING_LIMITS: Readonly<Record<CeilingLimit, string>> = {
  cloudbase: "lo limita la base de las nubes",
  hcrit: "lo limita la fuerza de la térmica",
  boundary_layer: "lo limita el techo de la capa convectiva",
  overcast: "lo limita el cielo cerrado",
  no_convection: "no hay convección",
};

const THERMAL_QUALITY: Readonly<Record<ThermalQuality, string>> = {
  broken: "Térmicas rotas por la cizalladura",
  tilted: "Térmicas inclinadas por el viento",
  organised: "Térmicas organizadas",
};

const OVERDEVELOPMENT: Readonly<Record<OverdevelopmentLevel, string>> = {
  none: "Sin riesgo de sobredesarrollo",
  low: "Riesgo bajo de sobredesarrollo",
  moderate: "Riesgo moderado de sobredesarrollo",
  high: "Riesgo alto de sobredesarrollo",
  severe: "Sobredesarrollo muy probable",
};

const CAPE_BANDS: Readonly<Record<CapeBand, string>> = {
  none: "Sin energía convectiva reseñable",
  weak: "Energía convectiva débil",
  moderate: "Energía convectiva moderada",
  strong: "Energía convectiva fuerte",
  extreme: "Energía convectiva extrema",
};

const LIFTED_INDEX: Readonly<Record<LiftedIndexBand, string>> = {
  stable: "Estable",
  marginally_unstable: "Apenas inestable",
  moderately_unstable: "Moderadamente inestable",
  very_unstable: "Muy inestable",
  extremely_unstable: "Extremadamente inestable",
};

const CONFIDENCE: Readonly<Record<ConfidenceLevel, string>> = {
  low: "Confianza baja: los modelos discrepan",
  medium: "Confianza media",
  high: "Confianza alta: los modelos concuerdan",
};

const RIDGE_BANDS: Readonly<Record<RidgeLiftBand, string>> = {
  insufficient: "Viento insuficiente para la ladera",
  marginal: "Ladera marginal",
  optimal: "Ladera en su punto",
  dangerous: "Viento peligroso en la ladera",
};

const WAVE: Readonly<Record<WavePotential, string>> = {
  none: "Sin onda",
  marginal: "Onda marginal",
  likely: "Onda probable",
  strong: "Onda marcada",
};

const WAVE_METHODS: Readonly<Record<WaveMethod, string>> = {
  scorer: "por parámetro de Scorer",
  heuristic: "por estimación de viento, sin perfil utilizable",
};

const LAYERS: Readonly<Record<StableLayerKind, string>> = {
  inversion: "inversión",
  stable: "capa estable",
  isothermal: "capa isoterma",
};

const HEAT_FLUX_SOURCES: Readonly<Record<HeatFluxSource, string>> = {
  model: "flujo de calor del modelo",
  energy_balance: "flujo de calor reconstruido por balance energético",
};

const LIFTED_INDEX_SOURCES: Readonly<Record<LiftedIndexSource, string>> = {
  model: "índice de elevación del modelo",
  computed: "índice de elevación calculado a partir del sondeo",
  unavailable: "índice de elevación no disponible",
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

/** Fecha y hora en la zona del emplazamiento, en formato español. */
export function formatInstant(iso: string, timezone: string): string {
  const date = new Date(iso.length <= 16 ? `${iso}:00Z` : iso);
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone,
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Solo la hora local, para rótulos compactos. */
export function formatHour(iso: string, timezone: string): string {
  const date = new Date(iso.length <= 16 ? `${iso}:00Z` : iso);
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Aviso que el consumidor debe mostrar junto a cualquier previsión. */
export const DISCLAIMER =
  "Previsión orientativa. No sustituye al briefing meteorológico oficial ni a la decisión del piloto al mando.";
