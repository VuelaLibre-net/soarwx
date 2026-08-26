import { describe, expect, it } from "vitest";
import { buildSounding, maxGapBelow } from "../../src/sounding/build.js";
import { hPaToPa } from "../../src/units/convert.js";
import { m } from "../../src/units/branded.js";
import {
  FUENTEMILANOS,
  indexOfLocalHour,
  loadFixture,
  toSoundingInput,
} from "../helpers/fixture.js";
import type { SoundingQuality } from "../../src/sounding/types.js";

const fixture = loadFixture("lefm-2026-08-18-icon_eu.json");
const noon = indexOfLocalHour(fixture, 14);
const input = toSoundingInput(fixture, noon);

describe("buildSounding on real Fuentemilanos forecast data", () => {
  const built = buildSounding(input);

  it("builds successfully", () => {
    expect(built.ok).toBe(true);
  });

  // S-01
  it("discards four sub-surface levels and retains six aloft levels", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.quality.levelsDiscardedBelowGround).toBe(4);
    expect(built.value.quality.pressureLevelsUsed).toBe(6);
  });

  // S-02
  it("38 °C value from 1000 hPa level never enters the sounding", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // That level sits at 136 m geopotential height, far below site elevation (1001 m).
    for (const level of built.value.levels) {
      expect(level.geopotentialMslM).toBeGreaterThanOrEqual(FUENTEMILANOS.elevationMslM);
      expect(level.pressurePa).toBeLessThanOrEqual(input.surface.pressurePa);
    }
    const pressures = built.value.levels.map((l) => Math.round(l.pressurePa / 100));
    expect(pressures).not.toContain(1000);
    expect(pressures).not.toContain(975);
    expect(pressures).not.toContain(950);
    expect(pressures).not.toContain(925);
  });

  // S-03
  it("levels are ordered by strictly descending pressure", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    for (let i = 1; i < built.value.levels.length; i++) {
      expect(built.value.levels[i]!.pressurePa).toBeLessThan(
        built.value.levels[i - 1]!.pressurePa,
      );
    }
  });

  it("incorporates all three AGL height levels", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.quality.heightLevelsUsed).toBe(3);
    expect(built.value.quality.levelsUsed).toBe(10); // 1 surface + 3 height + 6 pressure
    expect(built.value.quality.estimated).toContain("height_level_dewpoint");
  });

  it("height levels are interleaved between surface and 850 hPa", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const heights = built.value.levels
      .filter((l) => l.source === "height_level")
      .map((l) => l.geopotentialMslM);
    expect(heights).toEqual([m(1081), m(1121), m(1181)]);
  });

  // S-02b
  it("declares maximum vertical gap correctly", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // Between 700 hPa (3225 m) and 600 hPa (4485 m): 1260 m gap.
    // This represents actual vertical resolution and is declared explicitly.
    expect(built.value.quality.maxVerticalGapM).toBeCloseTo(1260, 0);
    expect(built.value.quality.gapWindowTopAglM).toBe(3500);
  });

  it("gap can be re-evaluated below a specific ceiling", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // Below expected boundary layer (~2100 m MSL) largest gap is 850 to 800 hPa: 528 m.
    expect(maxGapBelow(built.value, m(2094))).toBeCloseTo(528, 0);
    // In lowest 200 m, height levels reduce gap to tens of metres.
    expect(maxGapBelow(built.value, m(1181))).toBeLessThan(80);
  });

  it("declares offset between surface pressure and model geopotential column", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // Open-Meteo downscales `surface_pressure` to requested elevation but not
    // `geopotential_height_*hPa`: surface pressure sits ~37 m below where model
    // column places it. Declared explicitly without silent mutation.
    expect(built.value.quality.surfacePressureOffsetM).toBeCloseTo(36.9, 0);
  });

  it("stores station surface pressure and sea-level pressure (QNH) separately", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.surface.pressurePa).toBeLessThan(
      built.value.surface.mslPressurePa,
    );
  });
});

describe("buildSounding edge cases", () => {
  // S-04
  it("returns INSUFFICIENT_LEVELS with fewer than three pressure levels aloft", () => {
    const scarce = {
      ...input,
      pressureLevels: input.pressureLevels.filter((l) => l.pressurePa <= hPaToPa(600)),
    };
    const r = buildSounding(scarce);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("INSUFFICIENT_LEVELS");
    const quality = r.error.detail?.["quality"] as SoundingQuality;
    expect(quality.usable).toBe(false);
    expect(quality.pressureLevelsUsed).toBe(2);
  });

  it("higher elevation site filters out more isobaric levels", () => {
    const high = buildSounding({
      ...input,
      site: { ...FUENTEMILANOS, elevationMslM: m(1600) },
    });
    expect(high.ok).toBe(true);
    if (!high.ok) return;
    // At 1600 m MSL, 900 hPa (1060 m) and 850 hPa (1566 m) are also discarded.
    expect(high.value.quality.levelsDiscardedBelowGround).toBe(6);
    expect(high.value.quality.pressureLevelsUsed).toBe(4);
  });

  // P-09
  it("input ordering does not affect resulting sounding", () => {
    const shuffled = {
      ...input,
      pressureLevels: [...input.pressureLevels].reverse(),
      heightLevels: [...(input.heightLevels ?? [])].reverse(),
    };
    const a = buildSounding(input);
    const b = buildSounding(shuffled);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.value.levels).toEqual(a.value.levels);
    expect(b.value.quality).toEqual(a.value.quality);
  });

  it("sounding remains valid without height levels", () => {
    const r = buildSounding({ ...input, heightLevels: [] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.quality.heightLevelsUsed).toBe(0);
    expect(r.value.quality.estimated).not.toContain("height_level_dewpoint");
  });
});

describe("options and degenerate cases", () => {
  it("accepts custom minimum pressure level count", () => {
    const scarce = {
      ...input,
      pressureLevels: input.pressureLevels.filter((l) => l.pressurePa <= hPaToPa(600)),
      options: { minPressureLevels: 2 },
    };
    const r = buildSounding(scarce);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.quality.pressureLevelsUsed).toBe(2);
  });

  it("accepts custom gap analysis window top", () => {
    const r = buildSounding({ ...input, options: { gapWindowTopAglM: m(1200) } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.quality.gapWindowTopAglM).toBe(1200);
    // Up to 2201 m MSL largest gap is 850 to 800 hPa: 528 m.
    expect(r.value.quality.maxVerticalGapM).toBeCloseTo(528, 0);
  });

  it("duplicate pressure levels do not cause division by zero in offset", () => {
    const duplicated = input.pressureLevels.map((l) =>
      l.pressurePa < hPaToPa(900) ? l : { ...l, pressurePa: hPaToPa(900) },
    );
    const r = buildSounding({ ...input, pressureLevels: duplicated });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Number.isFinite(r.value.quality.surfacePressureOffsetM)).toBe(true);
  });

  it("propagates list of missing variables", () => {
    const r = buildSounding({ ...input, missing: ["lifted_index"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.quality.missing).toEqual(["lifted_index"]);
  });
});
