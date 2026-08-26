import { describe, expect, it } from "vitest";
import {
  ZERO_CROSSING_RATIO,
  innerRadiusRatio,
  updraftMeanAt,
  updraftOuterRadius,
  updraftPeakAt,
  updraftProfile,
} from "../../src/convection/updraft.js";
import { m, mps } from "../../src/units/branded.js";

const W = mps(1); // perfiles normalizados: w* = 1 devuelve directamente el cociente

/** Máximo de una función sobre (0, top), por muestreo fino. */
function argmax(f: (x: number) => number, top: number, samples = 200000) {
  let bestX = 0;
  let bestY = -Infinity;
  for (let i = 1; i <= samples; i++) {
    const x = (top * i) / samples;
    const y = f(x);
    if (y > bestY) {
      bestY = y;
      bestX = x;
    }
  }
  return { x: bestX, y: bestY };
}

describe("perfil medio de Lenschow (Allen ec. 11)", () => {
  const zi = m(1401);

  // U-01 y U-02
  it("alcanza 0.4577·w* en z/zi = 0.2273", () => {
    const best = argmax((x) => updraftMeanAt(W, m(x * zi), zi), ZERO_CROSSING_RATIO);
    expect(best.y).toBeCloseTo(0.4577, 3);
    expect(best.x).toBeCloseTo(0.2273, 2);
  });

  // U-03
  it("cruza por cero en z/zi = 0.90909", () => {
    expect(ZERO_CROSSING_RATIO).toBeCloseTo(0.90909, 4);
    expect(updraftMeanAt(W, m(ZERO_CROSSING_RATIO * zi), zi)).toBeCloseTo(0, 9);
  });

  // U-04
  it("es negativo por encima del cruce", () => {
    expect(updraftMeanAt(W, m(0.95 * zi), zi)).toBeLessThan(0);
    expect(updraftMeanAt(W, m(1.0 * zi), zi)).toBeLessThan(0);
  });

  it("escala linealmente con w*", () => {
    const a = updraftMeanAt(mps(2), m(400), zi);
    const b = updraftMeanAt(mps(4), m(400), zi);
    expect(b / a).toBeCloseTo(2, 9);
  });

  it("es cero en el suelo y con zi no positivo", () => {
    expect(updraftMeanAt(W, m(0), zi)).toBe(0);
    expect(updraftMeanAt(W, m(100), m(0))).toBe(0);
  });
});

describe("radio de la térmica (Allen ec. 12-13)", () => {
  const zi = m(1401);

  // U-08
  it("mide 99.2 m a media capa con zi = 1401 m", () => {
    expect(updraftOuterRadius(m(0.5 * zi), zi)).toBeCloseTo(99.2, 1);
  });

  // U-09
  it("da r1/r2 = 0.249 para ese radio", () => {
    expect(innerRadiusRatio(updraftOuterRadius(m(0.5 * zi), zi))).toBeCloseTo(0.249, 3);
  });

  // U-10
  it("nunca baja de 10 m", () => {
    expect(updraftOuterRadius(m(0), zi)).toBe(10);
    expect(updraftOuterRadius(m(0.001), zi)).toBe(10);
    expect(updraftOuterRadius(m(1), m(0))).toBe(10);
  });

  it("crece con la altura en la mitad baja de la capa", () => {
    let previous = 0;
    for (let f = 0.05; f <= 0.5; f += 0.05) {
      const r = updraftOuterRadius(m(f * zi), zi);
      expect(r).toBeGreaterThan(previous);
      previous = r;
    }
  });

  it("satura el cociente interior en 0.8 para radios grandes", () => {
    expect(innerRadiusRatio(m(700))).toBe(0.8);
    expect(innerRadiusRatio(m(599))).toBeCloseTo(0.0011 * 599 + 0.14, 9);
  });
});

describe("velocidad de núcleo (Allen ec. 14-15)", () => {
  // U-05, U-06, U-07
  const cases: [number, number, number][] = [
    // [zi, máximo de w_peak/w*, altura relativa del máximo]
    [1401, 1.0707, 0.2126],
    [2000, 1.0254, 0.2061],
    [3000, 0.9544, 0.1949],
  ];

  for (const [zi, expectedPeak, expectedHeight] of cases) {
    it(`con zi = ${String(zi)} m el núcleo llega a ${String(expectedPeak)}·w*`, () => {
      const best = argmax((x) => updraftPeakAt(W, m(x * zi), m(zi)), ZERO_CROSSING_RATIO);
      expect(best.y).toBeCloseTo(expectedPeak, 3);
      expect(best.x).toBeCloseTo(expectedHeight, 2);
    });
  }

  it("el núcleo siempre supera a la media", () => {
    const zi = m(1800);
    for (let f = 0.05; f < ZERO_CROSSING_RATIO; f += 0.05) {
      const z = m(f * zi);
      expect(updraftPeakAt(W, z, zi)).toBeGreaterThan(updraftMeanAt(W, z, zi));
    }
  });

  it("a media capa con w* = 2.56 y zi = 1401 la media es 0.91 y el núcleo 2.09", () => {
    const zi = m(1401);
    const w = mps(2.56);
    expect(updraftMeanAt(w, m(0.5 * zi), zi)).toBeCloseTo(0.91, 2);
    expect(updraftPeakAt(w, m(0.5 * zi), zi)).toBeCloseTo(2.09, 2);
  });

  // U-11: la síntesis Allen ↔ DrJack
  it("el máximo del núcleo se mantiene cerca de w* en todo el rango de zi", () => {
    // Medido: [0.921 en zi = 3500 m, 1.118 en zi = 800 m]. Si sale de aquí, la
    // equivalencia entre el `w*` de DrJack y el núcleo de Allen deja de valer.
    let lowest = Infinity;
    let highest = -Infinity;
    for (let zi = 800; zi <= 3500; zi += 100) {
      const best = argmax(
        (x) => updraftPeakAt(W, m(x * zi), m(zi)),
        ZERO_CROSSING_RATIO,
        4000,
      );
      lowest = Math.min(lowest, best.y);
      highest = Math.max(highest, best.y);
    }
    expect(lowest).toBeCloseTo(0.921, 2);
    expect(highest).toBeCloseTo(1.118, 2);
    expect(lowest).toBeGreaterThan(0.9);
    expect(highest).toBeLessThan(1.16);
  });

  it("el cociente decrece al crecer zi: capas profundas, núcleo menos marcado", () => {
    const peakFor = (zi: number) =>
      argmax((x) => updraftPeakAt(W, m(x * zi), m(zi)), ZERO_CROSSING_RATIO, 4000).y;
    expect(peakFor(1000)).toBeGreaterThan(peakFor(2000));
    expect(peakFor(2000)).toBeGreaterThan(peakFor(3000));
  });
});

describe("perfil muestreado", () => {
  it("devuelve puntos ordenados desde el suelo hasta zi", () => {
    const points = updraftProfile(mps(2), m(2000));
    expect(points.length).toBeGreaterThan(50);
    expect(points[0]!.zAglM).toBe(0);
    expect(points[points.length - 1]!.zAglM).toBeCloseTo(2000, 6);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.zAglM).toBeGreaterThanOrEqual(points[i - 1]!.zAglM);
    }
  });

  it("acepta paso y techo propios", () => {
    const points = updraftProfile(mps(2), m(1000), { stepM: m(250), topFrac: 0.8 });
    expect(points.map((p) => p.zAglM)).toEqual([0, 250, 500, 750, 800]);
  });
});
