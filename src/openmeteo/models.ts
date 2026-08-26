/**
 * Capacidades por modelo, **verificadas contra la API en vivo**.
 *
 * La documentación de Open-Meteo lista variables que para una coordenada
 * concreta llegan como `null`, y acepta modelos que no cubren la zona. La
 * tentación de pedir el modelo de más resolución produce un informe vacío:
 * `icon_d2` responde literalmente «No data is available for this location» en
 * el interior peninsular, y `meteofrance_arome_france_hd` acepta la petición y
 * devuelve casi todo nulo.
 *
 * Medido en Fuentemilanos (40.9167 N, 4.2333 W) el 2026-08-18.
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
  /** Orden de preferencia: menor es mejor. */
  readonly rank: number;
}

const FULL_LEVELS = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500] as const;
const ARPEGE_LEVELS = [1000, 950, 925, 900, 850, 800, 700, 600, 500] as const;

/**
 * Qué sirve cada modelo, **verificado contra la API en vivo** y no copiado de la
 * documentación: la documentación lista variables que llegan como `null` para
 * una coordenada dada.
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
  // ECMWF **no sirve niveles de presión** en la coordenada de referencia, así
  // que no vale para sondeos. Solo aporta capa límite y CAPE.
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

/** Un modelo sirve para sondeo si aporta al menos cuatro niveles de presión. */
export const MIN_LEVELS_FOR_SOUNDING = 4;

/**
 * Modelos utilizables para sondeo, ordenados por idoneidad.
 *
 * `best_match` **no está en la lista y no debe usarse**: cose modelos distintos
 * a lo largo del horizonte, de modo que la serie temporal deja de ser
 * físicamente coherente y la dispersión entre modelos deja de significar nada.
 */
export function soundingModels(): readonly OpenMeteoModel[] {
  return Object.values(MODEL_CAPABILITIES)
    .filter((m) => m.pressureLevelsHpa.length >= MIN_LEVELS_FOR_SOUNDING)
    .sort((a, b) => a.rank - b.rank)
    .map((m) => m.id);
}

/** Trío recomendado para dispersión: tres centros de predicción distintos. */
export const RECOMMENDED_ENSEMBLE: readonly OpenMeteoModel[] = [
  "icon_eu",
  "gfs_seamless",
  "ukmo_seamless",
];
