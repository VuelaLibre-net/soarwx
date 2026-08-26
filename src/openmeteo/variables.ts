/**
 * Catálogo de variables de Open-Meteo.
 *
 * Es una constante tipada, no cadenas sueltas: un nombre mal escrito **no
 * devuelve un hueco, devuelve HTTP 400 y tumba la petición entera**. El
 * predecesor vivió toda una versión con `aerosol_optical_depth_550nm`, que no
 * existe, y eso anuló la respuesta completa de calidad del aire.
 */

export const SURFACE_VARIABLES = [
  "temperature_2m",
  "relative_humidity_2m",
  "dew_point_2m",
  "surface_pressure",
  "pressure_msl",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "temperature_80m",
  "wind_speed_80m",
  "wind_direction_80m",
  "temperature_120m",
  "wind_speed_120m",
  "wind_direction_120m",
  "temperature_180m",
  "wind_speed_180m",
  "wind_direction_180m",
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "shortwave_radiation",
  "sensible_heat_flux",
  "latent_heat_flux",
  "cape",
  "convective_inhibition",
  "lifted_index",
  "boundary_layer_height",
  "soil_moisture_0_to_1cm",
  "is_day",
] as const;

export type SurfaceVariable = (typeof SURFACE_VARIABLES)[number];

/** Variables que se piden en cada nivel de presión. */
export const PRESSURE_LEVEL_VARIABLES = [
  "temperature",
  "dew_point",
  "wind_speed",
  "wind_direction",
  "geopotential_height",
  "cloud_cover",
] as const;

/**
 * Niveles de presión. Los de 600 y 500 hPa **no son opcionales**: en
 * emplazamientos elevados son los únicos claramente por encima de la capa
 * límite, y los índices de estabilidad necesitan el de 500.
 */
export const PRESSURE_LEVELS_HPA = [
  1000, 975, 950, 925, 900, 850, 800, 700, 600, 500,
] as const;

/** Alturas sobre el terreno. GFS solo sirve la de 80 m; ICON las tres. */
export const HEIGHT_LEVELS_M = [80, 120, 180] as const;

export const DAILY_VARIABLES = ["sunrise", "sunset"] as const;

/** Nombres completos de las variables de nivel para los niveles dados. */
export function levelVariableNames(levelsHpa: readonly number[]): string[] {
  const names: string[] = [];
  for (const level of levelsHpa) {
    for (const variable of PRESSURE_LEVEL_VARIABLES) {
      names.push(`${variable}_${String(level)}hPa`);
    }
  }
  return names;
}
