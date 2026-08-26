import { describe, expect, it } from "vitest";
import { buildSounding } from "../../src/sounding/build.js";
import { MIN_LAYER_THICKNESS_M, findInversions } from "../../src/sounding/inversion.js";
import { celsiusToK, hPaToPa } from "../../src/units/convert.js";
import { deg, m, mps } from "../../src/units/branded.js";
import type { RawPressureLevel } from "../../src/sounding/build.js";
import type { SurfaceState } from "../../src/sounding/types.js";
import { wm2 } from "../../src/units/branded.js";
import {
  FUENTEMILANOS,
  indexOfLocalHour,
  loadFixture,
  toSoundingInput,
} from "../helpers/fixture.js";

const flatSite = { ...FUENTEMILANOS, elevationMslM: m(0) };

const surface: SurfaceState = {
  tempK: celsiusToK(25),
  dewpointK: celsiusToK(5),
  pressurePa: hPaToPa(1013),
  mslPressurePa: hPaToPa(1013),
  windSpeedMs: mps(3),
  windFromDeg: deg(270),
  shortwaveWm2: wm2(800),
  cloudCoverFrac: 0,
  cloudCoverLowFrac: 0,
  cloudCoverMidFrac: 0,
  cloudCoverHighFrac: 0,
};

/** Perfil sintético: capa mezclada hasta 2000 m e inversión de 2 K en 200 m. */
function syntheticLevels(): RawPressureLevel[] {
  const spec: [number, number, number][] = [
    // [hPa, altura MSL, temperatura °C]
    [1000, 110, 24.0],
    [950, 540, 19.8],
    [900, 990, 15.4],
    [850, 1460, 10.8],
    [800, 1950, 6.0],
    [780, 2150, 8.0], // inversión de 2 K en 200 m
    [700, 3000, 2.0],
    [600, 4200, -6.0],
  ];
  return spec.map(([hpa, z, tc]) => ({
    pressurePa: hPaToPa(hpa),
    geopotentialMslM: m(z),
    tempK: celsiusToK(tc),
    dewpointK: celsiusToK(tc - 20),
    windSpeedMs: mps(5),
    windFromDeg: deg(270),
  }));
}

describe("detección de capas estables", () => {
  const built = buildSounding({
    site: flatSite,
    timeUtc: "2026-08-18T12:00",
    surface,
    pressureLevels: syntheticLevels(),
  });

  // S-07
  it("encuentra la inversión sintética con base y techo correctos", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const inversions = findInversions(built.value).filter((l) => l.kind === "inversion");
    expect(inversions).toHaveLength(1);
    const found = inversions[0]!;
    expect(found.baseMslM).toBeCloseTo(1950, 0);
    expect(found.topMslM).toBeCloseTo(2150, 0);
    expect(found.strengthK).toBeGreaterThan(0);
    expect(found.lapseRateKPerM).toBeLessThan(0);
  });

  it("no marca la capa mezclada como estable", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    for (const layer of findInversions(built.value)) {
      expect(layer.baseMslM).toBeGreaterThanOrEqual(1950);
    }
  });

  it("respeta el techo de búsqueda", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(findInversions(built.value, m(1500))).toHaveLength(0);
  });
});

describe("capas espurias", () => {
  const fixture = loadFixture("lefm-2026-08-18-icon_eu.json");
  const built = buildSounding(toSoundingInput(fixture, indexOfLocalHour(fixture, 14)));

  it("descarta microcapas por debajo del espesor mínimo", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // Sin el filtro aparece un tramo isotermo de 21 m entre 1060 y 1081 m,
    // producto de comparar un nivel de presión con uno de altura.
    const filtered = findInversions(built.value);
    for (const layer of filtered) {
      expect(layer.topMslM - layer.baseMslM).toBeGreaterThanOrEqual(
        MIN_LAYER_THICKNESS_M,
      );
    }
    const unfiltered = findInversions(built.value, undefined, 0);
    expect(unfiltered.length).toBeGreaterThan(filtered.length);
  });

  it("en un día térmico real, la capa mezclada no aparece como estable", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // θ es casi constante de 1060 a 2094 m: capa límite bien mezclada.
    const inBl = findInversions(built.value).filter((l) => l.baseMslM < 2094);
    expect(inBl).toHaveLength(0);
  });

  it("detecta la atmósfera libre estable por encima de 700 hPa", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const stable = findInversions(built.value).filter((l) => l.kind === "stable");
    expect(stable.length).toBeGreaterThan(0);
    expect(stable[0]!.baseMslM).toBeGreaterThanOrEqual(3225);
  });
});

describe("entradas degeneradas", () => {
  it("dos niveles a la misma altura no producen división por cero", () => {
    const levels = syntheticLevels();
    const duplicated = [...levels, { ...levels[4]!, pressurePa: hPaToPa(799) }].map(
      (l, i) => (i === levels.length ? { ...l, geopotentialMslM: m(1950) } : l),
    );
    const r = buildSounding({
      site: flatSite,
      timeUtc: "2026-08-18T12:00",
      surface,
      pressureLevels: duplicated,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const layer of findInversions(r.value)) {
      expect(Number.isFinite(layer.lapseRateKPerM)).toBe(true);
    }
  });
});
