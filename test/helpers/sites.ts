/**
 * Reference soaring sites for tests and examples.
 *
 * Ridge geometry is derived from real terrain transects.
 * See docs/REFERENCES.md, "Reference Sites".
 */

import { deg, m } from "../../src/units/branded.js";
import type { RidgeSpec, Site } from "../../src/types/site.js";

/**
 * La Mujer Muerta ridge, western end of the Sierra de Guadarrama.
 *
 * Flown from Fuentemilanos airfield, 16.6 km southeast.
 *
 * - **Ridge axis:** WSW to ENE, ~11 km length. 0..180 bearing is **68°**; NW facing perpendicular is **338°**.
 * - **Crest:** La Pinareja, 2197 m MSL. Followed by Peña el Oso (2196), Montón de Trigo (2161), and Pico de Pasapán (2005).
 * - **Slope:** 16° least-squares fit across first 2 km of NW face.
 */
export const LA_MUJER_MUERTA: RidgeSpec = {
  name: "La Mujer Muerta",
  bearingDeg: deg(68),
  slopeDeg: deg(16),
  crestMslM: m(2197),
  lengthM: m(11000),
};

/**
 * Sierra de Ayllón, eastern end of the Central System.
 *
 * Located 71 km ENE of Fuentemilanos (bearing 65°).
 * Requires its own query point: {@link PICO_DEL_LOBO_SITE}.
 *
 * - **Ridge axis:** **65°**, derived from terrain analysis across 24 bearings. Exposed face looks toward **335°**.
 * - **Crest:** Pico del Lobo, 2272 m MSL. Followed by Alto de las Mesas (2257), Peña Cebollera Vieja (2129), Pico Ocejón (2049), and Pico de la Buitrera (2038).
 * - **Slope:** 11.9° average across 3 km on the exposed face.
 */
export const SIERRA_DE_AYLLON: RidgeSpec = {
  name: "Sierra de Ayllón",
  bearingDeg: deg(65),
  slopeDeg: deg(11.9),
  crestMslM: m(2272),
  lengthM: m(37000),
};

/**
 * Query site for Sierra de Ayllón: crest located near Pico del Lobo.
 */
export const PICO_DEL_LOBO_SITE: Site = {
  name: "Pico del Lobo",
  latDeg: 41.18189,
  lonDeg: -3.46852,
  elevationMslM: m(2195),
  timezone: "Europe/Madrid",
  ridges: [SIERRA_DE_AYLLON],
  surface: { type: "grass" },
};

/**
 * Peñalara, highest peak of Sierra de Guadarrama at 2428 m MSL.
 */
export const PENALARA: RidgeSpec = {
  name: "Peñalara",
  bearingDeg: deg(178),
  slopeDeg: deg(12.6),
  crestMslM: m(2428),
};

/** Query site for Peñalara. */
export const PENALARA_SITE: Site = {
  name: "Peñalara",
  latDeg: 40.85028,
  lonDeg: -3.95611,
  elevationMslM: m(2408),
  timezone: "Europe/Madrid",
  ridges: [PENALARA],
  surface: { type: "grass" },
};

/**
 * Terrain anisotropy measured around each ridge: radial fit amplitude divided by average drop at 3 km.
 */
export const RIDGE_ANISOTROPY: Readonly<Record<string, number>> = {
  "Sierra de Ayllón": 154 / 478,
  Peñalara: 62 / 611,
};

/** Minimum anisotropy threshold below which radial fit cannot distinguish a ridge from an isolated peak. */
export const MIN_MEANINGFUL_ANISOTROPY = 0.15;

/** Fuentemilanos Airfield (LEFM), Segovia, Spain. */
export const FUENTEMILANOS_SITE: Site = {
  name: "Fuentemilanos",
  icao: "LEFM",
  latDeg: 40.9167,
  lonDeg: -4.2333,
  elevationMslM: m(1001),
  timezone: "Europe/Madrid",
  ridges: [LA_MUJER_MUERTA],
  surface: { type: "cropland" },
};
