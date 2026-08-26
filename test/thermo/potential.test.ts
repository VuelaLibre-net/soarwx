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

describe("temperatura potencial", () => {
  // T-04
  it("se conserva a lo largo de un ascenso adiabático seco (deriva < 0.01 K)", () => {
    const p0 = hPaToPa(1000);
    const t0 = celsiusToK(25);
    const theta0 = potentialTemperature(t0, p0);

    for (let hpa = 1000; hpa >= 300; hpa -= 25) {
      const p = hPaToPa(hpa);
      const theta = potentialTemperature(dryAdiabaticLift(t0, p0, p), p);
      expect(Math.abs(theta - theta0)).toBeLessThan(0.01);
    }
  });

  it("es la identidad a la presión de referencia", () => {
    const t = celsiusToK(15);
    expect(potentialTemperature(t, hPaToPa(1000))).toBeCloseTo(t, 10);
  });

  it("va y vuelve con temperatureFromPotential", () => {
    const t = celsiusToK(12);
    const p = hPaToPa(850);
    expect(temperatureFromPotential(potentialTemperature(t, p), p)).toBeCloseTo(t, 10);
  });

  it("θ supera a T por encima del nivel de referencia", () => {
    const t = celsiusToK(5);
    expect(potentialTemperature(t, hPaToPa(700))).toBeGreaterThan(t);
  });
});

describe("temperatura virtual", () => {
  // T-09
  it("Tv > T con humedad, y Tv = T sin ella", () => {
    const t = celsiusToK(20);
    expect(virtualTemperature(t, kgkg(0.01))).toBeGreaterThan(t);
    expect(virtualTemperature(t, kgkg(0))).toBeCloseTo(t, 12);
  });

  it("θv se construye sobre θ, no sobre T", () => {
    const t = celsiusToK(20);
    const p = hPaToPa(850);
    const w = kgkg(0.008);
    expect(virtualPotentialTemperature(t, p, w)).toBeCloseTo(
      virtualTemperature(potentialTemperature(t, p), w),
      10,
    );
  });
});
