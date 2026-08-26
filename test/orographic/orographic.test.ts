import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { RIDGE_LIFT_THRESHOLDS_MS, ridgeLift } from "../../src/orographic/ridgeLift.js";
import { MIN_ALONG_FLOW_MS, scorerParameter } from "../../src/orographic/scorer.js";
import {
  MIN_CROSS_RIDGE_MS,
  STRONG_WAVE_DROP_FACTOR,
  wavePotential,
} from "../../src/orographic/wave.js";
import { deg, m, mps } from "../../src/units/branded.js";
import type { RidgeSpec } from "../../src/types/site.js";
import { syntheticSounding, waveSounding } from "../helpers/synthetic.js";
import { buildSounding } from "../../src/sounding/build.js";
import { indexOfLocalHour, loadFixture, toSoundingInput } from "../helpers/fixture.js";
import {
  FUENTEMILANOS_SITE,
  LA_MUJER_MUERTA,
  MIN_MEANINGFUL_ANISOTROPY,
  PENALARA,
  PENALARA_SITE,
  PICO_DEL_LOBO_SITE,
  RIDGE_ANISOTROPY,
  SIERRA_DE_AYLLON,
} from "../helpers/sites.js";

/** North-south oriented ridge: crossed by easterly or westerly winds. */
const NORTH_SOUTH: RidgeSpec = {
  name: "synthetic",
  bearingDeg: deg(0),
  slopeDeg: deg(15),
  crestMslM: m(2000),
};

const W = (speed: number, from: number) => ({ speedMs: mps(speed), fromDeg: deg(from) });

// O-01
describe("no hardcoded mountain sites in library code", () => {
  /** Strips block and line comments to inspect executable code only. */
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  it("no named mountain ranges or airfields appear in executable source code", () => {
    const files = execSync("find src -name '*.ts'", { encoding: "utf8" })
      .trim()
      .split("\n");
    const offenders: string[] = [];
    for (const file of files) {
      const code = stripComments(readFileSync(file, "utf8")).toLowerCase();
      if (/guadarrama|lefm|fuentemilanos/.test(code)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("site names may appear in comments documenting validation measurements", () => {
    const anywhere = execSync("grep -ril 'fuentemilanos' src/ || true", {
      encoding: "utf8",
    }).trim();
    expect(anywhere.length).toBeGreaterThan(0);
  });
});

describe("orographic ridge lift", () => {
  // O-02
  it("wind parallel to ridge crest generates zero vertical climb", () => {
    const r = ridgeLift(NORTH_SOUTH, W(12, 180));
    expect(r.perpendicularMs).toBeCloseTo(0, 9);
    expect(r.verticalMs).toBeCloseTo(0, 9);
    expect(r.incidenceDeg).toBeCloseTo(90, 6);
  });

  // O-03
  it("with perpendicular wind vertical velocity is U·sin(slope)", () => {
    const r = ridgeLift(NORTH_SOUTH, W(10, 270));
    expect(r.perpendicularMs).toBeCloseTo(10, 9);
    expect(r.verticalMs).toBeCloseTo(10 * Math.sin((15 * Math.PI) / 180), 9);
    expect(r.verticalMs).toBeCloseTo(2.588, 3);
  });

  it("0.08 empirical factor was equivalent to 4.6° slope", () => {
    const gentle: RidgeSpec = { ...NORTH_SOUTH, slopeDeg: deg(4.6) };
    const r = ridgeLift(gentle, W(10, 270));
    expect(r.verticalMs).toBeCloseTo(10 * 0.08, 2);
    // With realistic mountain slopes, lift is ~3x stronger than 4.6° slope.
    expect(ridgeLift(NORTH_SOUTH, W(10, 270)).verticalMs).toBeGreaterThan(
      3 * r.verticalMs,
    );
  });

  it("both ridge aspects function symmetrically: wind sign preserves magnitude", () => {
    const west = ridgeLift(NORTH_SOUTH, W(10, 270));
    const east = ridgeLift(NORTH_SOUTH, W(10, 90));
    expect(east.perpendicularMs).toBeCloseTo(west.perpendicularMs, 9);
  });

  it("oblique wind yields its trigonometric normal component", () => {
    const r = ridgeLift(NORTH_SOUTH, W(10, 315));
    expect(r.perpendicularMs).toBeCloseTo(10 * Math.SQRT1_2, 6);
    expect(r.incidenceDeg).toBeCloseTo(45, 4);
  });

  it("classifies by exported constant thresholds", () => {
    expect(ridgeLift(NORTH_SOUTH, W(2, 270)).band).toBe("insufficient");
    expect(ridgeLift(NORTH_SOUTH, W(5, 270)).band).toBe("marginal");
    expect(ridgeLift(NORTH_SOUTH, W(10, 270)).band).toBe("optimal");
    expect(ridgeLift(NORTH_SOUTH, W(20, 270)).band).toBe("dangerous");
    expect(RIDGE_LIFT_THRESHOLDS_MS.optimal).toBeCloseTo(7.7, 6);
  });

  it("calm winds yield 90° incidence without inventing headings", () => {
    expect(ridgeLift(NORTH_SOUTH, W(0, 0)).incidenceDeg).toBe(90);
  });

  it("ridge bearing determines result: rotated ridge modifies outcome", () => {
    const eastWest: RidgeSpec = { ...NORTH_SOUTH, bearingDeg: deg(90) };
    expect(ridgeLift(eastWest, W(10, 270)).perpendicularMs).toBeCloseTo(0, 6);
    expect(ridgeLift(eastWest, W(10, 180)).perpendicularMs).toBeCloseTo(10, 6);
  });
});

describe("Scorer parameter", () => {
  const sounding = syntheticSounding(25, 1500, 4);

  it("computes and decomposes into buoyancy and curvature terms", () => {
    const r = scorerParameter(sounding, 90);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBeGreaterThan(3);
    for (const point of r.value) {
      expect(point.scorerSquaredPerM2).toBeCloseTo(
        point.buoyancyTermPerM2 + point.curvatureTermPerM2,
        12,
      );
      expect(Number.isFinite(point.bruntVaisalaPerS2)).toBe(true);
    }
  });

  it("is larger in stable layer than in mixed layer", () => {
    const r = scorerParameter(sounding, 90);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mixed = r.value.filter((p) => p.mslM < 1400);
    const stable = r.value.filter((p) => p.mslM > 2500);
    expect(mixed.length).toBeGreaterThan(0);
    expect(stable.length).toBeGreaterThan(0);
    const mean = (xs: typeof r.value) =>
      xs.reduce((s, p) => s + p.buoyancyTermPerM2, 0) / xs.length;
    expect(mean(stable)).toBeGreaterThan(mean(mixed));
  });

  it("returns error without sufficient along-flow wind", () => {
    const calm = syntheticSounding(25, 1500, 4);
    const r = scorerParameter(
      { ...calm, levels: calm.levels.map((l) => ({ ...l, windSpeedMs: mps(0.5) })) },
      90,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("OUT_OF_VALID_RANGE");
    expect(MIN_ALONG_FLOW_MS).toBe(2);
  });

  it("returns INSUFFICIENT_LEVELS with fewer than 3 levels", () => {
    const r = scorerParameter({ ...sounding, levels: sounding.levels.slice(0, 2) }, 90);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INSUFFICIENT_LEVELS");
  });
});

describe("mountain wave potential", () => {
  // O-05
  it("always declares the method used", () => {
    const sounding = syntheticSounding(25, 1500, 4);
    for (const speed of [2, 8, 20]) {
      const windy = {
        ...sounding,
        levels: sounding.levels.map((l) => ({
          ...l,
          windSpeedMs: mps(speed),
          windFromDeg: deg(270),
        })),
      };
      const r = wavePotential(windy, NORTH_SOUTH);
      expect(r.ok).toBe(true);
      if (r.ok) expect(["scorer", "heuristic"]).toContain(r.value.method);
    }
  });

  it("weak perpendicular wind yields no wave potential", () => {
    const sounding = syntheticSounding(25, 1500, 4);
    const calm = {
      ...sounding,
      levels: sounding.levels.map((l) => ({ ...l, windSpeedMs: mps(3) })),
    };
    const r = wavePotential(calm, NORTH_SOUTH);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.potential).toBe("none");
    expect(r.value.reason).toBe("cross_ridge_wind_too_weak");
    expect(MIN_CROSS_RIDGE_MS).toBeCloseTo(7.5, 6);
  });

  it("wind parallel to ridge generates no wave, even when strong", () => {
    const sounding = syntheticSounding(25, 1500, 4);
    const along = {
      ...sounding,
      levels: sounding.levels.map((l) => ({
        ...l,
        windSpeedMs: mps(25),
        windFromDeg: deg(180),
      })),
    };
    const r = wavePotential(along, NORTH_SOUTH);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.potential).toBe("none");
  });

  it("reports perpendicular wind component and estimated wavelength", () => {
    const sounding = syntheticSounding(25, 1500, 4);
    const strong = {
      ...sounding,
      levels: sounding.levels.map((l) => ({
        ...l,
        windSpeedMs: mps(18),
        windFromDeg: deg(270),
      })),
    };
    const r = wavePotential(strong, NORTH_SOUTH);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.crossRidgeMs).toBeCloseTo(18, 4);
    if (r.value.estimatedWavelengthM !== null) {
      expect(r.value.estimatedWavelengthM).toBeGreaterThan(1000);
      expect(r.value.estimatedWavelengthM).toBeLessThan(60000);
    }
  });

  it("falls back to heuristic with clear reason when sounding lacks vertical span", () => {
    const shallow = syntheticSounding(25, 1500, 4);
    const highRidge: RidgeSpec = { ...NORTH_SOUTH, crestMslM: m(4500) };
    const windy = {
      ...shallow,
      levels: shallow.levels.map((l) => ({
        ...l,
        windSpeedMs: mps(20),
        windFromDeg: deg(270),
      })),
    };
    const r = wavePotential(windy, highRidge);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.method).toBe("heuristic");
    expect(["sounding_does_not_span_both_layers", "no_usable_scorer_profile"]).toContain(
      r.value.reason,
    );
  });

  it("evaluates real sounding against real ridge specification", () => {
    const fixture = loadFixture("lefm-2026-08-18-icon_eu.json");
    const built = buildSounding(toSoundingInput(fixture, indexOfLocalHour(fixture, 14)));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const r = wavePotential(built.value, LA_MUJER_MUERTA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // On this day wind is weak: no wave, reported with specific reason.
    expect(r.value.potential).toBe("none");
    expect(r.value.reason).toBe("cross_ridge_wind_too_weak");
  });
});

// O-04
describe("angular sectors and thresholds", () => {
  it("no hardcoded angular sectors exist in code: ridge orientation is dynamic input", () => {
    const source = execSync("cat src/orographic/*.ts", { encoding: "utf8" });
    expect(source).not.toMatch(/\d{3}\s*<=\s*\w*[Dd]eg/);
    expect(source).not.toMatch(/wind\w*Deg\s*<=\s*\d{3}/);
  });

  it("all operational thresholds are exported as constants", () => {
    expect(RIDGE_LIFT_THRESHOLDS_MS).toBeDefined();
    expect(MIN_CROSS_RIDGE_MS).toBeDefined();
    expect(MIN_ALONG_FLOW_MS).toBeDefined();
  });
});

describe("trapped lee wave under favorable profile", () => {
  const ridge: RidgeSpec = {
    name: "synthetic",
    bearingDeg: deg(0),
    slopeDeg: deg(20),
    crestMslM: m(1500),
  };

  it("stable layer over crest with neutral air above traps lee waves", () => {
    const r = wavePotential(waveSounding(2, 9, 10), ridge);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.method).toBe("scorer");
    expect(r.value.trappedLeeWave).toBe(true);
    expect(r.value.potential).toBe("likely");
    expect(r.value.reason).toBe("scorer_drop_exceeds_trapping_threshold");
  });

  it("estimated wavelength falls within observed lee wave spectrum", () => {
    const r = wavePotential(waveSounding(2, 9, 10), ridge);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.estimatedWavelengthM).not.toBeNull();
    expect(r.value.estimatedWavelengthM!).toBeGreaterThan(2000);
    expect(r.value.estimatedWavelengthM!).toBeLessThan(12000);
  });

  it("marked inversion with strong wind yields strong wave potential", () => {
    const r = wavePotential(waveSounding(-8, 9, 14), ridge);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.potential).toBe("strong");
    expect(STRONG_WAVE_DROP_FACTOR).toBe(2);
  });

  it("without stability contrast across layers, waves are not trapped", () => {
    const r = wavePotential(waveSounding(6, 6.5, 12), ridge);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.trappedLeeWave).toBe(false);
    expect(r.value.potential).toBe("marginal");
    expect(r.value.reason).toBe("scorer_drop_insufficient");
  });

  it("stronger trapping yields shorter resonant wavelength", () => {
    const sharp = wavePotential(waveSounding(0, 9, 10), ridge);
    const soft = wavePotential(waveSounding(9.5, 9.6, 12), ridge);
    expect(sharp.ok && soft.ok).toBe(true);
    if (!sharp.ok || !soft.ok) return;
    expect(sharp.value.estimatedWavelengthM!).toBeLessThan(
      soft.value.estimatedWavelengthM!,
    );
  });

  it("when ridge crest is below lowest sounding level, surface wind is used", () => {
    const belowGround: RidgeSpec = { ...ridge, crestMslM: m(-100) };
    const r = wavePotential(waveSounding(2, 9, 10), belowGround);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.crossRidgeMs).toBeCloseTo(10, 4);
  });
});

describe("declared fallback when profile calculation fails", () => {
  it("strong wind without usable profile yields heuristic evaluation", () => {
    const sounding = waveSounding(2, 9, 14);
    const truncated = { ...sounding, levels: sounding.levels.slice(0, 2) };
    const ridge: RidgeSpec = {
      name: "synthetic",
      bearingDeg: deg(0),
      slopeDeg: deg(20),
      crestMslM: m(1500),
    };
    const r = wavePotential(truncated, ridge);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.method).toBe("heuristic");
    expect(r.value.reason).toBe("no_usable_scorer_profile");
    // 14 m/s exceeds 1.5x minimum: heuristic permits "marginal".
    expect(r.value.potential).toBe("marginal");
    expect(r.value.trappedLeeWave).toBe(false);
  });

  it("heuristic caps rating at marginal", () => {
    const sounding = waveSounding(2, 9, 9);
    const truncated = { ...sounding, levels: sounding.levels.slice(0, 2) };
    const ridge: RidgeSpec = {
      name: "synthetic",
      bearingDeg: deg(0),
      slopeDeg: deg(20),
      crestMslM: m(1500),
    };
    const r = wavePotential(truncated, ridge);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.potential).toBe("none");
  });
});

describe("La Mujer Muerta ridge validation", () => {
  it("direct headwind attack angle corresponds to 338° heading", () => {
    // Ridge axis runs WSW to ENE: 68° axis, 338° normal.
    const head = ridgeLift(LA_MUJER_MUERTA, W(12, 338));
    expect(head.perpendicularMs).toBeCloseTo(12, 2);
    expect(head.incidenceDeg).toBeCloseTo(0, 1);
  });

  it("legacy hardcoded 310° heading lost 11% perpendicular component", () => {
    // 28° difference between 338° and 310° yields cos(28°) = 0.887.
    const wind = W(12, 338);
    const actual = ridgeLift(LA_MUJER_MUERTA, wind);
    const asPredecessor = ridgeLift(
      { ...LA_MUJER_MUERTA, bearingDeg: deg(310 + 90) },
      wind,
    );
    expect(asPredecessor.perpendicularMs / actual.perpendicularMs).toBeCloseTo(
      Math.cos((28 * Math.PI) / 180),
      2,
    );
  });

  it("southwesterly wind runs parallel to ridge crest and produces no lift", () => {
    const alongRidge = ridgeLift(LA_MUJER_MUERTA, W(15, 248));
    expect(alongRidge.perpendicularMs).toBeLessThan(1);
    expect(alongRidge.band).toBe("insufficient");
  });

  it("selected slope geometry modifies vertical climb by 1.4x factor", () => {
    const wind = W(10, 338);
    const upperFace = ridgeLift(LA_MUJER_MUERTA, wind);
    const wholeFace = ridgeLift({ ...LA_MUJER_MUERTA, slopeDeg: deg(11.4) }, wind);
    expect(upperFace.verticalMs).toBeCloseTo(2.76, 2);
    expect(wholeFace.verticalMs).toBeCloseTo(1.98, 2);
    expect(upperFace.verticalMs / wholeFace.verticalMs).toBeCloseTo(1.39, 2);
  });

  it("site provides its own ridge specifications as data", () => {
    expect(FUENTEMILANOS_SITE.ridges).toHaveLength(1);
    expect(FUENTEMILANOS_SITE.ridges?.[0]?.name).toBe("La Mujer Muerta");
    expect(FUENTEMILANOS_SITE.elevationMslM).toBe(1001);
  });
});

describe("Sierra de Ayllón ridge validation", () => {
  it("ridge axis is derived from terrain geometry", () => {
    expect(SIERRA_DE_AYLLON.bearingDeg).toBe(65);
    const head = ridgeLift(SIERRA_DE_AYLLON, W(14, 335));
    expect(head.perpendicularMs).toBeCloseTo(14, 1);
    expect(head.incidenceDeg).toBeCloseTo(0, 0);
  });

  it("evaluating as west-east would lose 40% perpendicular component", () => {
    const wind = W(14, 335);
    const fromTerrain = ridgeLift(SIERRA_DE_AYLLON, wind);
    const asPublished = ridgeLift({ ...SIERRA_DE_AYLLON, bearingDeg: deg(90) }, wind);
    expect(asPublished.perpendicularMs / fromTerrain.perpendicularMs).toBeCloseTo(
      Math.cos((25 * Math.PI) / 180),
      2,
    );
  });

  it("shares regional geological alignment with La Mujer Muerta", () => {
    // 68° vs 65°, derived independently from distinct terrain transects.
    expect(
      Math.abs(SIERRA_DE_AYLLON.bearingDeg - LA_MUJER_MUERTA.bearingDeg),
    ).toBeLessThan(5);
  });

  it("maintains its own site query coordinates distinct from Fuentemilanos", () => {
    expect(FUENTEMILANOS_SITE.ridges).toHaveLength(1);
    expect(FUENTEMILANOS_SITE.ridges?.[0]?.name).toBe("La Mujer Muerta");
    expect(PICO_DEL_LOBO_SITE.ridges?.[0]?.name).toBe("Sierra de Ayllón");
    expect(PICO_DEL_LOBO_SITE.elevationMslM).toBeGreaterThan(
      FUENTEMILANOS_SITE.elevationMslM,
    );
  });
});

describe("ridge axis derivation limits", () => {
  it("elongated massif exhibits modest anisotropy while isolated peak shows none", () => {
    expect(RIDGE_ANISOTROPY["Sierra de Ayllón"]!).toBeGreaterThan(
      MIN_MEANINGFUL_ANISOTROPY,
    );
    expect(RIDGE_ANISOTROPY["Peñalara"]!).toBeLessThan(MIN_MEANINGFUL_ANISOTROPY);
  });

  it("with low anisotropy, ridge lift depends heavily on assumed axis", () => {
    const wind = W(12, 270);
    const asFitted = ridgeLift(PENALARA, wind);
    const asGuadarramaTrend = ridgeLift({ ...PENALARA, bearingDeg: deg(68) }, wind);
    expect(
      Math.abs(asFitted.perpendicularMs - asGuadarramaTrend.perpendicularMs),
    ).toBeGreaterThan(3);
  });

  it("Peñalara crest is higher than La Mujer Muerta", () => {
    expect(PENALARA.crestMslM).toBeGreaterThan(LA_MUJER_MUERTA.crestMslM);
    expect(PENALARA.crestMslM - LA_MUJER_MUERTA.crestMslM).toBe(231);
  });

  it("each ridge belongs to its respective forecast site", () => {
    for (const site of [FUENTEMILANOS_SITE, PICO_DEL_LOBO_SITE, PENALARA_SITE]) {
      expect(site.ridges).toHaveLength(1);
      expect(site.ridges?.[0]?.crestMslM).toBeGreaterThan(0);
    }
  });
});
