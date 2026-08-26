import { describe, expect, it } from "vitest";
import {
  WORKING_THERMAL_INDEX_K,
  superadiabaticExcessK,
  thermalIndexAt,
  thermalTop,
} from "../../src/convection/thermalIndex.js";
import { buildSounding } from "../../src/sounding/build.js";
import { celsiusToK, kToCelsius } from "../../src/units/convert.js";
import { K, m } from "../../src/units/branded.js";
import { syntheticSounding } from "../helpers/synthetic.js";
import {
  indexOfLocalHour,
  loadFixture,
  series,
  seriesMax,
  times,
  toSoundingInput,
} from "../helpers/fixture.js";

describe("thermal index", () => {
  const sounding = syntheticSounding(30, 2000, 3);

  it("is negative inside the mixed layer and positive above", () => {
    const below = thermalIndexAt(sounding, celsiusToK(30), m(1500));
    const above = thermalIndexAt(sounding, celsiusToK(30), m(2600));
    expect(below.ok && below.value).toBeLessThan(0);
    expect(above.ok && above.value).toBeGreaterThan(0);
  });

  // P-05
  it("changes sign exactly once below the capping inversion", () => {
    let changes = 0;
    let previous: number | null = null;
    for (let z = 100; z <= 2600; z += 25) {
      const ti = thermalIndexAt(sounding, celsiusToK(30), m(z));
      if (!ti.ok) continue;
      const sign = Math.sign(ti.value);
      if (previous !== null && sign !== previous && sign !== 0) changes++;
      previous = sign;
    }
    expect(changes).toBe(1);
  });

  it("a warmer parcel yields more negative thermal index values", () => {
    const cool = thermalIndexAt(sounding, celsiusToK(28), m(1500));
    const warm = thermalIndexAt(sounding, celsiusToK(32), m(1500));
    expect(cool.ok && warm.ok).toBe(true);
    if (!cool.ok || !warm.ok) return;
    expect(warm.value).toBeLessThan(cool.value);
  });

  it("propagates interpolation error when querying outside sounding bounds", () => {
    const r = thermalIndexAt(sounding, celsiusToK(30), m(9000));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("OUT_OF_VALID_RANGE");
  });
});

describe("thermal ceiling via parcel method", () => {
  // B-01
  it("finds ceiling within the layer containing the inversion", () => {
    const sounding = syntheticSounding(30, 2000, 3);
    const r = thermalTop(sounding, celsiusToK(30));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Inversion starts at 2000 m, with bracket levels at 1760 and 2030 m:
    // the ceiling falls inside that layer.
    expect(r.value.topAglM).toBeGreaterThan(1700);
    expect(r.value.topAglM).toBeLessThan(2100);
    expect(r.value.method).toBe("parcel");
  });

  // B-02
  it("working ceiling sits below absolute ceiling", () => {
    // With parcel 3 K above profile, thermal index reaches −2 K
    // inside the mixed layer and working top decouples from absolute top.
    const r = thermalTop(syntheticSounding(30, 2000, 3), celsiusToK(33));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.workingTopAglM).toBeLessThan(r.value.topAglM);
    expect(WORKING_THERMAL_INDEX_K).toBe(-2);
  });

  it("working ceiling matches absolute ceiling when TI never reaches −2 K", () => {
    const r = thermalTop(syntheticSounding(30, 2000, 3), celsiusToK(30));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.workingTopAglM).toBeCloseTo(r.value.topAglM, 6);
  });

  it("higher inversion yields higher thermal ceiling", () => {
    const low = thermalTop(syntheticSounding(30, 1500, 3), celsiusToK(30));
    const high = thermalTop(syntheticSounding(30, 2500, 3), celsiusToK(30));
    expect(low.ok && high.ok).toBe(true);
    if (!low.ok || !high.ok) return;
    expect(high.value.topAglM).toBeGreaterThan(low.value.topAglM);
  });

  it("identifies stable layer capping convective ascent", () => {
    const r = thermalTop(syntheticSounding(30, 2000, 3), celsiusToK(30));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.cappedByInversion).not.toBeNull();
    expect(r.value.cappedByInversion?.kind).toBe("inversion");
  });

  it("returns NO_CONVECTION without positive buoyancy above surface", () => {
    const stable = syntheticSounding(30, 0, 5);
    const r = thermalTop(stable, celsiusToK(20));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NO_CONVECTION");
  });

  it("flags OUT_OF_VALID_RANGE when parcel stays buoyant beyond sounding top", () => {
    const r = thermalTop(syntheticSounding(30, 6000, 0), celsiusToK(60));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("OUT_OF_VALID_RANGE");
  });

  it("returns INSUFFICIENT_LEVELS for empty soundings", () => {
    const sounding = syntheticSounding(30, 2000, 3);
    const r = thermalTop({ ...sounding, levels: [] }, celsiusToK(30));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INSUFFICIENT_LEVELS");
  });
});

describe("surface layer superadiabatic excess", () => {
  const fixture = loadFixture("lefm-2026-08-18-icon_eu.json");
  const noon = buildSounding(toSoundingInput(fixture, indexOfLocalHour(fixture, 14)));
  const morning = buildSounding(toSoundingInput(fixture, indexOfLocalHour(fixture, 8)));

  it("at midday surface potential temp is ~2.1 K above mixed layer", () => {
    expect(noon.ok).toBe(true);
    if (!noon.ok) return;
    expect(superadiabaticExcessK(noon.value)).toBeCloseTo(2.13, 1);
  });

  it("in early morning the superadiabatic excess is small or zero", () => {
    expect(morning.ok).toBe(true);
    if (!morning.ok) return;
    expect(superadiabaticExcessK(morning.value)).toBeLessThan(1);
  });

  it("is never negative", () => {
    expect(noon.ok).toBe(true);
    if (!noon.ok) return;
    expect(superadiabaticExcessK(noon.value, m(50))).toBeGreaterThanOrEqual(0);
  });

  it("mixed layer ceiling is more conservative than surface parcel ceiling", () => {
    expect(noon.ok).toBe(true);
    if (!noon.ok) return;
    const tmax = seriesMax(fixture, "temperature_2m");
    const r = thermalTop(noon.value, celsiusToK(tmax));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Discounting 2.13 K excess lowers the ceiling by ~800 m (3357 m vs 2584 m).
    expect(r.value.mixedLayerTopAglM).toBeLessThan(r.value.topAglM);
    expect(r.value.topAglM - r.value.mixedLayerTopAglM).toBeGreaterThan(400);
  });
});

describe("diurnal evolution on real forecast data", () => {
  const gfs = loadFixture("lefm-2026-08-18-gfs_seamless.json");

  it("thermal top grows during morning and disappears at nightfall", () => {
    const tops: number[] = [];
    for (const hour of [10, 12, 14, 16]) {
      const built = buildSounding(toSoundingInput(gfs, indexOfLocalHour(gfs, hour)));
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      const r = thermalTop(built.value, built.value.surface.tempK);
      expect(r.ok).toBe(true);
      if (r.ok) tops.push(r.value.topAglM);
    }
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i]!).toBeGreaterThan(tops[i - 1]!);
    }

    const night = buildSounding(toSoundingInput(gfs, indexOfLocalHour(gfs, 20)));
    expect(night.ok).toBe(true);
    if (!night.ok) return;
    const r = thermalTop(night.value, night.value.surface.tempK);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NO_CONVECTION");
  });

  it("evaluated temperature determines behavior: with daily max, ceiling does not evolve", () => {
    // When passed daily maximum, classical method computes the daily peak ceiling.
    const tmax = K(seriesMax(gfs, "temperature_2m") + 273.15);
    const tops: number[] = [];
    for (const hour of [10, 14, 18]) {
      const built = buildSounding(toSoundingInput(gfs, indexOfLocalHour(gfs, hour)));
      if (!built.ok) return;
      const r = thermalTop(built.value, tmax);
      if (r.ok) tops.push(r.value.topAglM);
    }
    expect(tops).toHaveLength(3);
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(500);
    expect(Math.min(...tops)).toBeGreaterThan(3000);
  });
});

describe("comparison with model boundary layer diagnosis", () => {
  const gfs = loadFixture("lefm-2026-08-18-gfs_seamless.json");
  const blh = series(gfs, "boundary_layer_height");
  const sw = series(gfs, "shortwave_radiation");

  // B-04
  it("boundary_layer_height peaks when thermals are already decaying", () => {
    const peakIndex = blh.reduce<number>(
      (best, value, i) => ((value ?? -1) > (blh[best] ?? -1) ? i : best),
      0,
    );
    const localHour = Number(times(gfs)[peakIndex]!.slice(11, 13));
    expect(localHour).toBe(18);
    // At 18:00 solar radiation has already fallen almost 30 % from daily peak.
    const maxSw = Math.max(...sw.map((v) => v ?? 0));
    expect((sw[peakIndex] ?? 0) / maxSw).toBeLessThan(0.75);
  });

  // B-03
  it("parcel ceiling and model boundary layer are exposed separately", () => {
    const i = indexOfLocalHour(gfs, 14);
    const built = buildSounding(toSoundingInput(gfs, i));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const r = thermalTop(built.value, built.value.surface.tempK);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(kToCelsius(built.value.surface.tempK)).toBeGreaterThan(30);
    expect(r.value.topAglM).toBeGreaterThan(2000);
    expect(blh[i]).toBeGreaterThan(2000);
  });
});
