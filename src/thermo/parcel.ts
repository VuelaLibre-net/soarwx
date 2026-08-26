/**
 * Parcel ascent: dry adiabatic and saturated pseudoadiabatic.
 */

import { K, Pa } from "../units/branded.js";
import type { Kelvin, Pascal } from "../units/branded.js";
import { CP, EPS, KAPPA, RD } from "../units/constants.js";
import { err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import { latentHeatOfVaporisation, saturationMixingRatio } from "./saturation.js";

export interface IntegrationOptions {
  /** Initial and maximum step size in pascals. Default 500 Pa. */
  readonly maxStepPa?: Pascal;
  /** Local error tolerance in kelvin. Default 0.01 K. */
  readonly tolK?: number;
  /** Minimum step before returning NOT_CONVERGED in pascals. Default 1 Pa. */
  readonly minStepPa?: Pascal;
  /** Maximum iterations. Default 100,000. Guards against divergent parameters. */
  readonly maxIterations?: number;
}

const DEFAULTS = {
  maxStepPa: Pa(500),
  tolK: 0.01,
  minStepPa: Pa(1),
  maxIterations: 100_000,
} as const;

/**
 * Dry adiabatic lift: temperature when moving a parcel to a different pressure
 * while conserving potential temperature.
 *
 *     T2 = T1 · (p2/p1)^(Rd/cp)
 *
 * @source Poisson; Wallace & Hobbs, Atmospheric Science, eq. 3.54.
 */
export function dryAdiabaticLift(tempK: Kelvin, fromPa: Pascal, toPa: Pascal): Kelvin {
  return K(tempK * Math.pow(toPa / fromPa, KAPPA));
}

/**
 * Pseudoadiabatic lapse rate in pressure coordinates.
 *
 *     dT/dp = (1/p) · (Rd·T + Lv·rs) / (cp + Lv²·rs·ε / (Rd·T²))
 *
 * Lv is evaluated at the parcel temperature rather than treated as constant:
 * with fixed Lv Bolton's θe drifts up to 2.4 K in an ascent from 900 to 500 hPa
 * starting at 30 °C.
 *
 * @source Wallace & Hobbs, Atmospheric Science, eq. 3.71 (pressure form).
 */
function dTdp(tempK: number, pressurePa: number): number {
  const rs = saturationMixingRatio(K(tempK), Pa(pressurePa));
  const lv = latentHeatOfVaporisation(K(tempK));
  const numerator = RD * tempK + lv * rs;
  const denominator = CP + (lv * lv * rs * EPS) / (RD * tempK * tempK);
  return numerator / (denominator * pressurePa);
}

/** Runge-Kutta 4th order step on dT/dp. */
function rk4Step(tempK: number, pressurePa: number, stepPa: number): number {
  const k1 = dTdp(tempK, pressurePa);
  const k2 = dTdp(tempK + (stepPa * k1) / 2, pressurePa + stepPa / 2);
  const k3 = dTdp(tempK + (stepPa * k2) / 2, pressurePa + stepPa / 2);
  const k4 = dTdp(tempK + stepPa * k3, pressurePa + stepPa);
  return tempK + (stepPa * (k1 + 2 * k2 + 2 * k3 + k4)) / 6;
}

/**
 * Saturated pseudoadiabatic ascent via adaptive-step numerical integration.
 * Local truncation error is estimated using step doubling (Richardson) and
 * the result is extrapolated.
 *
 * Returns `NOT_CONVERGED` instead of a silently inaccurate number when the
 * required step falls below `minStepPa`.
 *
 * @source Wallace & Hobbs, Atmospheric Science, eq. 3.71; Richardson (extrapolation).
 */
export function moistAdiabaticLift(
  tempK: Kelvin,
  fromPa: Pascal,
  toPa: Pascal,
  opts: IntegrationOptions = {},
): Result<Kelvin> {
  const maxStep = opts.maxStepPa ?? DEFAULTS.maxStepPa;
  const tol = opts.tolK ?? DEFAULTS.tolK;
  const minStep = opts.minStepPa ?? DEFAULTS.minStepPa;
  const maxIterations = opts.maxIterations ?? DEFAULTS.maxIterations;

  if (fromPa <= 0 || toPa <= 0) {
    return err("OUT_OF_VALID_RANGE", "pressure must be positive", { fromPa, toPa });
  }

  const total = toPa - fromPa;
  if (total === 0) return ok(tempK);

  const direction = Math.sign(total);
  let p = fromPa as number;
  let t = tempK as number;
  let h = direction * Math.min(maxStep, Math.abs(total));

  for (let i = 0; i < maxIterations; i++) {
    // Do not overshoot the target.
    if (Math.abs(toPa - p) < Math.abs(h)) h = toPa - p;

    const coarse = rk4Step(t, p, h);
    const mid = rk4Step(t, p, h / 2);
    const fine = rk4Step(mid, p + h / 2, h / 2);

    // RK4 local error estimation via step doubling.
    const errorEst = Math.abs(fine - coarse) / 15;

    // Never accept a step outside tolerance: if it cannot be met
    // with minimum step size, the result is NOT_CONVERGED.
    if (errorEst <= tol) {
      t = fine + (fine - coarse) / 15;
      p += h;
      if (Math.abs(toPa - p) < 1e-9) return ok(K(t));

      const growth = errorEst > 0 ? 0.9 * Math.pow(tol / errorEst, 0.2) : 2;
      h = direction * Math.min(maxStep, Math.abs(h) * Math.min(2, Math.max(1, growth)));
    } else {
      const shrink = Math.max(0.1, 0.9 * Math.pow(tol / errorEst, 0.2));
      const next = Math.abs(h) * shrink;
      if (next < minStep) {
        return err("NOT_CONVERGED", "step size fell below minStepPa", {
          pressurePa: p,
          tempK: t,
          requiredStepPa: next,
          minStepPa: minStep,
        });
      }
      h = direction * next;
    }
  }

  return err("NOT_CONVERGED", "exceeded maximum iterations", {
    iterations: maxIterations,
    pressurePa: p,
  });
}
