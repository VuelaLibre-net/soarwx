import { describe, expect, it } from "vitest";
import {
  potentialTemperature,
  temperatureFromPotential,
  virtualPotentialTemperature,
  virtualTemperature,
} from "../../src/thermo/potential.js";
import { dryAdiabaticLift } from "../../src/thermo/parcel.js";
import { celsiusToK, hPaToPa } from "../../src/units/convert.js";
import { kgkg } from "../../src/units/branded.js";

describe("potential temperature", () => {
  // T-04
  it("is conserved along a dry adiabatic ascent (drift < 0.01 K)", () => {
    const p0 = hPaToPa(1000);
    const t0 = celsiusToK(25);
    const theta0 = potentialTemperature(t0, p0);

    for (let hpa = 1000; hpa >= 300; hpa -= 25) {
      const p = hPaToPa(hpa);
      const theta = potentialTemperature(dryAdiabaticLift(t0, p0, p), p);
      expect(Math.abs(theta - theta0)).toBeLessThan(0.01);
    }
  });

  it("is identity at reference pressure", () => {
    const t = celsiusToK(15);
    expect(potentialTemperature(t, hPaToPa(1000))).toBeCloseTo(t, 10);
  });

  it("round-trips with temperatureFromPotential", () => {
    const t = celsiusToK(12);
    const p = hPaToPa(850);
    expect(temperatureFromPotential(potentialTemperature(t, p), p)).toBeCloseTo(t, 10);
  });

  it("θ exceeds T above the reference level", () => {
    const t = celsiusToK(5);
    expect(potentialTemperature(t, hPaToPa(700))).toBeGreaterThan(t);
  });
});

describe("virtual temperature", () => {
  // T-09
  it("Tv > T with moisture, and Tv = T without", () => {
    const t = celsiusToK(20);
    expect(virtualTemperature(t, kgkg(0.01))).toBeGreaterThan(t);
    expect(virtualTemperature(t, kgkg(0))).toBeCloseTo(t, 12);
  });

  it("θv is built on θ, not on T", () => {
    const t = celsiusToK(20);
    const p = hPaToPa(850);
    const w = kgkg(0.008);
    expect(virtualPotentialTemperature(t, p, w)).toBeCloseTo(
      virtualTemperature(potentialTemperature(t, p), w),
      10,
    );
  });
});
