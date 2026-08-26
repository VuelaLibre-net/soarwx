/**
 * Model capabilities verified against live Open-Meteo APIs.
 */

export type OpenMeteoModel =
  | "icon_eu"
  | "icon_global"
  | "icon_seamless"
  | "gfs_seamless"
  | "gfs_global"
  | "ukmo_seamless"
  | "meteofrance_arpege_europe"
  | "ecmwf_ifs"
  | "ecmwf_ifs025";

export type Coverage = "global" | "europe";

export interface ModelCapabilities {
  readonly id: OpenMeteoModel;
  readonly pressureLevelsHpa: readonly number[];
  readonly heightLevelsM: readonly number[];
  readonly hasSensibleHeatFlux: boolean;
  readonly hasBoundaryLayerHeight: boolean;
  readonly hasLiftedIndex: boolean;
  readonly hasConvectiveInhibition: boolean;
  readonly resolutionKm: number;
  readonly updateIntervalHours: number;
  readonly coverage: Coverage;
  /** Ranking order: lower values indicate higher preference. */
  readonly rank: number;
}

const FULL_LEVELS = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500] as const;
const ARPEGE_LEVELS = [1000, 950, 925, 900, 850, 800, 700, 600, 500] as const;

/**
 * Model capability catalog verified against live API responses.
 */
export const MODEL_CAPABILITIES: Readonly<Record<OpenMeteoModel, ModelCapabilities>> = {
  icon_eu: {
    id: "icon_eu",
    pressureLevelsHpa: FULL_LEVELS,
    heightLevelsM: [80, 120, 180],
    hasSensibleHeatFlux: true,
    hasBoundaryLayerHeight: false,
    hasLiftedIndex: false,
    hasConvectiveInhibition: true,
    resolutionKm: 7,
    updateIntervalHours: 3,
    coverage: "europe",
    rank: 1,
  },
  gfs_seamless: {
    id: "gfs_seamless",
    pressureLevelsHpa: FULL_LEVELS,
    heightLevelsM: [80],
    hasSensibleHeatFlux: true,
    hasBoundaryLayerHeight: true,
    hasLiftedIndex: true,
    hasConvectiveInhibition: true,
    resolutionKm: 13,
    updateIntervalHours: 1,
    coverage: "global",
    rank: 2,
  },
  icon_global: {
    id: "icon_global",
    pressureLevelsHpa: FULL_LEVELS,
    heightLevelsM: [80, 120, 180],
    hasSensibleHeatFlux: true,
    hasBoundaryLayerHeight: false,
    hasLiftedIndex: false,
    hasConvectiveInhibition: true,
    resolutionKm: 11,
    updateIntervalHours: 6,
    coverage: "global",
    rank: 3,
  },
  ukmo_seamless: {
    id: "ukmo_seamless",
    pressureLevelsHpa: FULL_LEVELS,
    heightLevelsM: [],
    hasSensibleHeatFlux: false,
    hasBoundaryLayerHeight: false,
    hasLiftedIndex: false,
    hasConvectiveInhibition: false,
    resolutionKm: 10,
    updateIntervalHours: 1,
    coverage: "global",
    rank: 4,
  },
  meteofrance_arpege_europe: {
    id: "meteofrance_arpege_europe",
    pressureLevelsHpa: ARPEGE_LEVELS,
    heightLevelsM: [],
    hasSensibleHeatFlux: false,
    hasBoundaryLayerHeight: false,
    hasLiftedIndex: false,
    hasConvectiveInhibition: false,
    resolutionKm: 11,
    updateIntervalHours: 1,
    coverage: "europe",
    rank: 5,
  },
  icon_seamless: {
    id: "icon_seamless",
    pressureLevelsHpa: FULL_LEVELS,
    heightLevelsM: [80, 120, 180],
    hasSensibleHeatFlux: true,
    hasBoundaryLayerHeight: false,
    hasLiftedIndex: false,
    hasConvectiveInhibition: true,
    resolutionKm: 7,
    updateIntervalHours: 3,
    coverage: "global",
    rank: 6,
  },
  gfs_global: {
    id: "gfs_global",
    pressureLevelsHpa: FULL_LEVELS,
    heightLevelsM: [80],
    hasSensibleHeatFlux: true,
    hasBoundaryLayerHeight: true,
    hasLiftedIndex: true,
    hasConvectiveInhibition: true,
    resolutionKm: 25,
    updateIntervalHours: 6,
    coverage: "global",
    rank: 7,
  },
  // ECMWF does not serve pressure level profiles at standard endpoints;
  // it provides boundary layer height and surface CAPE only.
  ecmwf_ifs: {
    id: "ecmwf_ifs",
    pressureLevelsHpa: [],
    heightLevelsM: [],
    hasSensibleHeatFlux: false,
    hasBoundaryLayerHeight: true,
    hasLiftedIndex: false,
    hasConvectiveInhibition: true,
    resolutionKm: 9,
    updateIntervalHours: 6,
    coverage: "global",
    rank: 90,
  },
  ecmwf_ifs025: {
    id: "ecmwf_ifs025",
    pressureLevelsHpa: [],
    heightLevelsM: [],
    hasSensibleHeatFlux: false,
    hasBoundaryLayerHeight: false,
    hasLiftedIndex: false,
    hasConvectiveInhibition: false,
    resolutionKm: 25,
    updateIntervalHours: 6,
    coverage: "global",
    rank: 91,
  },
};

/** Minimum pressure levels required from a model to construct a valid atmospheric sounding. */
export const MIN_LEVELS_FOR_SOUNDING = 4;

/**
 * Models usable for atmospheric sounding generation, sorted by preference rank.
 */
export function soundingModels(): readonly OpenMeteoModel[] {
  return Object.values(MODEL_CAPABILITIES)
    .filter((m) => m.pressureLevelsHpa.length >= MIN_LEVELS_FOR_SOUNDING)
    .sort((a, b) => a.rank - b.rank)
    .map((m) => m.id);
}

/** Recommended 3-model multi-agency ensemble for multi-model confidence analysis. */
export const RECOMMENDED_ENSEMBLE: readonly OpenMeteoModel[] = [
  "icon_eu",
  "gfs_seamless",
  "ukmo_seamless",
];
