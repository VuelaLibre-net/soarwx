import { describe, expect, it } from "vitest";
import { lcl, lclTemperature } from "../../src/thermo/lcl.js";
import { saturationVapourPressure } from "../../src/thermo/saturation.js";
import { celsiusToK, hPaToPa, kToCelsius } from "../../src/units/convert.js";
import { romps2017LclHeightM } from "../golden/romps.js";
import { K } from "../../src/units/branded.js";

/** Dewpoint from relative humidity by inverting Bolton eq. 10. */
function dewpointFromRh(tempK: number, rhFrac: number): number {
  const pv = rhFrac * saturationVapourPressure(K(tempK));
  const lnr = Math.log(pv / 611.2);
  return celsiusToK((243.5 * lnr) / (17.67 - lnr));
}

describe("LCL", () => {
  it("with saturated air LCL is at parcel level itself", () => {
    const t = celsiusToK(18);
    const r = lcl(t, t, hPaToPa(900));
    expect(r.heightAboveParcelM).toBeCloseTo(0, 6);
    expect(r.tempK).toBeCloseTo(t, 6);
    expect(r.pressurePa).toBeCloseTo(hPaToPa(900), 3);
  });

  it("LCL temperature never exceeds parcel temperature", () => {
    for (let tc = -20; tc <= 45; tc += 5) {
      for (let spread = 0; spread <= 30; spread += 5) {
        const t = celsiusToK(tc);
        const td = celsiusToK(tc - spread);
        expect(lclTemperature(t, td)).toBeLessThanOrEqual(t + 1e-9);
      }
    }
  });

  it("LCL rises as dewpoint spread increases", () => {
    const t = celsiusToK(30);
    let prev = -1;
    for (let spread = 0; spread <= 30; spread += 2) {
      const z = lcl(t, celsiusToK(30 - spread), hPaToPa(900)).heightAboveParcelM;
      expect(z).toBeGreaterThan(prev);
      prev = z;
    }
  });

  it("LCL pressure is lower than parcel pressure", () => {
    const r = lcl(celsiusToK(30), celsiusToK(10), hPaToPa(900));
    expect(r.pressurePa).toBeLessThan(hPaToPa(900));
  });

  // T-06
  it("matches Romps (2017) within 20 m across the full grid", () => {
    let worstM = 0;
    let worstFracAboveFloor = 0;
    for (let tc = -20; tc <= 45; tc += 2.5) {
      for (let rh = 10; rh <= 99; rh += 2) {
        const t = celsiusToK(tc);
        const p = hPaToPa(900);
        const bolton = lcl(t, K(dewpointFromRh(t, rh / 100)), p).heightAboveParcelM;
        const exact = romps2017LclHeightM(p, t, rh / 100);
        worstM = Math.max(worstM, Math.abs(bolton - exact));
        if (exact > 500) {
          worstFracAboveFloor = Math.max(
            worstFracAboveFloor,
            Math.abs((bolton - exact) / exact),
          );
        }
      }
    }
    // Measured: 17.1 m worst absolute error at −20 °C with 10 % RH
    // on a 2836 m LCL. Relative error reaches 1.28 %, but only where LCL
    // is tens of metres and absolute error is 0.7 m: hence absolute error
    // is the metric that matters.
    expect(worstM).toBeLessThan(20);
    expect(worstFracAboveFloor).toBeLessThan(0.015);
  });

  // Espy's rule used by predecessor, kept to document bias.
  it("Espy's 122 m/°C rule falls short at high temperature", () => {
    const t = celsiusToK(40);
    const td = celsiusToK(38);
    const exact = lcl(t, td, hPaToPa(1000)).heightAboveParcelM;
    const espy = 122 * (kToCelsius(t) - kToCelsius(td));
    expect(espy).toBeLessThan(exact);
    expect((espy - exact) / exact).toBeLessThan(-0.03);
  });
});
