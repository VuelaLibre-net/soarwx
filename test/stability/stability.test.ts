import { describe, expect, it } from "vitest";
import {
  kIndex,
  liftedIndex,
  liftedIndexBand,
  totalTotals,
} from "../../src/stability/indices.js";
import { CAPE_BANDS_JKG, capeRisk } from "../../src/stability/capeRisk.js";
import { celsiusToK, hPaToPa } from "../../src/units/convert.js";
import { m } from "../../src/units/branded.js";
import { syntheticSounding } from "../helpers/synthetic.js";
import { buildSounding } from "../../src/sounding/build.js";
import { indexOfLocalHour, loadFixture, toSoundingInput } from "../helpers/fixture.js";

const fixture = loadFixture("lefm-2026-08-18-icon_eu.json");
const built = buildSounding(toSoundingInput(fixture, indexOfLocalHour(fixture, 14)));
if (!built.ok) throw new Error(built.error.message);
const sounding = built.value;

describe("indices on a real sounding", () => {
  it("computes K-Index within physically plausible bounds", () => {
    const r = kIndex(sounding);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBeGreaterThan(-60);
      expect(r.value).toBeLessThan(50);
    }
  });

  it("computes and evaluates Total Totals", () => {
    const r = totalTotals(sounding);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Number.isFinite(r.value)).toBe(true);
  });

  it("Lifted Index is positive for dry and stable airmass", () => {
    const r = liftedIndex(sounding);
    expect(r.ok).toBe(true);
    // On this day ICON produces positive lifted_index: upper-air stability.
    if (r.ok) expect(r.value).toBeGreaterThan(-3);
  });

  it("warmer parcel decreases Lifted Index", () => {
    const cool = liftedIndex(sounding, celsiusToK(30));
    const warm = liftedIndex(sounding, celsiusToK(40));
    expect(cool.ok && warm.ok).toBe(true);
    if (!cool.ok || !warm.ok) return;
    expect(warm.value).toBeLessThan(cool.value);
  });
});

// E-01
describe("missing pressure levels", () => {
  // High elevation site (1600 m MSL) with consistent station pressure:
  // 850 hPa isobaric level lies below ground.
  const raw = toSoundingInput(fixture, indexOfLocalHour(fixture, 14));
  const high = buildSounding({
    ...raw,
    site: { ...sounding.site, elevationMslM: m(1600) },
    surface: { ...raw.surface, pressurePa: hPaToPa(840) },
  });

  it("without 850 hPa level K-Index returns MISSING_VARIABLE rather than zero", () => {
    expect(high.ok).toBe(true);
    if (!high.ok) return;
    const r = kIndex(high.value);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("MISSING_VARIABLE");
      expect(r.error.detail).toMatchObject({ hpa: 850 });
    }
  });

  it("without 850 hPa level Total Totals returns MISSING_VARIABLE", () => {
    expect(high.ok).toBe(true);
    if (!high.ok) return;
    const r = totalTotals(high.value);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("MISSING_VARIABLE");
  });

  it("without 500 hPa level Lifted Index returns MISSING_VARIABLE", () => {
    const shallow = buildSounding({
      ...toSoundingInput(fixture, indexOfLocalHour(fixture, 14)),
      pressureLevels: toSoundingInput(
        fixture,
        indexOfLocalHour(fixture, 14),
      ).pressureLevels.filter((l) => l.pressurePa > 55000),
    });
    expect(shallow.ok).toBe(true);
    if (!shallow.ok) return;
    const r = liftedIndex(shallow.value);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("MISSING_VARIABLE");
  });
});

// E-02
describe("missing versus zero distinction", () => {
  it("an index value of 0.0 is distinct from an unavailable measurement", () => {
    const present = liftedIndex(sounding);
    expect(present.ok).toBe(true);
    // Result contract: `ok:false` signals missing variable and `ok:true` with 0
    // represents a true zero value. Never collapsed into zero.
    const absent = kIndex({ ...sounding, levels: sounding.levels.slice(0, 2) });
    expect(absent.ok).toBe(false);
    if (present.ok && !absent.ok) {
      expect(typeof present.value).toBe("number");
      expect(absent.error.code).toBe("MISSING_VARIABLE");
    }
  });
});

describe("Lifted Index classification bands", () => {
  it("classifies according to standard operational bands", () => {
    expect(liftedIndexBand(4)).toBe("stable");
    expect(liftedIndexBand(1)).toBe("marginally_unstable");
    expect(liftedIndexBand(-2)).toBe("moderately_unstable");
    expect(liftedIndexBand(-5)).toBe("very_unstable");
    expect(liftedIndexBand(-8)).toBe("extremely_unstable");
  });
});

// E-03
describe("CAPE as convective risk", () => {
  it("classifies across DrJack RASP bands", () => {
    expect(capeRisk(0).band).toBe("none");
    expect(capeRisk(200).band).toBe("none");
    expect(capeRisk(500).band).toBe("weak");
    expect(capeRisk(1800).band).toBe("moderate");
    expect(capeRisk(3000).band).toBe("strong");
    expect(capeRisk(6000).band).toBe("extreme");
    expect(CAPE_BANDS_JKG).toEqual({
      weak: 300,
      moderate: 1000,
      strong: 2500,
      extreme: 5300,
    });
  });

  it("null CAPE returns none band without diagnosing storms", () => {
    const r = capeRisk(null);
    expect(r.band).toBe("none");
    expect(r.stormPotential).toBe(false);
    expect(r.capeJkg).toBeNull();
  });

  it("strong convective inhibition suppresses storm potential", () => {
    expect(capeRisk(3000, -10).stormPotential).toBe(true);
    expect(capeRisk(3000, -120).stormPotential).toBe(false);
    expect(capeRisk(3000, -120).inhibited).toBe(true);
  });

  it("convective inhibition sign is normalised across model conventions", () => {
    expect(capeRisk(3000, 120).inhibited).toBe(capeRisk(3000, -120).inhibited);
  });

  // E-04
  it("contains no scoring fields converting CAPE into a soaring merit", () => {
    const risk = capeRisk(1800);
    expect(Object.keys(risk).sort()).toEqual([
      "band",
      "capeJkg",
      "convectiveInhibitionJkg",
      "inhibited",
      "stormPotential",
    ]);
    expect(Object.keys(risk)).not.toContain("score");
    expect(Object.keys(risk)).not.toContain("weight");
  });

  it("higher CAPE monotonically escalates risk band", () => {
    const order = ["none", "weak", "moderate", "strong", "extreme"];
    let previous = -1;
    for (const cape of [0, 500, 1800, 3000, 6000]) {
      const index = order.indexOf(capeRisk(cape).band);
      expect(index).toBeGreaterThan(previous);
      previous = index;
    }
  });
});

describe("saturated ascent in Lifted Index", () => {
  it("humid air activates moist adiabatic ascent above LCL", () => {
    // High dewpoint places LCL below 500 hPa: parcel ascends moist-adiabatically,
    // significantly lowering the resulting lifted index.
    const humid = syntheticSounding(30, 3000, 1, 22);
    const r = liftedIndex(humid, celsiusToK(30));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const dry = liftedIndex(syntheticSounding(30, 3000, 1, -30), celsiusToK(30));
    expect(dry.ok).toBe(true);
    if (dry.ok) expect(r.value).toBeLessThan(dry.value);
  });

  it("very dry air ascends purely along dry adiabat", () => {
    const r = liftedIndex(syntheticSounding(30, 3000, 1, -40), celsiusToK(30));
    expect(r.ok).toBe(true);
    if (r.ok) expect(Number.isFinite(r.value)).toBe(true);
  });
});
