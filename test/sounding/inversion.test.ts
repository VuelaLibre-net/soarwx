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

/** Synthetic sounding profile: mixed layer up to 2000 m and 2 K inversion across 200 m. */
function syntheticLevels(): RawPressureLevel[] {
  const spec: [number, number, number][] = [
    // [hPa, height MSL, temperature °C]
    [1000, 110, 24.0],
    [950, 540, 19.8],
    [900, 990, 15.4],
    [850, 1460, 10.8],
    [800, 1950, 6.0],
    [780, 2150, 8.0], // 2 K inversion across 200 m
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

describe("stable layer detection", () => {
  const built = buildSounding({
    site: flatSite,
    timeUtc: "2026-08-18T12:00",
    surface,
    pressureLevels: syntheticLevels(),
  });

  // S-07
  it("identifies synthetic inversion with correct base and top altitudes", () => {
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

  it("does not flag mixed layer as stable", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    for (const layer of findInversions(built.value)) {
      expect(layer.baseMslM).toBeGreaterThanOrEqual(1950);
    }
  });

  it("respects search ceiling altitude", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(findInversions(built.value, m(1500))).toHaveLength(0);
  });
});

describe("spurious layers", () => {
  const fixture = loadFixture("lefm-2026-08-18-icon_eu.json");
  const built = buildSounding(toSoundingInput(fixture, indexOfLocalHour(fixture, 14)));

  it("filters micro-layers below minimum thickness threshold", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // Without filter, a spurious 21 m isothermal segment appears between 1060 and 1081 m,
    // caused by comparing an isobaric level with an AGL height level.
    const filtered = findInversions(built.value);
    for (const layer of filtered) {
      expect(layer.topMslM - layer.baseMslM).toBeGreaterThanOrEqual(
        MIN_LAYER_THICKNESS_M,
      );
    }
    const unfiltered = findInversions(built.value, undefined, 0);
    expect(unfiltered.length).toBeGreaterThan(filtered.length);
  });

  it("mixed layer does not appear as stable on a real thermal soaring day", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // θ is virtually constant from 1060 to 2094 m: well-mixed convective boundary layer.
    const inBl = findInversions(built.value).filter((l) => l.baseMslM < 2094);
    expect(inBl).toHaveLength(0);
  });

  it("detects stable free atmosphere above 700 hPa", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const stable = findInversions(built.value).filter((l) => l.kind === "stable");
    expect(stable.length).toBeGreaterThan(0);
    expect(stable[0]!.baseMslM).toBeGreaterThanOrEqual(3225);
  });
});

describe("degenerate inputs", () => {
  it("duplicate levels at identical altitude do not cause division by zero", () => {
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
