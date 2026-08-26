/**
 * Exact Romps (2017) LCL formulation using the Lambert W function.
 *
 * @source Romps, D. M. (2017), J. Atmos. Sci. 74, 3891-3900.
 *
 * Independent reference against which Bolton's approximation is validated (test T-06).
 * Never imported into `src/`.
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

/** Saturation vapor pressure over liquid water (Romps formulation). */
export function pvstarl(tempK: number): number {
  return (
    ptrip *
    Math.pow(tempK / Ttrip, (cpv - cvl) / rgasv) *
    Math.exp(((E0v - (cvv - cvl) * Ttrip) / rgasv) * (1 / Ttrip - 1 / tempK))
  );
}

/**
 * Height of LCL above parcel initial level in metres.
 *
 * @param pressurePa parcel pressure, Pa
 * @param tempK parcel temperature, K
 * @param rh relative humidity with respect to liquid water (0..1 fraction)
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
