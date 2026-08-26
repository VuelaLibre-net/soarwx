import { describe, expect, it } from "vitest";
import { dryAdiabaticLift, moistAdiabaticLift } from "../../src/thermo/parcel.js";
import { saturationMixingRatio } from "../../src/thermo/saturation.js";
import { celsiusToK, hPaToPa } from "../../src/units/convert.js";
import { Pa } from "../../src/units/branded.js";
import { thetaEK } from "../golden/thetaE.js";

describe("dry adiabatic lift", () => {
  // T-05
  it("round-trips exactly", () => {
    const t = celsiusToK(22);
    const p1 = hPaToPa(950);
    const p2 = hPaToPa(600);
    const back = dryAdiabaticLift(dryAdiabaticLift(t, p1, p2), p2, p1);
    expect(Math.abs(back - t)).toBeLessThan(1e-9);
  });

  it("cools on ascent and warms on descent", () => {
    const t = celsiusToK(20);
    expect(dryAdiabaticLift(t, hPaToPa(900), hPaToPa(700))).toBeLessThan(t);
    expect(dryAdiabaticLift(t, hPaToPa(900), hPaToPa(1000))).toBeGreaterThan(t);
  });
});

describe("pseudoadiabatic lift", () => {
  it("does not change if target matches origin", () => {
    const t = celsiusToK(15);
    const r = moistAdiabaticLift(t, hPaToPa(850), hPaToPa(850));
    expect(r.ok && r.value).toBe(t);
  });

  it("cools more slowly than dry adiabatic", () => {
    const t = celsiusToK(20);
    const from = hPaToPa(900);
    const to = hPaToPa(600);
    const moist = moistAdiabaticLift(t, from, to);
    expect(moist.ok).toBe(true);
    if (moist.ok) expect(moist.value).toBeGreaterThan(dryAdiabaticLift(t, from, to));
  });

  // T-07
  it("conserves Bolton's θe within 0.5 K from 900 to 500 hPa", () => {
    for (const tc of [5, 10, 15, 20, 25, 30]) {
      const p0 = hPaToPa(900);
      const t0 = celsiusToK(tc);
      const te0 = thetaEK(t0, p0, saturationMixingRatio(t0, p0), t0);

      for (const hpa of [800, 700, 600, 500]) {
        const p1 = hPaToPa(hpa);
        const r = moistAdiabaticLift(t0, p0, p1);
        expect(r.ok).toBe(true);
        if (!r.ok) continue;
        const te1 = thetaEK(r.value, p1, saturationMixingRatio(r.value, p1), r.value);
        // Measured: maximum drift is 0.495 K, at 30 °C up to 500 hPa.
        expect(Math.abs(te1 - te0)).toBeLessThan(0.5);
      }
    }
  });

  it("descent reverses ascent within tolerance", () => {
    const t = celsiusToK(18);
    const up = moistAdiabaticLift(t, hPaToPa(900), hPaToPa(700));
    expect(up.ok).toBe(true);
    if (!up.ok) return;
    const down = moistAdiabaticLift(up.value, hPaToPa(700), hPaToPa(900));
    expect(down.ok).toBe(true);
    if (down.ok) expect(Math.abs(down.value - t)).toBeLessThan(0.05);
  });

  // T-08
  it("returns NOT_CONVERGED with unreachable tolerance, not a bad number", () => {
    const r = moistAdiabaticLift(celsiusToK(25), hPaToPa(900), hPaToPa(500), {
      tolK: 1e-15,
      minStepPa: Pa(1000),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("NOT_CONVERGED");
      expect(r.error.detail).toHaveProperty("requiredStepPa");
    }
  });

  it("reduces step size and continues when initial step is too coarse", () => {
    const r = moistAdiabaticLift(celsiusToK(25), hPaToPa(950), hPaToPa(500), {
      maxStepPa: Pa(20000),
      tolK: 1e-9,
    });
    expect(r.ok).toBe(true);
    // Result should match fine-step run: adaptation converges to same value.
    const fine = moistAdiabaticLift(celsiusToK(25), hPaToPa(950), hPaToPa(500), {
      maxStepPa: Pa(100),
      tolK: 1e-9,
    });
    expect(fine.ok).toBe(true);
    if (r.ok && fine.ok) expect(Math.abs(r.value - fine.value)).toBeLessThan(1e-4);
  });

  it("returns NOT_CONVERGED when iteration limit is reached", () => {
    const r = moistAdiabaticLift(celsiusToK(20), hPaToPa(950), hPaToPa(400), {
      maxStepPa: Pa(10),
      maxIterations: 3,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("NOT_CONVERGED");
      expect(r.error.detail).toMatchObject({ iterations: 3 });
    }
  });

  it("rejects non-positive pressures", () => {
    const r = moistAdiabaticLift(celsiusToK(20), Pa(0), hPaToPa(500));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("OUT_OF_VALID_RANGE");
  });
});
