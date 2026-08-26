/**
 * Ascenso de parcela: adiabático seco y pseudoadiabático saturado.
 */

import { K, Pa } from "../units/branded.js";
import type { Kelvin, Pascal } from "../units/branded.js";
import { CP, EPS, KAPPA, RD } from "../units/constants.js";
import { err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import { latentHeatOfVaporisation, saturationMixingRatio } from "./saturation.js";

export interface IntegrationOptions {
  /** Paso inicial y máximo, en pascales. Por defecto 500 Pa. */
  readonly maxStepPa?: Pascal;
  /** Tolerancia de error local, en kelvin. Por defecto 0.01 K. */
  readonly tolK?: number;
  /** Paso mínimo antes de declarar NOT_CONVERGED, en pascales. Por defecto 1 Pa. */
  readonly minStepPa?: Pascal;
  /** Tope de iteraciones. Por defecto 100 000. Protege de parámetros absurdos. */
  readonly maxIterations?: number;
}

const DEFAULTS = {
  maxStepPa: Pa(500),
  tolK: 0.01,
  minStepPa: Pa(1),
  maxIterations: 100_000,
} as const;

/**
 * Ascenso adiabático seco: temperatura al llevar la parcela a otra presión
 * conservando la temperatura potencial.
 *
 *     T2 = T1 · (p2/p1)^(Rd/cp)
 *
 * @source Poisson; Wallace & Hobbs, Atmospheric Science, ec. 3.54.
 */
export function dryAdiabaticLift(tempK: Kelvin, fromPa: Pascal, toPa: Pascal): Kelvin {
  return K(tempK * Math.pow(toPa / fromPa, KAPPA));
}

/**
 * Gradiente pseudoadiabático en coordenadas de presión.
 *
 *     dT/dp = (1/p) · (Rd·T + Lv·rs) / (cp + Lv²·rs·ε / (Rd·T²))
 *
 * Lv se evalúa a la temperatura de la parcela, no se toma constante: con Lv
 * fijo la θe de Bolton deriva hasta 2.4 K en un ascenso de 900 a 500 hPa desde
 * 30 °C.
 *
 * @source Wallace & Hobbs, Atmospheric Science, ec. 3.71 (forma en presión).
 */
function dTdp(tempK: number, pressurePa: number): number {
  const rs = saturationMixingRatio(K(tempK), Pa(pressurePa));
  const lv = latentHeatOfVaporisation(K(tempK));
  const numerator = RD * tempK + lv * rs;
  const denominator = CP + (lv * lv * rs * EPS) / (RD * tempK * tempK);
  return numerator / (denominator * pressurePa);
}

/** Un paso de Runge-Kutta de cuarto orden sobre dT/dp. */
function rk4Step(tempK: number, pressurePa: number, stepPa: number): number {
  const k1 = dTdp(tempK, pressurePa);
  const k2 = dTdp(tempK + (stepPa * k1) / 2, pressurePa + stepPa / 2);
  const k3 = dTdp(tempK + (stepPa * k2) / 2, pressurePa + stepPa / 2);
  const k4 = dTdp(tempK + stepPa * k3, pressurePa + stepPa);
  return tempK + (stepPa * (k1 + 2 * k2 + 2 * k3 + k4)) / 6;
}

/**
 * Ascenso pseudoadiabático saturado por integración numérica con paso
 * adaptativo. El error local se estima por duplicación de paso (Richardson) y
 * el resultado se extrapola.
 *
 * Devuelve `NOT_CONVERGED` en vez de un número silenciosamente malo cuando el
 * paso necesario cae por debajo de `minStepPa`.
 *
 * @source Wallace & Hobbs, Atmospheric Science, ec. 3.71; Richardson (extrapolación).
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
    // No sobrepasar el objetivo.
    if (Math.abs(toPa - p) < Math.abs(h)) h = toPa - p;

    const coarse = rk4Step(t, p, h);
    const mid = rk4Step(t, p, h / 2);
    const fine = rk4Step(mid, p + h / 2, h / 2);

    // Estimación de error local de RK4 por duplicación de paso.
    const errorEst = Math.abs(fine - coarse) / 15;

    // No se acepta nunca un paso fuera de tolerancia: si no se puede cumplir
    // con el paso mínimo, el resultado es NOT_CONVERGED, no un número malo.
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
