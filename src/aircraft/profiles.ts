/**
 * Perfiles de aeronave. La física es general; los umbrales son del planeador.
 *
 * El módulo separa dos números que antes eran uno solo:
 *
 * - `hcritThresholdMs` es el **criterio** de DrJack para declarar hasta dónde
 *   sigue siendo explotable la térmica: 225 fpm, idéntico en todo el catálogo.
 * - `circlingSinkMs` es el **hundimiento real** del aparato virando a 40°, y
 *   sale de la polar publicada por el fabricante.
 *
 * Confundirlos hacía que elegir un velero moviera el techo, que es justo lo que
 * el criterio de RASP no debe hacer. Ver `convection/hcrit.ts`.
 */

import { fpmToMs, knotsToMs } from "../units/convert.js";
import { m, mps } from "../units/branded.js";
import type { MPerS, Metres } from "../units/branded.js";

/** Identificadores del catálogo. Union y no `string`: obliga a mapas exhaustivos. */
export type AircraftProfileId =
  | "rasp-reference"
  | "glider-trainer"
  | "glider-club"
  | "glider-performance"
  | "ask21"
  | "g103a-twin-ii"
  | "astir-cs"
  | "duo-discus"
  | "dg1001-club"
  | "ls8e-15"
  | "ls8e-18"
  | "ash25";

export interface AircraftProfile {
  readonly id: AircraftProfileId;
  /**
   * Mínimo hundimiento en vuelo recto, dato de fabricante. `null` cuando el
   * perfil no es un avión sino una convención (ver `RASP_REFERENCE`).
   */
  readonly minSinkMs: MPerS | null;
  /** Régimen de caída virando dentro de la térmica, al alabeo de referencia. */
  readonly circlingSinkMs: MPerS;
  /**
   * Ascendencia por debajo de la cual se deja de contar la térmica como
   * explotable. Define `hcrit` y **no** es una propiedad del avión.
   */
  readonly hcritThresholdMs: MPerS;
  /** Por encima de este viento en superficie, `w*` se anula. */
  readonly maxSurfaceWindMs: MPerS;
  /** Radio mínimo de viraje, para comparar con el radio de la térmica. */
  readonly minTurnRadiusM: Metres;
  /** Lectura de variómetro por debajo de la cual la térmica no compensa. */
  readonly minUsableClimbMs: MPerS;
}

/**
 * Umbral de `hcrit`.
 *
 * DrJack lo describe como «estimación aproximada del régimen de caída de un
 * velero o ala delta virando y maniobrando para mantenerse dentro de la
 * térmica»: un valor práctico y deliberadamente conservador, no la polar de
 * ningún modelo. Se conserva sin tocar porque es lo que hace que nuestro techo
 * siga siendo comparable con el de RASP.
 *
 * @source Glendening, J. («DrJack»), RASP BLIPMAP, definición de hcrit.
 */
export const RASP_HCRIT_THRESHOLD_MS: MPerS = fpmToMs(225); // 1.143 m/s

/**
 * Alabeo de referencia para virar en térmica.
 *
 * El manual actual de la FAA sigue explicando que 40° puede dar mejor subida
 * que 30° al permitir quedarse en la zona fuerte del núcleo, y que el coste en
 * hundimiento se hace mucho más acusado por encima de unos 45°.
 *
 * @source FAA Glider Flying Handbook, FAA-H-8083-13B, cap. 10.
 */
export const REFERENCE_BANK_DEG = 40;

/**
 * Cuánto crece el mínimo hundimiento al virar, respecto al de vuelo recto.
 *
 * En viraje coordinado el factor de carga es `n = 1/cos φ`. Para una polar
 * parabólica, volando a la velocidad óptima del nuevo factor de carga, la
 * velocidad de mínimo hundimiento escala como `n^(1/2)` y el hundimiento como
 * `n^(3/2)`. A 40°: `n = 1.3054`, la velocidad sube un 14 % y el hundimiento
 * un 49 %.
 *
 * @source Relación clásica de viraje en planeador; los +14 % / +49 % a 40°
 *         coinciden con los cálculos publicados por la Soaring Society of
 *         America.
 */
export function circlingSinkFactor(bankDeg: number): number {
  return Math.pow(1 / Math.cos((bankDeg * Math.PI) / 180), 1.5);
}

/** El factor a `REFERENCE_BANK_DEG`. 1.4914. */
export const BANK_40_SINK_FACTOR = circlingSinkFactor(REFERENCE_BANK_DEG);

/**
 * Campos que no dependen del modelo.
 *
 * `maxSurfaceWindMs` es el corte de Allen sobre `w*`: es meteorología, no
 * aeronave, así que vale lo mismo para todo el catálogo. El artículo escribe
 * «12.87 m/s (25 knots)», pero 25 nudos exactos son 12.8611 m/s: se conserva el
 * valor que el artículo usa en sus cálculos, y la diferencia de 0.017 kt queda
 * anotada en `ALLEN_WIND_CUTOFF_EXACT_KNOTS_MS`.
 *
 * `minTurnRadiusM` y `minUsableClimbMs` sí son del aparato en rigor, pero no
 * hay dato de fabricante para ellos y ninguna función los lee todavía:
 * inventarlos modelo a modelo sería ruido sin fuente.
 *
 * @source Allen, M. J. (2006), AIAA 2006-1510, §II (corte de viento).
 */
const SHARED = {
  maxSurfaceWindMs: mps(12.87),
  minTurnRadiusM: m(40),
  minUsableClimbMs: mps(0.5),
} as const;

/**
 * Construye un perfil a partir del mínimo hundimiento en recto publicado.
 *
 * La derivación vive aquí y no en un comentario: ningún avión del catálogo
 * declara un `circlingSinkMs` literal.
 */
function glider(id: AircraftProfileId, minSinkMs: number): AircraftProfile {
  return {
    id,
    minSinkMs: mps(minSinkMs),
    circlingSinkMs: mps(minSinkMs * BANK_40_SINK_FACTOR),
    hcritThresholdMs: RASP_HCRIT_THRESHOLD_MS,
    ...SHARED,
  };
}

/**
 * El criterio de DrJack tal cual, usado como si fuera un avión.
 *
 * No es un modelo: es la referencia con la que reproducir exactamente lo que
 * publica RASP, útil para contrastar. Al valer su caída lo mismo que el umbral,
 * la lectura de variómetro cae a cero justo en `hcrit`.
 *
 * @source Glendening, J. («DrJack»), RASP BLIPMAP.
 */
export const RASP_REFERENCE: AircraftProfile = {
  id: "rasp-reference",
  minSinkMs: null,
  circlingSinkMs: RASP_HCRIT_THRESHOLD_MS,
  hcritThresholdMs: RASP_HCRIT_THRESHOLD_MS,
  ...SHARED,
};

// ---------------------------------------------------------------------------
// Clases genéricas.
//
// Convenciones declaradas, para quien no quiera elegir un modelo concreto. Los
// tres valores salen de la misma tabla de fabricantes que los modelos de abajo.
// ---------------------------------------------------------------------------

/** Biplaza de escuela a peso doble, o club con el ala sucia. */
export const GLIDER_TRAINER: AircraftProfile = glider("glider-trainer", 0.7);

/**
 * Planeador de club. El perfil por omisión de la librería.
 *
 * 0.65 m/s en recto es el ASK 21, el biplaza de club más extendido, así que la
 * clase queda del lado conservador frente a cualquier monoplaza moderno.
 */
export const GLIDER_CLUB: AircraftProfile = glider("glider-club", 0.65);

/** Monoplaza moderno de 15 a 18 m. */
export const GLIDER_PERFORMANCE: AircraftProfile = glider("glider-performance", 0.55);

// ---------------------------------------------------------------------------
// Modelos concretos.
//
// Aviso sobre la homogeneidad de la tabla: cada fabricante publica su mínimo
// hundimiento a la masa que le conviene, así que las cifras no son
// estrictamente comparables entre sí. El propio manual del Astir CS lo enseña
// en una sola tabla: 0.6 m/s a 350 kg y 0.7 m/s a 450 kg. Donde la fuente da la
// masa de referencia, queda anotada.
// ---------------------------------------------------------------------------

/** Schleicher ASK 21. 0.65 m/s, masa mínima 24.5 kg/m². @source Schleicher. */
export const ASK_21: AircraftProfile = glider("ask21", 0.65);

/**
 * Grob G103A Twin II Acro. 0.64 m/s.
 *
 * Grob ya no publica datos de veleros: la cifra es la de la ficha de tipo.
 * Algunos listados del Acro a peso doble dan hasta 0.75 m/s.
 *
 * @source Ficha de tipo del G103A Twin II.
 */
export const G103A_TWIN_II: AircraftProfile = glider("g103a-twin-ii", 0.64);

/**
 * Grob Astir CS. 0.6 m/s a 75 km/h y 350 kg (0.7 m/s a 85 km/h y 450 kg).
 *
 * El mismo manual da 80-85 km/h como velocidad de espiral frente a los 75 km/h
 * de mínimo hundimiento: un +7 a +13 %, que es justo lo que predice el `n^(1/2)`
 * de `circlingSinkFactor` a 40°.
 *
 * @source Grob, Astir CS 77 Flight and Maintenance Manual, «Flying Performance
 *         — Glide Polar Curve».
 */
export const ASTIR_CS: AircraftProfile = glider("astir-cs", 0.6);

/**
 * Schempp-Hirth Duo Discus. 0.58 m/s, L/D 45.
 *
 * @source Polar de fábrica, recalculada de la medición Idaflieg / DLR de 1994.
 */
export const DUO_DISCUS: AircraftProfile = glider("duo-discus", 0.58);

/** DG-1001 Club. 0.62 m/s, L/D > 40. @source DG Aviation. */
export const DG_1001_CLUB: AircraftProfile = glider("dg1001-club", 0.62);

/** LS8-e neo, 15 m. 0.59 m/s, L/D 43. @source DG Aviation. */
export const LS8E_15: AircraftProfile = glider("ls8e-15", 0.59);

/** LS8-e neo, 18 m. 0.51 m/s, L/D 48. @source DG Aviation. */
export const LS8E_18: AircraftProfile = glider("ls8e-18", 0.51);

/** Schleicher ASH 25. 0.49 m/s, L/D > 57. @source Schleicher, ficha ASH 25 M/Mi. */
export const ASH_25: AircraftProfile = glider("ash25", 0.49);

/** El catálogo completo, en orden de presentación. */
export const AIRCRAFT_PROFILES: readonly AircraftProfile[] = [
  GLIDER_TRAINER,
  GLIDER_CLUB,
  GLIDER_PERFORMANCE,
  ASK_21,
  G103A_TWIN_II,
  ASTIR_CS,
  DUO_DISCUS,
  DG_1001_CLUB,
  LS8E_15,
  LS8E_18,
  ASH_25,
  RASP_REFERENCE,
];

/** Busca un perfil por identificador. `undefined` si no está en el catálogo. */
export function findAircraftProfile(id: string): AircraftProfile | undefined {
  return AIRCRAFT_PROFILES.find((profile) => profile.id === id);
}

/** Los 25 nudos exactos, para quien prefiera el redondeo del nudo al del artículo. */
export const ALLEN_WIND_CUTOFF_EXACT_KNOTS_MS: MPerS = knotsToMs(25);
