import { describe, expect, it } from "vitest";
import {
  fromComponents,
  meanWind,
  shearBetween,
  toComponents,
} from "../../src/sounding/wind.js";
import { deg, m, mps } from "../../src/units/branded.js";

const W = (speed: number, from: number) => ({ speedMs: mps(speed), fromDeg: deg(from) });

describe("wind components", () => {
  it("westerly wind blows towards the east", () => {
    const c = toComponents(mps(10), deg(270));
    expect(c.uMs).toBeCloseTo(10, 9);
    expect(c.vMs).toBeCloseTo(0, 9);
  });

  it("northerly wind blows towards the south", () => {
    const c = toComponents(mps(10), deg(0));
    expect(c.uMs).toBeCloseTo(0, 9);
    expect(c.vMs).toBeCloseTo(-10, 9);
  });

  it("roundtrips back and forth for all compass directions", () => {
    for (let d = 0; d < 360; d += 7) {
      const c = toComponents(mps(12.5), deg(d));
      const back = fromComponents(c.uMs, c.vMs);
      expect(back.speedMs).toBeCloseTo(12.5, 9);
      expect(back.fromDeg).toBeCloseTo(d, 6);
    }
  });

  it("calm conditions return zero speed and direction without inventing headings", () => {
    const back = fromComponents(0, 0);
    expect(back.speedMs).toBe(0);
    expect(back.fromDeg).toBe(0);
  });
});

describe("vector mean wind (R-5.4)", () => {
  // S-06
  it("two opposing layers yield zero vector mean rather than scalar mean", () => {
    const mean = meanWind([
      { wind: W(10, 0), weight: 1 },
      { wind: W(10, 180), weight: 1 },
    ]);
    expect(mean.speedMs).toBeCloseTo(0, 9);
  });

  it("aligned winds preserve speed and direction", () => {
    const mean = meanWind([
      { wind: W(8, 315), weight: 2 },
      { wind: W(12, 315), weight: 2 },
    ]);
    expect(mean.speedMs).toBeCloseTo(10, 9);
    expect(mean.fromDeg).toBeCloseTo(315, 6);
  });

  it("layer weights are applied correctly", () => {
    const mean = meanWind([
      { wind: W(10, 270), weight: 9 },
      { wind: W(10, 90), weight: 1 },
    ]);
    expect(mean.speedMs).toBeCloseTo(8, 9);
    expect(mean.fromDeg).toBeCloseTo(270, 6);
  });

  it("ignores non-positive weights and handles empty list gracefully", () => {
    expect(meanWind([{ wind: W(10, 270), weight: 0 }]).speedMs).toBe(0);
    expect(meanWind([]).speedMs).toBe(0);
  });
});

describe("vector wind shear", () => {
  // S-06
  it("complete 180° wind reversal at constant speed registers maximum vector shear", () => {
    const r = shearBetween(W(10, 0), W(10, 180), m(1000));
    expect(r.deltaMs).toBeCloseTo(20, 9);
    expect(r.shearMsPerKm).toBeCloseTo(20, 9);
  });

  it("identical winds yield zero shear", () => {
    expect(shearBetween(W(7, 240), W(7, 240), m(1000)).deltaMs).toBeCloseTo(0, 9);
  });

  it("speed changes along same direction are measured accurately", () => {
    const r = shearBetween(W(5, 270), W(15, 270), m(2000));
    expect(r.deltaMs).toBeCloseTo(10, 9);
    expect(r.shearMsPerKm).toBeCloseTo(5, 9);
  });

  it("zero layer depth does not cause division by zero", () => {
    expect(Number.isFinite(shearBetween(W(5, 0), W(9, 90), m(0)).shearMsPerKm)).toBe(
      true,
    );
  });
});
