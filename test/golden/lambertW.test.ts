import { describe, expect, it } from "vitest";
import { lambertWm1 } from "./lambertW.js";

/**
 * Validates Lambert W function implementation against known numerical constants.
 */
describe("Lambert W branch -1", () => {
  it("reproduces known reference values", () => {
    expect(lambertWm1(-1 / Math.E)).toBeCloseTo(-1, 12);
    expect(lambertWm1(-0.1)).toBeCloseTo(-3.577152063957297, 10);
    expect(lambertWm1(-0.3)).toBeCloseTo(-1.781337023421628, 10);
  });

  it("satisfies w*e^w = x across the entire domain", () => {
    for (let x = -0.3678; x < -1e-8; x *= 0.7) {
      const w = lambertWm1(x);
      expect(Math.abs(w * Math.exp(w) - x)).toBeLessThan(1e-12 * Math.abs(x));
    }
  });

  it("decreases toward -infinity as x -> 0-", () => {
    expect(lambertWm1(-1e-6)).toBeLessThan(lambertWm1(-1e-3));
  });

  it("rejects invalid input out of domain", () => {
    expect(() => lambertWm1(0)).toThrow(RangeError);
    expect(() => lambertWm1(-0.5)).toThrow(RangeError);
  });
});
