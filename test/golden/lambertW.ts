/**
 * Rama W₋₁ de la función W de Lambert, para el LCL exacto de Romps (2017).
 *
 * Solo para pruebas. Definida en [−1/e, 0).
 */

const INV_E = 1 / Math.E;

export function lambertWm1(x: number): number {
  if (x >= 0 || x < -INV_E) {
    throw new RangeError(`lambertWm1 fuera de dominio: ${String(x)}`);
  }
  if (x === -INV_E) return -1;

  let w: number;
  if (x < -0.3) {
    // Serie alrededor de la rama en x = −1/e.
    const p = -Math.sqrt(2 * (Math.E * x + 1));
    w = -1 + p - (p * p) / 3 + (11 * p * p * p) / 72;
  } else {
    // Asintótica para x → 0⁻.
    const l1 = Math.log(-x);
    const l2 = Math.log(-l1);
    w = l1 - l2 + l2 / l1;
  }

  // Halley.
  for (let i = 0; i < 100; i++) {
    const ew = Math.exp(w);
    const f = w * ew - x;
    const denom = ew * (w + 1) - ((w + 2) * f) / (2 * w + 2);
    const step = f / denom;
    w -= step;
    if (Math.abs(step) < 1e-15 * Math.abs(w)) break;
  }
  return w;
}
