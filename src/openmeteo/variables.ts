/**
 * Open-Meteo API variable catalog.
 *
 * Typed constants defining requested surface and isobaric level variables.
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

/** Atmospheric variables requested at each isobaric pressure level. */
export const PRESSURE_LEVEL_VARIABLES = [
  "temperature",
  "dew_point",
  "wind_speed",
  "wind_direction",
  "geopotential_height",
  "cloud_cover",
] as const;

/**
 * Standard pressure levels (hPa) requested for atmospheric soundings.
 */
export const PRESSURE_LEVELS_HPA = [
  1000, 975, 950, 925, 900, 850, 800, 700, 600, 500,
] as const;

/** Height levels above ground (metres). GFS serves 80 m; ICON serves 80, 120, 180 m. */
export const HEIGHT_LEVELS_M = [80, 120, 180] as const;

export const DAILY_VARIABLES = ["sunrise", "sunset"] as const;

/** Returns full variable names for the specified pressure levels. */
export function levelVariableNames(levelsHpa: readonly number[]): string[] {
  const names: string[] = [];
  for (const level of levelsHpa) {
    for (const variable of PRESSURE_LEVEL_VARIABLES) {
      names.push(`${variable}_${String(level)}hPa`);
    }
  }
  return names;
}
