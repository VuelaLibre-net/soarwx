/**
 * Emplazamientos de referencia para pruebas y ejemplos.
 *
 * Viven aquí y no en `src/`: la librería no conoce ningún sitio, el relieve es
 * un dato que aporta el consumidor (R-8.1).
 *
 * La geometría de la cresta está **derivada de un transecto de terreno real**,
 * no estimada a ojo. Ver docs/REFERENCES.md, «Emplazamientos de referencia».
 */

import { deg, m } from "../../src/units/branded.js";
import type { RidgeSpec, Site } from "../../src/types/site.js";

/**
 * La Mujer Muerta, extremo occidental de la Sierra de Guadarrama.
 *
 * Es la ladera que se vuela desde Fuentemilanos, a 16.6 km al sureste del
 * aeródromo.
 *
 * - **Eje del cordal:** oeste-suroeste a este-noreste, unos 11 km de largo.
 *   Como eje en 0..180 son **68°**, así que la perpendicular a la cara noroeste
 *   —la que mira al aeródromo— está en **338°**.
 * - **Cresta:** La Pinareja, 2197 m. Le siguen Peña el Oso (2196), Montón de
 *   Trigo (2161) y Pico de Pasapán (2005).
 * - **Pendiente:** 16° es el ajuste por mínimos cuadrados de los dos primeros
 *   kilómetros de la cara noroeste, que es el tramo que se vuela. El ajuste
 *   sobre la cara completa hasta su base, a 4.5 km, da 11.4°: la elección entre
 *   ambos cambia la ascendencia calculada en un factor de 1.4, y por eso se
 *   documenta en vez de esconderse.
 */
export const LA_MUJER_MUERTA: RidgeSpec = {
  name: "La Mujer Muerta",
  bearingDeg: deg(68),
  slopeDeg: deg(16),
  crestMslM: m(2197),
  lengthM: m(11000),
};

/**
 * Sierra de Ayllón, extremo oriental del Sistema Central.
 *
 * **No es una ladera de Fuentemilanos.** Está a 71 km al este-noreste del
 * aeródromo (rumbo 65°), así que es una pata de circuito o una zona de onda, no
 * una ladera que se ataque desde casa. Por eso no cuelga de
 * {@link FUENTEMILANOS_SITE}: evaluarla con el sondeo del aeródromo sería
 * aplicar una columna de aire a 71 km de distancia. Necesita su propio punto de
 * consulta, que es {@link PICO_DEL_LOBO_SITE}.
 *
 * - **Eje del cordal:** **65°**, derivado del terreno por ajuste de la caída de
 *   elevación en 24 rumbos. La cara expuesta mira al **335°**. La fuente
 *   publicada describe el cordal principal como «oeste-este» (eje 90°), 25° más
 *   que lo que dice el relieve; se usa el relieve.
 * - **Cresta:** Pico del Lobo, 2272 m. Le siguen Alto de las Mesas (2257), Peña
 *   Cebollera Vieja (2129), Pico Ocejón (2049) y Pico de la Buitrera (2038).
 * - **Pendiente:** 11.9° de media sobre 3 km en la cara expuesta.
 *
 * **Aviso de calidad.** La anisotropía es modesta: la amplitud del ajuste son
 * 154 m frente a una caída media de 478 m. Es un macizo de unos 46 × 37 km, no
 * un cordal afilado, y la sustentación de ladera calculada con una sola
 * orientación describe la tendencia, no una cara concreta.
 */
export const SIERRA_DE_AYLLON: RidgeSpec = {
  name: "Sierra de Ayllón",
  bearingDeg: deg(65),
  slopeDeg: deg(11.9),
  crestMslM: m(2272),
  lengthM: m(37000),
};

/**
 * Punto de consulta para la Sierra de Ayllón: la cresta localizada por rejilla
 * de elevación, cerca del Pico del Lobo.
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
 * Peñalara, techo de la Sierra de Guadarrama con 2428 m.
 *
 * Se alcanza desde La Mujer Muerta cuando la ladera ha dejado ganar altura
 * suficiente: 12.4 km al este-noreste, rumbo 69°, con un collado de **1316 m**
 * a mitad de camino. Esa transición es una decisión del piloto y **la librería
 * no la calcula** (ver `REQUIREMENTS.md` X-9); lo que sí aporta es el techo
 * utilizable en La Mujer Muerta, que es el dato de entrada de esa decisión.
 *
 * **Aviso: la orientación de esta cresta es poco fiable.** El ajuste sobre 24
 * radiales da eje 178°, coherente con el cordal norte-sur de Peñalara, pero la
 * anisotropía del terreno es de solo el **10 %** (62 m de amplitud frente a
 * 611 m de caída media): Peñalara es una **cima**, no un tramo de cordal, y
 * cae de forma parecida en todas las direcciones. El método de ajuste radial
 * no es aplicable aquí, y el valor se da como indicativo.
 */
export const PENALARA: RidgeSpec = {
  name: "Peñalara",
  bearingDeg: deg(178),
  slopeDeg: deg(12.6),
  crestMslM: m(2428),
};

/** Punto de consulta para Peñalara. */
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
 * Anisotropía del terreno medida alrededor de cada cresta: amplitud del ajuste
 * radial dividida por la caída media a 3 km.
 *
 * Es el criterio de validez del método: por debajo de ~0.15 el terreno cae
 * parecido en todas las direcciones y el eje ajustado no significa nada.
 */
export const RIDGE_ANISOTROPY: Readonly<Record<string, number>> = {
  "Sierra de Ayllón": 154 / 478,
  Peñalara: 62 / 611,
};

/** Por debajo de esto, el ajuste radial no distingue una cresta de una cima. */
export const MIN_MEANINGFUL_ANISOTROPY = 0.15;

/** Aeródromo de Fuentemilanos (LEFM), Segovia. */
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
