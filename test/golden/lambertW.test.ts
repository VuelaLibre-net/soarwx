import { describe, expect, it } from "vitest";
import { lambertWm1 } from "./lambertW.js";

/**
 * La validez de T-06 depende de que Romps esté bien implementado, y Romps
 * depende de esta función. Se valida contra valores conocidos.
 */
describe("W de Lambert, rama −1", () => {
  it("reproduce valores conocidos", () => {
    expect(lambertWm1(-1 / Math.E)).toBeCloseTo(-1, 12);
    expect(lambertWm1(-0.1)).toBeCloseTo(-3.577152063957297, 10);
    expect(lambertWm1(-0.3)).toBeCloseTo(-1.781337023421628, 10);
  });

  it("satisface w·e^w = x en todo el dominio", () => {
    for (let x = -0.3678; x < -1e-8; x *= 0.7) {
      const w = lambertWm1(x);
      expect(Math.abs(w * Math.exp(w) - x)).toBeLessThan(1e-12 * Math.abs(x));
    }
  });

  it("es decreciente hacia −∞ cuando x → 0⁻", () => {
    expect(lambertWm1(-1e-6)).toBeLessThan(lambertWm1(-1e-3));
  });

  it("rechaza el dominio inválido", () => {
    expect(() => lambertWm1(0)).toThrow(RangeError);
    expect(() => lambertWm1(-0.5)).toThrow(RangeError);
  });
});
