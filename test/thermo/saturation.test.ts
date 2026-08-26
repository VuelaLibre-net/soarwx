import { describe, expect, it } from "vitest";
import {
  SATURATION_VALID_RANGE,
  checkSaturationRange,
  latentHeatOfVaporisation,
  mixingRatio,
  moistHeatCapacity,
  relativeHumidity,
  saturationMixingRatio,
  saturationVapourPressure,
  specificHumidity,
} from "../../src/thermo/saturation.js";
import { celsiusToK, hPaToPa } from "../../src/units/convert.js";
import { kgkg } from "../../src/units/branded.js";
import { goffGratchPa } from "../golden/goffGratch.js";

describe("saturation vapour pressure", () => {
  // T-01
  it("equals 611.2 Pa at freezing point (Bolton 1980, eq. 10)", () => {
    const es = saturationVapourPressure(celsiusToK(0));
    expect(Math.abs((es - 611.2) / 611.2)).toBeLessThan(0.001);
  });

  // T-02
  it("matches Goff-Gratch within 0.5 % between −35 and +35 °C", () => {
    let worst = 0;
    for (let tc = -35; tc <= 35; tc += 0.5) {
      const t = celsiusToK(tc);
      const ref = goffGratchPa(t);
      worst = Math.max(worst, Math.abs((saturationVapourPressure(t) - ref) / ref));
    }
    // Measured error is 0.40 % at the cold extreme. The discrepancy is
    // mostly on the Goff-Gratch side (an older formulation with looser
    // bounds at low temperature); Bolton states 0.1 % against his baseline.
    expect(worst).toBeLessThan(0.005);
  });

  it("is strictly monotonic increasing with temperature", () => {
    let prev = 0;
    for (let tc = -60; tc <= 60; tc += 1) {
      const es = saturationVapourPressure(celsiusToK(tc));
      expect(es).toBeGreaterThan(prev);
      prev = es;
    }
  });

  // T-03
  it("returns finite value AND flags OUT_OF_VALID_RANGE when out of bounds", () => {
    const cold = celsiusToK(-50);
    expect(Number.isFinite(saturationVapourPressure(cold))).toBe(true);
    expect(saturationVapourPressure(cold)).toBeGreaterThan(0);
    expect(checkSaturationRange(cold)?.code).toBe("OUT_OF_VALID_RANGE");
    expect(checkSaturationRange(celsiusToK(50))?.code).toBe("OUT_OF_VALID_RANGE");
  });

  it("returns null when inside valid range", () => {
    expect(checkSaturationRange(celsiusToK(20))).toBeNull();
    expect(checkSaturationRange(SATURATION_VALID_RANGE.minK)).toBeNull();
    expect(checkSaturationRange(SATURATION_VALID_RANGE.maxK)).toBeNull();
  });
});

describe("humidity", () => {
  it("saturation mixing ratio increases with T and decreases with p", () => {
    const p = hPaToPa(900);
    expect(saturationMixingRatio(celsiusToK(30), p)).toBeGreaterThan(
      saturationMixingRatio(celsiusToK(10), p),
    );
    expect(saturationMixingRatio(celsiusToK(20), hPaToPa(700))).toBeGreaterThan(
      saturationMixingRatio(celsiusToK(20), hPaToPa(1000)),
    );
  });

  it("relative humidity is 1 when dewpoint equals temperature", () => {
    expect(relativeHumidity(celsiusToK(18), celsiusToK(18))).toBeCloseTo(1, 12);
  });

  it("mixing ratio when dewpoint equals T matches saturation mixing ratio", () => {
    const p = hPaToPa(900);
    expect(mixingRatio(celsiusToK(25), p)).toBeCloseTo(
      saturationMixingRatio(celsiusToK(25), p),
      15,
    );
  });

  it("specific humidity is strictly less than mixing ratio", () => {
    const w = kgkg(0.02);
    expect(specificHumidity(w)).toBeLessThan(w);
    expect(specificHumidity(kgkg(0))).toBe(0);
  });

  it("latent heat decreases with temperature", () => {
    expect(latentHeatOfVaporisation(celsiusToK(0))).toBeCloseTo(2.501e6, 0);
    expect(latentHeatOfVaporisation(celsiusToK(30))).toBeLessThan(
      latentHeatOfVaporisation(celsiusToK(0)),
    );
  });

  it("moist air cp exceeds dry air cp", () => {
    expect(moistHeatCapacity(0.02)).toBeGreaterThan(moistHeatCapacity(0));
  });
});
