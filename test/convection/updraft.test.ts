import { describe, expect, it } from "vitest";
import {
  ZERO_CROSSING_RATIO,
  innerRadiusRatio,
  updraftMeanAt,
  updraftOuterRadius,
  updraftPeakAt,
  updraftProfile,
} from "../../src/convection/updraft.js";
import { m, mps } from "../../src/units/branded.js";

const W = mps(1); // normalised profiles: w* = 1 directly yields ratio

/** Peak of a function over (0, top), via fine sampling. */
function argmax(f: (x: number) => number, top: number, samples = 200000) {
  let bestX = 0;
  let bestY = -Infinity;
  for (let i = 1; i <= samples; i++) {
    const x = (top * i) / samples;
    const y = f(x);
    if (y > bestY) {
      bestY = y;
      bestX = x;
    }
  }
  return { x: bestX, y: bestY };
}

describe("Lenschow mean updraft profile (Allen eq. 11)", () => {
  const zi = m(1401);

  // U-01 & U-02
  it("reaches 0.4577·w* at z/zi = 0.2273", () => {
    const best = argmax((x) => updraftMeanAt(W, m(x * zi), zi), ZERO_CROSSING_RATIO);
    expect(best.y).toBeCloseTo(0.4577, 3);
    expect(best.x).toBeCloseTo(0.2273, 2);
  });

  // U-03
  it("crosses zero at z/zi = 0.90909", () => {
    expect(ZERO_CROSSING_RATIO).toBeCloseTo(0.90909, 4);
    expect(updraftMeanAt(W, m(ZERO_CROSSING_RATIO * zi), zi)).toBeCloseTo(0, 9);
  });

  // U-04
  it("is negative above the zero crossing", () => {
    expect(updraftMeanAt(W, m(0.95 * zi), zi)).toBeLessThan(0);
    expect(updraftMeanAt(W, m(1.0 * zi), zi)).toBeLessThan(0);
  });

  it("scales linearly with w*", () => {
    const a = updraftMeanAt(mps(2), m(400), zi);
    const b = updraftMeanAt(mps(4), m(400), zi);
    expect(b / a).toBeCloseTo(2, 9);
  });

  it("is zero at the ground and for non-positive zi", () => {
    expect(updraftMeanAt(W, m(0), zi)).toBe(0);
    expect(updraftMeanAt(W, m(100), m(0))).toBe(0);
  });
});

describe("thermal radius (Allen eq. 12-13)", () => {
  const zi = m(1401);

  // U-08
  it("equals 99.2 m at mid-layer for zi = 1401 m", () => {
    expect(updraftOuterRadius(m(0.5 * zi), zi)).toBeCloseTo(99.2, 1);
  });

  // U-09
  it("yields r1/r2 = 0.249 for this radius", () => {
    expect(innerRadiusRatio(updraftOuterRadius(m(0.5 * zi), zi))).toBeCloseTo(0.249, 3);
  });

  // U-10
  it("never falls below 10 m", () => {
    expect(updraftOuterRadius(m(0), zi)).toBe(10);
    expect(updraftOuterRadius(m(0.001), zi)).toBe(10);
    expect(updraftOuterRadius(m(1), m(0))).toBe(10);
  });

  it("increases with height in the lower half of the convective layer", () => {
    let previous = 0;
    for (let f = 0.05; f <= 0.5; f += 0.05) {
      const r = updraftOuterRadius(m(f * zi), zi);
      expect(r).toBeGreaterThan(previous);
      previous = r;
    }
  });

  it("saturates inner ratio at 0.8 for large radii", () => {
    expect(innerRadiusRatio(m(700))).toBe(0.8);
    expect(innerRadiusRatio(m(599))).toBeCloseTo(0.0011 * 599 + 0.14, 9);
  });
});

describe("core peak velocity (Allen eq. 14-15)", () => {
  // U-05, U-06, U-07
  const cases: [number, number, number][] = [
    // [zi, peak w_peak/w*, relative height of peak]
    [1401, 1.0707, 0.2126],
    [2000, 1.0254, 0.2061],
    [3000, 0.9544, 0.1949],
  ];

  for (const [zi, expectedPeak, expectedHeight] of cases) {
    it(`with zi = ${String(zi)} m core peak reaches ${String(expectedPeak)}·w*`, () => {
      const best = argmax((x) => updraftPeakAt(W, m(x * zi), m(zi)), ZERO_CROSSING_RATIO);
      expect(best.y).toBeCloseTo(expectedPeak, 3);
      expect(best.x).toBeCloseTo(expectedHeight, 2);
    });
  }

  it("core velocity strictly exceeds cross-sectional mean", () => {
    const zi = m(1800);
    for (let f = 0.05; f < ZERO_CROSSING_RATIO; f += 0.05) {
      const z = m(f * zi);
      expect(updraftPeakAt(W, z, zi)).toBeGreaterThan(updraftMeanAt(W, z, zi));
    }
  });

  it("at mid-layer with w* = 2.56 and zi = 1401 mean is 0.91 and core is 2.09", () => {
    const zi = m(1401);
    const w = mps(2.56);
    expect(updraftMeanAt(w, m(0.5 * zi), zi)).toBeCloseTo(0.91, 2);
    expect(updraftPeakAt(w, m(0.5 * zi), zi)).toBeCloseTo(2.09, 2);
  });

  // U-11: synthesis Allen <-> DrJack
  it("core peak remains close to w* across full range of zi", () => {
    // Measured: [0.921 at zi = 3500 m, 1.118 at zi = 800 m].
    let lowest = Infinity;
    let highest = -Infinity;
    for (let zi = 800; zi <= 3500; zi += 100) {
      const best = argmax(
        (x) => updraftPeakAt(W, m(x * zi), m(zi)),
        ZERO_CROSSING_RATIO,
        4000,
      );
      lowest = Math.min(lowest, best.y);
      highest = Math.max(highest, best.y);
    }
    expect(lowest).toBeCloseTo(0.921, 2);
    expect(highest).toBeCloseTo(1.118, 2);
    expect(lowest).toBeGreaterThan(0.9);
    expect(highest).toBeLessThan(1.16);
  });

  it("ratio decreases with increasing zi: deeper layers produce less pronounced cores", () => {
    const peakFor = (zi: number) =>
      argmax((x) => updraftPeakAt(W, m(x * zi), m(zi)), ZERO_CROSSING_RATIO, 4000).y;
    expect(peakFor(1000)).toBeGreaterThan(peakFor(2000));
    expect(peakFor(2000)).toBeGreaterThan(peakFor(3000));
  });
});

describe("sampled profile", () => {
  it("returns points sorted from ground to zi", () => {
    const points = updraftProfile(mps(2), m(2000));
    expect(points.length).toBeGreaterThan(50);
    expect(points[0]!.zAglM).toBe(0);
    expect(points[points.length - 1]!.zAglM).toBeCloseTo(2000, 6);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.zAglM).toBeGreaterThanOrEqual(points[i - 1]!.zAglM);
    }
  });

  it("accepts custom step size and top fraction", () => {
    const points = updraftProfile(mps(2), m(1000), { stepM: m(250), topFrac: 0.8 });
    expect(points.map((p) => p.zAglM)).toEqual([0, 250, 500, 750, 800]);
  });
});
