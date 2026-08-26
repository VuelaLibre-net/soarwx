import { describe, expect, it } from "vitest";
import { convectiveVelocityScale } from "../../src/convection/wstar.js";
import { GLIDER_CLUB } from "../../src/aircraft/profiles.js";
import { potentialTemperature } from "../../src/thermo/potential.js";
import { celsiusToK, hPaToPa } from "../../src/units/convert.js";
import { K, m, mps } from "../../src/units/branded.js";

const base = {
  virtualHeatFluxKMs: 0.2,
  mixingHeightAglM: m(2000),
  surfacePotentialTempK: potentialTemperature(celsiusToK(34), hPaToPa(909)),
  surfaceWindMs: mps(3),
  profile: GLIDER_CLUB,
};

const wstar = (over: Partial<typeof base> = {}) =>
  convectiveVelocityScale({ ...base, ...over });

describe("velocidad convectiva", () => {
  it("da un valor plausible para un día fuerte", () => {
    const r = wstar();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.wStarMs).toBeGreaterThan(1.5);
    expect(r.value.wStarMs).toBeLessThan(5);
    expect(r.value.suppressedByWind).toBe(false);
  });

  it("sigue la definición de Allen: (Qov·zi·g/θ)^(1/3)", () => {
    const r = wstar();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const expected = Math.cbrt((0.2 * 2000 * 9.80665) / base.surfacePotentialTempK);
    expect(r.value.wStarMs).toBeCloseTo(expected, 9);
  });

  // H-07
  it("se anula con viento por encima del corte", () => {
    const r = wstar({ surfaceWindMs: mps(13) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.wStarMs).toBe(0);
    expect(r.value.suppressedByWind).toBe(true);
  });

  // H-08
  it("no se anula justo por debajo del corte", () => {
    const r = wstar({ surfaceWindMs: mps(12.8) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.wStarMs).toBeGreaterThan(0);
    expect(r.value.suppressedByWind).toBe(false);
  });

  it("el corte lo fija el perfil de aeronave, no una constante global", () => {
    const cautious = { ...GLIDER_CLUB, maxSurfaceWindMs: mps(8) };
    const r = wstar({ surfaceWindMs: mps(9), profile: cautious });
    expect(r.ok && r.value.suppressedByWind).toBe(true);
  });

  // H-09
  it("usa temperatura potencial: el mismo flujo a distinta presión da distinto w*", () => {
    const atSeaLevel = wstar({
      surfacePotentialTempK: potentialTemperature(celsiusToK(34), hPaToPa(1013)),
    });
    const atAltitude = wstar({
      surfacePotentialTempK: potentialTemperature(celsiusToK(34), hPaToPa(700)),
    });
    expect(atSeaLevel.ok && atAltitude.ok).toBe(true);
    if (!atSeaLevel.ok || !atAltitude.ok) return;
    expect(atSeaLevel.value.wStarMs).not.toBeCloseTo(atAltitude.value.wStarMs, 4);
    // Una implementación con temperatura absoluta daría el mismo número.
    const withAbsolute = wstar({ surfacePotentialTempK: celsiusToK(34) });
    expect(withAbsolute.ok).toBe(true);
    if (withAbsolute.ok) {
      expect(withAbsolute.value.wStarMs).not.toBeCloseTo(atAltitude.value.wStarMs, 4);
    }
  });

  // H-10, P-03
  it("crece con el flujo de calor a zi fijo", () => {
    let previous = 0;
    for (let flux = 0.02; flux <= 0.4; flux += 0.02) {
      const r = wstar({ virtualHeatFluxKMs: flux });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.wStarMs).toBeGreaterThan(previous);
      previous = r.value.wStarMs;
    }
  });

  // H-10, P-04
  it("crece con zi a flujo fijo", () => {
    let previous = 0;
    for (let zi = 200; zi <= 4000; zi += 200) {
      const r = wstar({ mixingHeightAglM: m(zi) });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.wStarMs).toBeGreaterThan(previous);
      previous = r.value.wStarMs;
    }
  });

  it("escala como la raíz cúbica", () => {
    const single = wstar();
    const eightfold = wstar({ virtualHeatFluxKMs: 1.6 });
    expect(single.ok && eightfold.ok).toBe(true);
    if (!single.ok || !eightfold.ok) return;
    expect(eightfold.value.wStarMs / single.value.wStarMs).toBeCloseTo(2, 9);
  });

  // H-06
  it("sin flujo ascendente es NO_CONVECTION, no un w* negativo", () => {
    const r = wstar({ virtualHeatFluxKMs: -0.05 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NO_CONVECTION");
    expect(wstar({ virtualHeatFluxKMs: 0 }).ok).toBe(false);
  });

  it("sin capa de mezcla es NO_CONVECTION", () => {
    const r = wstar({ mixingHeightAglM: m(0) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NO_CONVECTION");
  });

  it("el corte por viento manda incluso sin flujo", () => {
    const r = wstar({ surfaceWindMs: mps(20), virtualHeatFluxKMs: -1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.suppressedByWind).toBe(true);
  });

  // P-10
  it("nunca devuelve NaN", () => {
    for (const theta of [K(250), K(300), K(320)]) {
      const r = wstar({ surfacePotentialTempK: theta });
      if (r.ok) expect(Number.isFinite(r.value.wStarMs)).toBe(true);
    }
  });
});
