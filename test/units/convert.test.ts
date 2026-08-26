import { describe, expect, it } from "vitest";
import * as u from "../../src/units/index.js";

/** P-08 in docs/ACCEPTANCE.md: every conversion round-trips. */
describe("conversions (P-08)", () => {
  const roundTrips: readonly [string, (v: number) => number][] = [
    ["celsius", (v) => u.kToCelsius(u.celsiusToK(v))],
    ["hPa", (v) => u.paToHPa(u.hPaToPa(v))],
    ["km/h", (v) => u.msToKmh(u.kmhToMs(v))],
    ["knots", (v) => u.msToKnots(u.knotsToMs(v))],
    ["feet", (v) => u.mToFeet(u.feetToM(v))],
    ["fpm", (v) => u.msToFpm(u.fpmToMs(v))],
  ];

  for (const [name, trip] of roundTrips) {
    it(`${name} round-trips with relative error < 1e-12`, () => {
      for (const v of [-273.15, -40, -1, 0, 1, 15, 100, 1013.25, 5280, 12345.678]) {
        const back = trip(v);
        if (v === 0) expect(Math.abs(back)).toBeLessThan(1e-12);
        else expect(Math.abs((back - v) / v)).toBeLessThan(1e-12);
      }
    });
  }

  it("225 fpm is the hcrit criterion: 1.143 m/s", () => {
    expect(u.fpmToMs(225)).toBeCloseTo(1.143, 3);
  });

  // Allen (2006) writes "12.87 m/s (25 knots)". With exact knots
  // (1852 m/h) 25 kt is 12.8611 m/s: the 12.87 figure in the paper includes
  // 0.017 kt of rounding. The cutoff constant is pinned at 12.87 m/s, which is
  // the value used in the paper; this test documents the difference.
  it("exact 25 knots is 12.861 m/s, not the paper's 12.87", () => {
    expect(u.knotsToMs(25)).toBeCloseTo(12.8611, 4);
    expect(Math.abs(u.knotsToMs(25) - 12.87)).toBeLessThan(0.01);
  });

  it("normalizes bearings to the interval [0, 360)", () => {
    expect(u.normaliseBearing(-10)).toBe(350);
    expect(u.normaliseBearing(370)).toBe(10);
    expect(u.normaliseBearing(360)).toBe(0);
    expect(u.normaliseBearing(0)).toBe(0);
  });

  it("Γd is g/cp ≈ 9.761 K/km", () => {
    expect(u.GAMMA_D * 1000).toBeCloseTo(9.761, 3);
  });
});
