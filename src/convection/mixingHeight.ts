/**
 * Reconciliación entre el techo calculado y el diagnóstico del modelo.
 *
 * Los dos se exponen por separado. **Nunca se sustituye uno por otro en
 * silencio**, y el elegido es siempre el de la parcela: el método de la parcela
 * no es una alternativa, es el camino obligatorio, porque ICON-EU e ICON global
 * —los mejores modelos con sondeo para España— no sirven
 * `boundary_layer_height` en absoluto.
 */

import { m } from "../units/branded.js";
import type { Metres } from "../units/branded.js";

export interface MixingHeightResult {
  /** El que se usa aguas abajo. Siempre el de la parcela. */
  readonly chosenAglM: Metres;
  readonly parcelAglM: Metres;
  readonly modelAglM: Metres | null;
  /** (modelo − parcela) / parcela. `null` si el modelo no lo sirve. */
  readonly divergenceFrac: number | null;
  /**
   * El modelo da bastante más que la parcela: la mezcla es por cizalladura o
   * residual, no térmica, y esa altura no la alcanza un planeador.
   */
  readonly likelyShearDriven: boolean;
}

/**
 * Umbral de divergencia por encima del cual se sospecha mezcla no convectiva.
 * Medido en Fuentemilanos con GFS a las 18:00 hora local, `boundary_layer_height`
 * marcaba 4035 m con la radiación ya un 30 % por debajo del pico.
 */
export const SHEAR_DRIVEN_DIVERGENCE_FRAC = 0.5;

/**
 * @source Glendening (DrJack): «cuando la mezcla resulta de la cizalladura y no
 *         de las térmicas, esa altura no se alcanza».
 */
export function reconcileMixingHeight(
  parcelAglM: Metres,
  modelAglM: Metres | null,
  toleranceFrac: number = SHEAR_DRIVEN_DIVERGENCE_FRAC,
): MixingHeightResult {
  if (modelAglM === null || parcelAglM <= 0) {
    return {
      chosenAglM: parcelAglM,
      parcelAglM,
      modelAglM,
      divergenceFrac: null,
      likelyShearDriven: false,
    };
  }

  const divergenceFrac = (modelAglM - parcelAglM) / parcelAglM;
  return {
    chosenAglM: m(parcelAglM),
    parcelAglM,
    modelAglM,
    divergenceFrac,
    likelyShearDriven: divergenceFrac > toleranceFrac,
  };
}
