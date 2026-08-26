import { describe, expect, it } from "vitest";
import { criticalHeight, expectedVarioAt } from "../../src/convection/hcrit.js";
import {
  AIRCRAFT_PROFILES,
  GLIDER_CLUB,
  RASP_REFERENCE,
} from "../../src/aircraft/profiles.js";
import { m, mps } from "../../src/units/branded.js";
import { fpmToMs } from "../../src/units/convert.js";

/** Casos de la tabla 1 de Allen (2006), con el umbral de 225 fpm de DrJack. */
const ALLEN_TABLE_1: [string, number, number, number | null][] = [
  // [caso, w* (m/s), zi (m), hcrit esperado (m) o null si no hay solución]
  ["−2σ", 0.46, 53.6, null],
  ["−1σ", 1.27, 210, 106],
  ["media", 2.56, 1401, 993],
  ["+1σ", 4.08, 2819, 2167],
  ["+2σ", 5.02, 3647, 2868],
];

describe("altura crítica sobre los casos de Allen", () => {
  for (const [label, wStar, zi, expected] of ALLEN_TABLE_1) {
    if (expected === null) {
      // C-05
      it(`${label}: la térmica nunca compensa la caída`, () => {
        const r = criticalHeight(mps(wStar), m(zi), GLIDER_CLUB);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe("NO_CONVECTION");
      });
    } else {
      // C-01 a C-04
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

describe("propiedades de la altura crítica", () => {
  // C-06, P-01
  it("nunca supera zi", () => {
    for (let wStar = 0.5; wStar <= 6; wStar += 0.25) {
      for (let zi = 200; zi <= 4000; zi += 200) {
        const r = criticalHeight(mps(wStar), m(zi), GLIDER_CLUB);
        if (r.ok) expect(r.value.hcritAglM).toBeLessThanOrEqual(zi);
      }
    }
  });

  // C-07
  it("un perfil que nunca supera la caída da NO_CONVECTION, no cero", () => {
    const r = criticalHeight(mps(0.8), m(300), GLIDER_CLUB);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("NO_CONVECTION");
      expect(r.error.detail).toHaveProperty("peakClimbMs");
    }
  });

  // C-08, P-12. La sensibilidad es al **umbral**, no al hundimiento del avión:
  // desde que están separados, quien decide hasta dónde llega el techo es el
  // criterio de RASP.
  it("con un umbral menor, hcrit sube; con uno mayor, baja", () => {
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

  it("crece con w* a zi fijo", () => {
    let previous = 0;
    for (let wStar = 2; wStar <= 6; wStar += 0.5) {
      const r = criticalHeight(mps(wStar), m(2000), GLIDER_CLUB);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.hcritAglM).toBeGreaterThan(previous);
      previous = r.value.hcritAglM;
    }
  });

  it("el máximo del núcleo está en torno a un quinto de la capa", () => {
    const r = criticalHeight(mps(3), m(2000), GLIDER_CLUB);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.peakHeightAglM / 2000).toBeGreaterThan(0.15);
    expect(r.value.peakHeightAglM / 2000).toBeLessThan(0.25);
  });

  it("rechaza entradas no convectivas", () => {
    expect(criticalHeight(mps(0), m(2000), GLIDER_CLUB).ok).toBe(false);
    expect(criticalHeight(mps(3), m(0), GLIDER_CLUB).ok).toBe(false);
  });

  // La razón de ser del split: elegir velero no puede mover el techo, porque
  // el techo lo fija una convención de RASP y no la polar de nadie.
  it("no depende del velero: es idéntico en todo el catálogo", () => {
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

describe("lectura esperada de variómetro", () => {
  it("es el núcleo menos la caída del planeador", () => {
    expect(expectedVarioAt(mps(2.56), m(700), m(1401), RASP_REFERENCE)).toBeCloseTo(
      2.09 - fpmToMs(225),
      2,
    );
    expect(expectedVarioAt(mps(2.56), m(700), m(1401), GLIDER_CLUB)).toBeCloseTo(
      2.09 - GLIDER_CLUB.circlingSinkMs,
      2,
    );
  });

  it("es negativa por encima de hcrit", () => {
    const r = criticalHeight(mps(2.56), m(1401), GLIDER_CLUB);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(
      expectedVarioAt(mps(2.56), m(r.value.hcritAglM + 50), m(1401), GLIDER_CLUB),
    ).toBeLessThan(0);
  });

  it("en hcrit vale exactamente cero con la referencia de RASP", () => {
    const r = criticalHeight(mps(4.08), m(2819), RASP_REFERENCE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(
      expectedVarioAt(mps(4.08), r.value.hcritAglM, m(2819), RASP_REFERENCE),
    ).toBeCloseTo(0, 6);
  });

  // Y con un velero real no: en hcrit todavía queda ascendencia de sobra, que
  // es justo lo que el umbral de DrJack pretende exigir.
  it("en hcrit todavía es positiva con un velero real", () => {
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
