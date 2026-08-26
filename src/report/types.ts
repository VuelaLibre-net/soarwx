/**
 * Estructuras del informe diario. Ver docs/SPEC.md §11.1.
 */

import type { Degrees, Kelvin, MPerS, Metres } from "../units/branded.js";
import type { Sounding, SoundingQuality, WindVector } from "../sounding/types.js";
import type { Site } from "../types/site.js";
import type { FluxSignConvention } from "../convection/heatFluxSign.js";
import type { HeatFluxSource } from "../convection/heatFlux.js";
import type { BuoyancyShearResult } from "../convection/buoyancyShear.js";
import type { CeilingResult } from "../clouds/ceiling.js";
import type { OverdevelopmentResult } from "../clouds/overdevelopment.js";
import type { CapeRisk } from "../stability/capeRisk.js";
import type { SoaringScore } from "../forecast/score.js";
import type { Confidence } from "../forecast/confidence.js";
import type { SoaringWindow } from "../forecast/windows.js";

/** Una hora de entrada, ya normalizada a SI. El adaptador la construye. */
export interface HourlyObservation {
  readonly timeUtc: string;
  readonly sounding: Sounding;
  /** Valor crudo del modelo, con su signo sin normalizar. */
  readonly modelFluxWm2?: number | null;
  readonly fluxConvention?: FluxSignConvention;
  readonly capeJkg?: number | null;
  readonly convectiveInhibitionJkg?: number | null;
  /** `lifted_index` del modelo. Se prefiere al calculado. */
  readonly modelLiftedIndex?: number | null;
  readonly boundaryLayerHeightAglM?: Metres | null;
  readonly soilMoistureFrac?: number;
  readonly midLevelHumidityFrac?: number;
}

export type LiftedIndexSource = "model" | "computed" | "unavailable";

export interface HourThermal {
  readonly wStarMs: MPerS;
  /**
   * Flujo de calor sensible en superficie, **positivo hacia arriba**. Es el
   * motor de `w*`: sin él, las dos cifras de la térmica no se pueden auditar
   * contra el forzamiento que las produce.
   *
   * El signo ya viene normalizado al criterio interno, que no es el del
   * modelo: ICON lo sirve positivo hacia abajo y GFS positivo hacia arriba.
   * De dónde sale el valor —del modelo o del balance energético— lo declara
   * `HourQuality.heatFluxSource`.
   */
  readonly surfaceHeatFluxWm2: number;
  /** Radiación neta en superficie. Contexto para leer el flujo sensible. */
  readonly netRadiationWm2: number;
  /**
   * Ascendencia media que ve el variómetro en una subida completa, del 10 % de
   * la capa hasta la altura crítica. No se evalúa a una altura arbitraria: el
   * núcleo tiene su máximo cerca del 20 % de la capa, así que media capa
   * infravalora y el máximo exagera.
   */
  readonly meanClimbMs: MPerS;
  readonly hcritAglM: Metres | null;
  readonly thermalTopAglM: Metres;
  readonly mixedLayerTopAglM: Metres;
  readonly modelBlhAglM: Metres | null;
  readonly likelyShearDriven: boolean;
  readonly triggerTempK: Kelvin | null;
  readonly surfaceExcessK: number;
  readonly suppressedByWind: boolean;
}

export interface HourCloud {
  readonly baseAglM: Metres | null;
  readonly depthM: Metres | null;
  readonly blue: boolean;
  readonly overcast: boolean;
  readonly odRisk: OverdevelopmentResult;
}

export interface HourStability {
  readonly liftedIndex: number | null;
  readonly liftedIndexSource: LiftedIndexSource;
  readonly kIndex: number | null;
  /** Total Totals. Es un índice: adimensional por convención, aunque se derive de temperaturas. */
  readonly totalTotalsIndex: number | null;
  readonly cape: CapeRisk;
}

export interface HourWind {
  readonly surfaceMs: MPerS;
  readonly surfaceFromDeg: Degrees;
  readonly blMean: WindVector;
  readonly blTop: WindVector;
  readonly shearMsPerKm: number;
  readonly bs: BuoyancyShearResult | null;
}

export interface HourQuality extends SoundingQuality {
  readonly heatFluxSource: HeatFluxSource;
  readonly heatFluxEstimated: readonly string[];
}

export interface SoaringHour {
  readonly timeUtc: string;
  /**
   * El sondeo del que sale todo lo demás.
   *
   * Va incluido porque sin él el consumidor no puede dibujar el diagrama
   * oblicuo, que es el gráfico que más dice a un piloto. Quien no lo necesite
   * puede descartarlo antes de serializar.
   */
  readonly sounding: Sounding;
  readonly thermal: HourThermal;
  readonly cloud: HourCloud;
  readonly stability: HourStability;
  readonly wind: HourWind;
  readonly ceiling: CeilingResult;
  readonly score: SoaringScore;
  readonly quality: HourQuality;
}

export interface SoaringDay {
  readonly site: Site;
  readonly dateLocal: string;
  readonly hours: readonly SoaringHour[];
  readonly best: SoaringHour | null;
  readonly windows: readonly SoaringWindow[];
  readonly sunriseUtc: string;
  readonly sunsetUtc: string;
  readonly confidence: Confidence | null;
  /** Atribución CC BY 4.0. El consumidor está obligado a mostrarla. */
  readonly attribution: string;
}
