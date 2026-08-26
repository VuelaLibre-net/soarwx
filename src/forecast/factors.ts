/**
 * Factores del índice de vuelo.
 *
 * Cada factor expone su valor, su unidad, su puntuación, su peso y su banda.
 * **Un veredicto sin desglose es inaceptable** (R-10.2): el piloto tiene
 * derecho a saber por qué el día puntúa lo que puntúa.
 *
 * **La CAPE no está aquí y no puede estarlo.** Es exclusivamente un veto. El
 * predecesor la puntuaba con banda ideal 1000-2500 J/kg mientras la vetaba por
 * encima de 2500, de modo que 2400 J/kg sacaba nota máxima y estaba a 100 J/kg
 * de un veto.
 */

import type { Band } from "./bands.js";
import { scoreBand } from "./bands.js";

export type FactorId =
  | "climb_strength"
  | "usable_ceiling"
  | "lapse_rate"
  | "thermal_quality"
  | "surface_wind"
  | "moisture"
  | "cloud_cover";

export interface Factor {
  readonly id: FactorId;
  /** Valor crudo, en la unidad que declara `unit`. */
  readonly value: number;
  readonly unit: string;
  /** Puntuación en [0, 1]. */
  readonly score: number;
  readonly weight: number;
  readonly band: Band;
  /** Un factor se considera cumplido a partir de 0.6. */
  readonly ok: boolean;
}

export interface FactorSpec {
  readonly unit: string;
  readonly weight: number;
  readonly band: Band;
  /** Por qué esa banda y ese peso. */
  readonly rationale: string;
}

const INF = Number.POSITIVE_INFINITY;

/**
 * Configuración por defecto, calibrada para planeador.
 *
 * @source Umbrales de Glendening (DrJack) donde existen (calidad de térmica,
 *         viento); el resto son convenciones de uso declaradas y recalibrables.
 */
export const DEFAULT_FACTORS: Readonly<Record<FactorId, FactorSpec>> = {
  climb_strength: {
    unit: "m/s",
    weight: 2,
    band: { idealMin: 2, idealMax: INF, zeroMin: 0.4, zeroMax: INF },
    rationale:
      "Lectura esperada de variómetro promediada sobre la banda de trabajo, con el hundimiento del velero elegido. Por debajo de 0.4 m/s no compensa virar; a partir de 2 m/s el día es de trabajo cómodo.",
  },
  usable_ceiling: {
    unit: "m AGL",
    weight: 2,
    band: { idealMin: 1800, idealMax: INF, zeroMin: 400, zeroMax: INF },
    rationale:
      "Techo utilizable. Por debajo de 400 m no hay vuelo; 1800 m permite transiciones con margen.",
  },
  lapse_rate: {
    unit: "K/km",
    weight: 1.5,
    band: { idealMin: 7, idealMax: INF, zeroMin: 2, zeroMax: INF },
    rationale:
      "Gradiente térmico en la capa límite. Cerca del adiabático seco (9.8) la convección es libre; por debajo de 2 K/km la capa está estabilizada.",
  },
  thermal_quality: {
    unit: "w*/u*",
    weight: 1.5,
    band: { idealMin: 10, idealMax: INF, zeroMin: 5, zeroMax: INF },
    rationale:
      "Relación boyancia/cizalladura. Umbrales de DrJack: 5 o menos rompe las térmicas, 10 o más deja de importar.",
  },
  surface_wind: {
    unit: "m/s",
    weight: 1.5,
    band: { idealMin: 0, idealMax: 7.7, zeroMin: -INF, zeroMax: 15.4 },
    rationale:
      "Viento en superficie. Hasta 15 nudos no estorba; a 30 nudos el vuelo deja de ser razonable.",
  },
  moisture: {
    unit: "K",
    weight: 1,
    band: { idealMin: 8, idealMax: 20, zeroMin: 2, zeroMax: 35 },
    rationale:
      "Déficit de punto de rocío en la capa mezclada. Muy bajo trae sobredesarrollo; muy alto deja el día azul y sin referencias. Sustituye al K-Index, que es un índice tormentoso y no una medida de sequedad.",
  },
  cloud_cover: {
    unit: "fracción",
    weight: 1,
    band: { idealMin: 0, idealMax: 0.3, zeroMin: -INF, zeroMax: 0.8 },
    rationale:
      "Nubosidad total. Algo de cumulus marca las térmicas; a partir de 0.8 la radiación cae y con ella la convección.",
  },
};

/** Un factor se da por cumplido a partir de esta puntuación. */
export const FACTOR_OK_THRESHOLD = 0.6;

/**
 * Construye un factor a partir de su valor crudo y su especificación.
 *
 * @source R-10.2 de docs/REQUIREMENTS.md.
 */
export function buildFactor(id: FactorId, value: number, spec: FactorSpec): Factor {
  const score = scoreBand(value, spec.band);
  return {
    id,
    value,
    unit: spec.unit,
    score,
    weight: spec.weight,
    band: spec.band,
    ok: score >= FACTOR_OK_THRESHOLD,
  };
}
