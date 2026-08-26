import { describe, expect, it } from "vitest";
import { criticalHeight, expectedVarioAt } from "../../src/convection/hcrit.js";
import {
  AIRCRAFT_PROFILES,
  GLIDER_CLUB,
  RASP_REFERENCE,
} from "../../src/aircraft/profiles.js";
import { m, mps } from "../../src/units/branded.js";
import { fpmToMs } from "../../src/units/convert.js";

/** Test cases from Allen (2006) Table 1, with DrJack's 225 fpm threshold. */
const ALLEN_TABLE_1: [string, number, number, number | null][] = [
  // [case, w* (m/s), zi (m), expected hcrit (m) or null if no solution]
  ["−2σ", 0.46, 53.6, null],
  ["−1σ", 1.27, 210, 106],
  ["median", 2.56, 1401, 993],
  ["+1σ", 4.08, 2819, 2167],
  ["+2σ", 5.02, 3647, 2868],
];

describe("critical height on Allen cases", () => {
  for (const [label, wStar, zi, expected] of ALLEN_TABLE_1) {
    if (expected === null) {
      // C-05
      it(`${label}: thermal never overcomes aircraft sink rate`, () => {
        const r = criticalHeight(mps(wStar), m(zi), GLIDER_CLUB);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe("NO_CONVECTION");
      });
    } else {
      // C-01 to C-04
      it(`${label}: hcrit = ${String(expected)} m`, () => {
        const r = criticalHeight(mps(wStar), m(zi), GLIDER_CLUB);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const tolerance = Math.max(5, expected * 0.015);
        expect(Math.abs(r.value.hcritAglM - expected)).toBeLessThan(tolerance);
      });
    }
  }
});

describe("properties of critical height", () => {
  // C-06, P-01
  it("never exceeds zi", () => {
    for (let wStar = 0.5; wStar <= 6; wStar += 0.25) {
      for (let zi = 200; zi <= 4000; zi += 200) {
        const r = criticalHeight(mps(wStar), m(zi), GLIDER_CLUB);
        if (r.ok) expect(r.value.hcritAglM).toBeLessThanOrEqual(zi);
      }
    }
  });

  // C-07
  it("a profile that never overcomes sink returns NO_CONVECTION, not zero", () => {
    const r = criticalHeight(mps(0.8), m(300), GLIDER_CLUB);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("NO_CONVECTION");
      expect(r.error.detail).toHaveProperty("peakClimbMs");
    }
  });

  // C-08, P-12. Sensitivity is to the **threshold**, not aircraft sink rate:
  // since they are decoupled, RASP criterion defines the ceiling altitude.
  it("increases with lower threshold; decreases with higher threshold", () => {
    const gentle = { ...GLIDER_CLUB, hcritThresholdMs: mps(0.8) };
    const heavy = { ...GLIDER_CLUB, hcritThresholdMs: mps(1.6) };
    for (const [wStar, zi] of [
      [1.27, 210],
      [2.56, 1401],
      [4.08, 2819],
    ] as const) {
      const base = criticalHeight(mps(wStar), m(zi), GLIDER_CLUB);
      const soft = criticalHeight(mps(wStar), m(zi), gentle);
      const hard = criticalHeight(mps(wStar), m(zi), heavy);
      expect(base.ok && soft.ok).toBe(true);
      if (base.ok && soft.ok)
        expect(soft.value.hcritAglM).toBeGreaterThan(base.value.hcritAglM);
      if (base.ok && hard.ok)
        expect(hard.value.hcritAglM).toBeLessThan(base.value.hcritAglM);
    }
  });

  it("increases with w* at fixed zi", () => {
    let previous = 0;
    for (let wStar = 2; wStar <= 6; wStar += 0.5) {
      const r = criticalHeight(mps(wStar), m(2000), GLIDER_CLUB);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.hcritAglM).toBeGreaterThan(previous);
      previous = r.value.hcritAglM;
    }
  });

  it("core peak sits around one fifth of the convective layer", () => {
    const r = criticalHeight(mps(3), m(2000), GLIDER_CLUB);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.peakHeightAglM / 2000).toBeGreaterThan(0.15);
    expect(r.value.peakHeightAglM / 2000).toBeLessThan(0.25);
  });

  it("rejects non-convective inputs", () => {
    expect(criticalHeight(mps(0), m(2000), GLIDER_CLUB).ok).toBe(false);
    expect(criticalHeight(mps(3), m(0), GLIDER_CLUB).ok).toBe(false);
  });

  // Decoupling rationale: choosing an aircraft cannot shift ceiling height
  // because the ceiling is set by RASP convention, not polar curves.
  it("does not depend on aircraft: identical across the catalogue", () => {
    for (const [wStar, zi] of [
      [1.27, 210],
      [2.56, 1401],
      [4.08, 2819],
    ] as const) {
      const heights = AIRCRAFT_PROFILES.map((profile) => {
        const r = criticalHeight(mps(wStar), m(zi), profile);
        expect(r.ok).toBe(true);
        return r.ok ? r.value.hcritAglM : NaN;
      });
      expect(new Set(heights).size).toBe(1);
    }
  });
});

describe("expected variometer reading", () => {
  it("equals core updraft minus glider sink rate", () => {
    expect(expectedVarioAt(mps(2.56), m(700), m(1401), RASP_REFERENCE)).toBeCloseTo(
      2.09 - fpmToMs(225),
      2,
    );
    expect(expectedVarioAt(mps(2.56), m(700), m(1401), GLIDER_CLUB)).toBeCloseTo(
      2.09 - GLIDER_CLUB.circlingSinkMs,
      2,
    );
  });

  it("is negative above hcrit", () => {
    const r = criticalHeight(mps(2.56), m(1401), GLIDER_CLUB);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(
      expectedVarioAt(mps(2.56), m(r.value.hcritAglM + 50), m(1401), GLIDER_CLUB),
    ).toBeLessThan(0);
  });

  it("equals exactly zero at hcrit with RASP reference profile", () => {
    const r = criticalHeight(mps(4.08), m(2819), RASP_REFERENCE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(
      expectedVarioAt(mps(4.08), r.value.hcritAglM, m(2819), RASP_REFERENCE),
    ).toBeCloseTo(0, 6);
  });

  // With a real glider: at hcrit there is still net positive climb remaining,
  // which is exactly what DrJack's conservative threshold intends.
  it("remains positive at hcrit with a real glider", () => {
    for (const profile of AIRCRAFT_PROFILES) {
      if (profile.minSinkMs === null) continue;
      const r = criticalHeight(mps(4.08), m(2819), profile);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const vario = expectedVarioAt(mps(4.08), r.value.hcritAglM, m(2819), profile);
      expect(vario).toBeCloseTo(profile.hcritThresholdMs - profile.circlingSinkMs, 6);
      expect(vario).toBeGreaterThan(0);
    }
  });
});
