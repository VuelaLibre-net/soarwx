/**
 * LCL exacto de Romps (2017) mediante la función W de Lambert.
 *
 * @source Romps, D. M. (2017), J. Atmos. Sci. 74, 3891-3900.
 *
 * Referencia independiente contra la que se valida la aproximación de Bolton
 * (prueba T-06 de docs/ACCEPTANCE.md). **Nunca se importa desde `src/`.**
 *
 * Las constantes son las del artículo, que difieren ligeramente de las de
 * `src/units/constants.ts`; esa independencia es justamente lo que hace útil
 * la comparación.
 */

import { lambertWm1 } from "./lambertW.js";

const Ttrip = 273.16;
const ptrip = 611.65;
const E0v = 2.374e6;
const ggr = 9.81;
const rgasa = 287.04;
const rgasv = 461;
const cva = 719;
const cvv = 1418;
const cvl = 4119;
const cpa = cva + rgasa;
const cpv = cvv + rgasv;

/** Presión de vapor de saturación sobre agua líquida, formulación de Romps. */
export function pvstarl(tempK: number): number {
  return (
    ptrip *
    Math.pow(tempK / Ttrip, (cpv - cvl) / rgasv) *
    Math.exp(((E0v - (cvv - cvl) * Ttrip) / rgasv) * (1 / Ttrip - 1 / tempK))
  );
}

/**
 * Altura del LCL sobre el nivel de la parcela, en metros.
 *
 * @param pressurePa presión de la parcela, Pa
 * @param tempK temperatura de la parcela, K
 * @param rh humedad relativa respecto al agua líquida, fracción 0..1
 */
export function romps2017LclHeightM(
  pressurePa: number,
  tempK: number,
  rh: number,
): number {
  const pv = rh * pvstarl(tempK);
  const qv = (rgasa * pv) / (rgasv * pressurePa + (rgasa - rgasv) * pv);
  const rgasm = (1 - qv) * rgasa + qv * rgasv;
  const cpm = (1 - qv) * cpa + qv * cpv;

  if (rh === 0) return (cpm * tempK) / ggr;

  const aL = -(cpv - cvl) / rgasv + cpm / rgasm;
  const bL = -(E0v - (cvv - cvl) * Ttrip) / (rgasv * tempK);
  const cL = (pv / pvstarl(tempK)) * Math.exp(bL);

  const arg = (bL / aL) * Math.pow(cL, 1 / aL);
  return ((cpm * tempK) / ggr) * (1 - bL / (aL * lambertWm1(arg)));
}
