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

describe("presión de vapor de saturación", () => {
  // T-01
  it("vale 611.2 Pa en el punto de congelación (Bolton 1980, ec. 10)", () => {
    const es = saturationVapourPressure(celsiusToK(0));
    expect(Math.abs((es - 611.2) / 611.2)).toBeLessThan(0.001);
  });

  // T-02
  it("coincide con Goff-Gratch dentro del 0.5 % entre −35 y +35 °C", () => {
    let worst = 0;
    for (let tc = -35; tc <= 35; tc += 0.5) {
      const t = celsiusToK(tc);
      const ref = goffGratchPa(t);
      worst = Math.max(worst, Math.abs((saturationVapourPressure(t) - ref) / ref));
    }
    // El error medido es 0.40 %, en el extremo frío. La discrepancia es en su
    // mayor parte de Goff-Gratch, que es la formulación más antigua y peor
    // acotada a baja temperatura; Bolton declara 0.1 % contra su referencia.
    expect(worst).toBeLessThan(0.005);
  });

  it("es estrictamente creciente con la temperatura", () => {
    let prev = 0;
    for (let tc = -60; tc <= 60; tc += 1) {
      const es = saturationVapourPressure(celsiusToK(tc));
      expect(es).toBeGreaterThan(prev);
      prev = es;
    }
  });

  // T-03
  it("fuera de rango devuelve valor finito Y marca OUT_OF_VALID_RANGE", () => {
    const cold = celsiusToK(-50);
    expect(Number.isFinite(saturationVapourPressure(cold))).toBe(true);
    expect(saturationVapourPressure(cold)).toBeGreaterThan(0);
    expect(checkSaturationRange(cold)?.code).toBe("OUT_OF_VALID_RANGE");
    expect(checkSaturationRange(celsiusToK(50))?.code).toBe("OUT_OF_VALID_RANGE");
  });

  it("dentro de rango no marca nada", () => {
    expect(checkSaturationRange(celsiusToK(20))).toBeNull();
    expect(checkSaturationRange(SATURATION_VALID_RANGE.minK)).toBeNull();
    expect(checkSaturationRange(SATURATION_VALID_RANGE.maxK)).toBeNull();
  });
});

describe("humedad", () => {
  it("la razón de mezcla de saturación crece con T y decrece con p", () => {
    const p = hPaToPa(900);
    expect(saturationMixingRatio(celsiusToK(30), p)).toBeGreaterThan(
      saturationMixingRatio(celsiusToK(10), p),
    );
    expect(saturationMixingRatio(celsiusToK(20), hPaToPa(700))).toBeGreaterThan(
      saturationMixingRatio(celsiusToK(20), hPaToPa(1000)),
    );
  });

  it("con rocío igual a temperatura, la humedad relativa es 1", () => {
    expect(relativeHumidity(celsiusToK(18), celsiusToK(18))).toBeCloseTo(1, 12);
  });

  it("la razón de mezcla con rocío igual a T es la de saturación", () => {
    const p = hPaToPa(900);
    expect(mixingRatio(celsiusToK(25), p)).toBeCloseTo(
      saturationMixingRatio(celsiusToK(25), p),
      15,
    );
  });

  it("la humedad específica es menor que la razón de mezcla", () => {
    const w = kgkg(0.02);
    expect(specificHumidity(w)).toBeLessThan(w);
    expect(specificHumidity(kgkg(0))).toBe(0);
  });

  it("el calor latente decrece con la temperatura", () => {
    expect(latentHeatOfVaporisation(celsiusToK(0))).toBeCloseTo(2.501e6, 0);
    expect(latentHeatOfVaporisation(celsiusToK(30))).toBeLessThan(
      latentHeatOfVaporisation(celsiusToK(0)),
    );
  });

  it("el cp del aire húmedo supera al del seco", () => {
    expect(moistHeatCapacity(0.02)).toBeGreaterThan(moistHeatCapacity(0));
  });
});
