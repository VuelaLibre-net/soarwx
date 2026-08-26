import { describe, expect, it } from "vitest";
import {
  fromComponents,
  meanWind,
  shearBetween,
  toComponents,
} from "../../src/sounding/wind.js";
import { deg, m, mps } from "../../src/units/branded.js";

const W = (speed: number, from: number) => ({ speedMs: mps(speed), fromDeg: deg(from) });

describe("componentes del viento", () => {
  it("un viento del oeste sopla hacia el este", () => {
    const c = toComponents(mps(10), deg(270));
    expect(c.uMs).toBeCloseTo(10, 9);
    expect(c.vMs).toBeCloseTo(0, 9);
  });

  it("un viento del norte sopla hacia el sur", () => {
    const c = toComponents(mps(10), deg(0));
    expect(c.uMs).toBeCloseTo(0, 9);
    expect(c.vMs).toBeCloseTo(-10, 9);
  });

  it("va y vuelve para toda dirección", () => {
    for (let d = 0; d < 360; d += 7) {
      const c = toComponents(mps(12.5), deg(d));
      const back = fromComponents(c.uMs, c.vMs);
      expect(back.speedMs).toBeCloseTo(12.5, 9);
      expect(back.fromDeg).toBeCloseTo(d, 6);
    }
  });

  it("la calma no inventa dirección", () => {
    const back = fromComponents(0, 0);
    expect(back.speedMs).toBe(0);
    expect(back.fromDeg).toBe(0);
  });
});

describe("media vectorial (R-5.4)", () => {
  // S-06
  it("dos capas opuestas dan media cero, no la media de los módulos", () => {
    const mean = meanWind([
      { wind: W(10, 0), weight: 1 },
      { wind: W(10, 180), weight: 1 },
    ]);
    expect(mean.speedMs).toBeCloseTo(0, 9);
  });

  it("vientos alineados conservan módulo y dirección", () => {
    const mean = meanWind([
      { wind: W(8, 315), weight: 2 },
      { wind: W(12, 315), weight: 2 },
    ]);
    expect(mean.speedMs).toBeCloseTo(10, 9);
    expect(mean.fromDeg).toBeCloseTo(315, 6);
  });

  it("los pesos cuentan", () => {
    const mean = meanWind([
      { wind: W(10, 270), weight: 9 },
      { wind: W(10, 90), weight: 1 },
    ]);
    expect(mean.speedMs).toBeCloseTo(8, 9);
    expect(mean.fromDeg).toBeCloseTo(270, 6);
  });

  it("ignora pesos no positivos y una lista vacía no rompe", () => {
    expect(meanWind([{ wind: W(10, 270), weight: 0 }]).speedMs).toBe(0);
    expect(meanWind([]).speedMs).toBe(0);
  });
});

describe("cizalladura vectorial", () => {
  // S-06
  it("una inversión completa de dirección con el mismo módulo es cizalladura máxima", () => {
    const r = shearBetween(W(10, 0), W(10, 180), m(1000));
    expect(r.deltaMs).toBeCloseTo(20, 9);
    expect(r.shearMsPerKm).toBeCloseTo(20, 9);
  });

  it("vientos idénticos no dan cizalladura", () => {
    expect(shearBetween(W(7, 240), W(7, 240), m(1000)).deltaMs).toBeCloseTo(0, 9);
  });

  it("un cambio solo de módulo se mide bien", () => {
    const r = shearBetween(W(5, 270), W(15, 270), m(2000));
    expect(r.deltaMs).toBeCloseTo(10, 9);
    expect(r.shearMsPerKm).toBeCloseTo(5, 9);
  });

  it("un espesor nulo no divide por cero", () => {
    expect(Number.isFinite(shearBetween(W(5, 0), W(9, 90), m(0)).shearMsPerKm)).toBe(
      true,
    );
  });
});
