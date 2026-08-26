import { describe, expect, it } from "vitest";
import { scoreBand } from "../../src/forecast/bands.js";
import {
  DEFAULT_FACTORS,
  FACTOR_OK_THRESHOLD,
  buildFactor,
} from "../../src/forecast/factors.js";
import type { Factor, FactorId } from "../../src/forecast/factors.js";
import {
  CAPPED_CEILING_AGL_M,
  SEVERE_CAPE_JKG,
  STRONGLY_STABLE_LI,
  STRONG_WIND_MS,
  UNUSABLE_CEILING_AGL_M,
  evaluateVetoes,
  vetoCap,
} from "../../src/forecast/vetoes.js";
import { DEFAULT_LEVEL_THRESHOLDS, aggregate } from "../../src/forecast/score.js";
import { resolveScoring } from "../../src/forecast/config.js";
import { bestHour, findWindows } from "../../src/forecast/windows.js";
import { confidenceFrom } from "../../src/forecast/confidence.js";
import { capeRisk } from "../../src/stability/capeRisk.js";
import { m, mps } from "../../src/units/branded.js";

const INF = Number.POSITIVE_INFINITY;

describe("scoring bands", () => {
  const band = { idealMin: 10, idealMax: 20, zeroMin: 0, zeroMax: 30 };

  it("evaluates to 1 within ideal range", () => {
    expect(scoreBand(10, band)).toBe(1);
    expect(scoreBand(15, band)).toBe(1);
    expect(scoreBand(20, band)).toBe(1);
  });

  it("evaluates to 0 outside limits", () => {
    expect(scoreBand(0, band)).toBe(0);
    expect(scoreBand(-5, band)).toBe(0);
    expect(scoreBand(30, band)).toBe(0);
    expect(scoreBand(40, band)).toBe(0);
  });

  it("interpolates linearly along transition slopes", () => {
    expect(scoreBand(5, band)).toBeCloseTo(0.5, 9);
    expect(scoreBand(25, band)).toBeCloseTo(0.5, 9);
  });

  it("supports open-ended upper limits", () => {
    const open = { idealMin: 2, idealMax: INF, zeroMin: 0.4, zeroMax: INF };
    expect(scoreBand(100, open)).toBe(1);
    expect(scoreBand(0.4, open)).toBe(0);
    expect(scoreBand(1.2, open)).toBeCloseTo(0.5, 9);
  });
});

// V-01
describe("scoring factors", () => {
  it("each factor includes value, unit, score, weight, and band", () => {
    const factor = buildFactor("climb_strength", 2.5, DEFAULT_FACTORS.climb_strength);
    expect(factor).toMatchObject({
      id: "climb_strength",
      value: 2.5,
      unit: "m/s",
      score: 1,
      weight: 2,
      ok: true,
    });
    expect(factor.band.idealMin).toBe(2);
  });

  it("all default factors provide physical rationale", () => {
    for (const spec of Object.values(DEFAULT_FACTORS)) {
      expect(spec.rationale.length).toBeGreaterThan(40);
      expect(spec.weight).toBeGreaterThan(0);
    }
  });

  // V-03 & E-04
  it("no factor key references CAPE", () => {
    const ids = Object.keys(DEFAULT_FACTORS);
    expect(ids).not.toContain("cape");
    expect(ids.join(" ")).not.toMatch(/cape/i);
  });

  it("thermal quality uses DrJack thresholds", () => {
    expect(DEFAULT_FACTORS.thermal_quality.band.zeroMin).toBe(5);
    expect(DEFAULT_FACTORS.thermal_quality.band.idealMin).toBe(10);
  });

  it("satisfaction threshold is 0.6", () => {
    expect(buildFactor("cloud_cover", 0.8, DEFAULT_FACTORS.cloud_cover).ok).toBe(false);
    expect(FACTOR_OK_THRESHOLD).toBe(0.6);
  });
});

const factorSet = (overrides: Partial<Record<FactorId, number>> = {}): Factor[] => {
  const values: Record<FactorId, number> = {
    climb_strength: 2.6,
    usable_ceiling: 2400,
    lapse_rate: 8,
    thermal_quality: 12,
    surface_wind: 4,
    moisture: 12,
    cloud_cover: 0.2,
    ...overrides,
  };
  return (Object.keys(values) as FactorId[]).map((id) =>
    buildFactor(id, values[id], DEFAULT_FACTORS[id]),
  );
};

describe("vetoes", () => {
  const baseInput = {
    hasConvection: true,
    overcast: false,
    usableCeilingAglM: m(2400),
    liftedIndex: -3,
    cape: capeRisk(800),
    kIndex: 18,
    surfaceWindMs: 4,
  };

  // V-05
  it("perfect conditions trigger zero vetoes", () => {
    expect(evaluateVetoes(baseInput)).toEqual([]);
    const score = aggregate(factorSet(), []);
    expect(score.level).toBe(5);
    expect(score.factors.every((f) => f.ok)).toBe(true);
  });

  // V-07
  it("overcast sky caps rating at level 1", () => {
    const vetoes = evaluateVetoes({ ...baseInput, overcast: true });
    expect(vetoes.map((v) => v.id)).toContain("overcast");
    expect(vetoCap(vetoes)).toBe(1);
    expect(aggregate(factorSet(), vetoes).level).toBe(1);
  });

  it("unusable ceiling caps rating at level 2", () => {
    const vetoes = evaluateVetoes({ ...baseInput, usableCeilingAglM: m(500) });
    expect(vetoes.map((v) => v.id)).toContain("ceiling_too_low");
    expect(vetoCap(vetoes)).toBe(2);
    expect(UNUSABLE_CEILING_AGL_M).toBe(800);
  });

  // V-06
  it("strong surface wind caps rating at level 3", () => {
    const vetoes = evaluateVetoes({ ...baseInput, surfaceWindMs: 15 });
    expect(vetoes.map((v) => v.id)).toContain("wind_too_strong");
    expect(aggregate(factorSet({ surface_wind: 15 }), vetoes).level).toBeLessThanOrEqual(
      3,
    );
    expect(STRONG_WIND_MS).toBe(12.87);
  });

  // V-08
  it("severe CAPE caps rating at level 2", () => {
    const vetoes = evaluateVetoes({ ...baseInput, cape: capeRisk(3800) });
    expect(vetoes.map((v) => v.id)).toContain("cape_severe");
    expect(aggregate(factorSet(), vetoes).level).toBeLessThanOrEqual(2);
    expect(SEVERE_CAPE_JKG).toBe(3500);
  });

  it("elevated CAPE combined with stormy K-Index triggers veto", () => {
    const vetoes = evaluateVetoes({ ...baseInput, cape: capeRisk(2800), kIndex: 30 });
    expect(vetoes.map((v) => v.id)).toContain("cape_with_storm_index");
  });

  // R-10.6: LI describes stability aloft above the boundary layer, not within it.
  it("positive Lifted Index does not veto if boundary layer is deep enough", () => {
    const vetoes = evaluateVetoes({ ...baseInput, liftedIndex: 1.5 });
    expect(vetoes.map((v) => v.id)).not.toContain("stable_atmosphere");
    expect(vetoCap(vetoes)).toBe(5);
  });

  it("stable atmosphere over shallow boundary layer caps at level 3", () => {
    const vetoes = evaluateVetoes({
      ...baseInput,
      liftedIndex: 1.5,
      usableCeilingAglM: m(1200),
    });
    expect(vetoes.map((v) => v.id)).toContain("stable_atmosphere");
    expect(vetoCap(vetoes)).toBe(3);
    expect(CAPPED_CEILING_AGL_M).toBe(1500);
  });

  it("pronounced stability over shallow boundary layer caps at level 2", () => {
    const vetoes = evaluateVetoes({
      ...baseInput,
      liftedIndex: 6,
      usableCeilingAglM: m(1200),
    });
    expect(vetoes.find((v) => v.id === "stable_atmosphere")?.capsAtLevel).toBe(2);
    expect(STRONGLY_STABLE_LI).toBe(2);
  });

  // E-01 applied to forecast verdict
  it("missing index does not trigger veto: missing is not zero", () => {
    const vetoes = evaluateVetoes({ ...baseInput, liftedIndex: null });
    expect(vetoes.map((v) => v.id)).not.toContain("stable_atmosphere");
  });

  it("absence of convection caps at level 1", () => {
    const vetoes = evaluateVetoes({ ...baseInput, hasConvection: false });
    expect(vetoCap(vetoes)).toBe(1);
  });

  // V-03
  it("no parameter achieves perfect factor score and triggers a veto simultaneously", () => {
    const vetoes = evaluateVetoes({ ...baseInput, cape: capeRisk(2400) });
    const score = aggregate(factorSet(), vetoes);
    const capeInFactors = score.factors.some((f) => f.id.includes("cape"));
    expect(capeInFactors).toBe(false);
  });
});

describe("aggregation", () => {
  // V-02
  it("vetoes cap maximum level without subtracting continuous points", () => {
    const factors = factorSet();
    const withoutVeto = aggregate(factors, []);
    const withVeto = aggregate(
      factors,
      evaluateVetoes({
        hasConvection: true,
        overcast: true,
        usableCeilingAglM: m(2400),
        liftedIndex: -3,
        cape: capeRisk(0),
        kIndex: 18,
        surfaceWindMs: 4,
      }),
    );
    // Continuous score value remains unchanged: rating level is capped.
    expect(withVeto.value).toBeCloseTo(withoutVeto.value, 12);
    expect(withVeto.levelBeforeVetoes).toBe(withoutVeto.level);
    expect(withVeto.level).toBe(1);
  });

  // P-07
  it("adding a veto never raises the rating level", () => {
    const factors = factorSet();
    const none = aggregate(factors, []);
    for (const extra of [1, 2, 3] as const) {
      const capped = aggregate(factors, [
        { id: "overcast", capsAtLevel: extra, reason: "overcast" },
      ]);
      expect(capped.level).toBeLessThanOrEqual(none.level);
    }
  });

  it("level 5 rating requires all individual factors to satisfy OK threshold", () => {
    const almost = aggregate(factorSet({ moisture: 3 }), []);
    expect(almost.factors.every((f) => f.ok)).toBe(false);
    expect(almost.level).toBeLessThanOrEqual(4);
  });

  it("ranks limiting factors from worst score to best", () => {
    const score = aggregate(factorSet({ moisture: 3, cloud_cover: 0.75 }), []);
    expect(score.limitingFactors.length).toBeGreaterThan(0);
    const scores = score.limitingFactors.map(
      (id) => score.factors.find((f) => f.id === id)!.score,
    );
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeGreaterThanOrEqual(scores[i - 1]!);
    }
  });

  // P-06
  it("score value falls in [0, 1] and level falls in 1..5", () => {
    for (const climb of [0, 0.5, 1, 2, 4]) {
      for (const ceiling of [0, 500, 1500, 3000]) {
        const score = aggregate(
          factorSet({ climb_strength: climb, usable_ceiling: ceiling }),
          [],
        );
        expect(score.value).toBeGreaterThanOrEqual(0);
        expect(score.value).toBeLessThanOrEqual(1);
        expect([1, 2, 3, 4, 5]).toContain(score.level);
      }
    }
  });

  // V-09
  it("aggregation is deterministic", () => {
    const first = JSON.stringify(aggregate(factorSet(), []));
    for (let i = 0; i < 50; i++) {
      expect(JSON.stringify(aggregate(factorSet(), []))).toBe(first);
    }
  });

  it("handles empty factor list without division by zero", () => {
    expect(aggregate([], []).value).toBe(0);
  });
});

// V-04
describe("configuration", () => {
  it("modifying weights affects final level rating", () => {
    const values: Record<FactorId, number> = {
      climb_strength: 0.5,
      usable_ceiling: 2400,
      lapse_rate: 8,
      thermal_quality: 12,
      surface_wind: 4,
      moisture: 12,
      cloud_cover: 0.2,
    };
    const base = resolveScoring();
    const heavy = resolveScoring({ factors: { climb_strength: { weight: 20 } } });
    const build = (specs: typeof base.factors) =>
      aggregate(
        (Object.keys(values) as FactorId[]).map((id) =>
          buildFactor(id, values[id], specs[id]),
        ),
        [],
      );
    expect(build(heavy.factors).level).toBeLessThan(build(base.factors).level);
  });

  it("modifying a band adjusts factor score", () => {
    const lenient = resolveScoring({
      factors: {
        usable_ceiling: {
          band: { idealMin: 500, idealMax: INF, zeroMin: 100, zeroMax: INF },
        },
      },
    });
    expect(
      buildFactor("usable_ceiling", 900, lenient.factors.usable_ceiling).score,
    ).toBeGreaterThan(
      buildFactor("usable_ceiling", 900, DEFAULT_FACTORS.usable_ceiling).score,
    );
  });

  it("modifying level thresholds alters rating level", () => {
    const factors = factorSet({ climb_strength: 1.5 });
    const strict = aggregate(factors, [], [0.5, 0.7, 0.9, 0.99]);
    const loose = aggregate(factors, [], [0.1, 0.2, 0.3, 0.4]);
    expect(loose.level).toBeGreaterThan(strict.level);
    expect(DEFAULT_LEVEL_THRESHOLDS).toEqual([0.3, 0.58, 0.78, 0.9]);
  });

  it("uses default values when no config provided", () => {
    expect(resolveScoring().factors.climb_strength.weight).toBe(2);
  });
});

const hour = (timeUtc: string, level: 1 | 2 | 3 | 4 | 5, ceiling: number, climb = 2) => ({
  timeUtc,
  level,
  usableCeilingAglM: m(ceiling),
  climbMs: climb,
});

describe("soaring windows and best hour", () => {
  // W-01
  it("higher usable ceiling takes precedence over count of green factors", () => {
    const best = bestHour([hour("10:00", 4, 900, 2.4), hour("14:00", 4, 2500, 2.0)]);
    expect(best?.timeUtc).toBe("14:00");
  });

  // W-02
  it("vetoed hour is never best if non-vetoed hour exists", () => {
    const best = bestHour([hour("12:00", 2, 4000, 5), hour("14:00", 4, 1900, 2)]);
    expect(best?.timeUtc).toBe("14:00");
  });

  // W-03
  it("merges contiguous hours and discards isolated single hours", () => {
    const windows = findWindows(
      [
        hour("09:00", 2, 600),
        hour("10:00", 4, 1800),
        hour("11:00", 4, 2200),
        hour("12:00", 1, 300),
        hour("13:00", 4, 2400),
        hour("14:00", 1, 200),
      ],
      3,
    );
    expect(windows).toHaveLength(1);
    expect(windows[0]!.startUtc).toBe("10:00");
    expect(windows[0]!.endUtc).toBe("11:00");
    expect(windows[0]!.durationHours).toBe(2);
    expect(windows[0]!.peakCeilingAglM).toBe(2200);
  });

  it("soaring window reports minimum rating level", () => {
    const windows = findWindows(
      [hour("10:00", 5, 2600), hour("11:00", 3, 1800), hour("12:00", 4, 2100)],
      3,
    );
    expect(windows[0]!.minLevel).toBe(3);
  });

  // W-04
  it("returns null when no soarable hours exist", () => {
    const flat = [hour("10:00", 1, 200), hour("11:00", 1, 150)];
    expect(bestHour(flat)).toBeNull();
    expect(findWindows(flat, 3)).toEqual([]);
  });
});

// G-03, G-04
describe("confidence", () => {
  it("returns null with only a single model sample", () => {
    expect(
      confidenceFrom([{ model: "icon_eu", ceilingAglM: m(2000), wStarMs: mps(2.4) }]),
    ).toBeNull();
    expect(confidenceFrom([])).toBeNull();
  });

  it("agreeing models produce high confidence", () => {
    const c = confidenceFrom([
      { model: "icon_eu", ceilingAglM: m(2000), wStarMs: mps(2.4) },
      { model: "gfs_seamless", ceilingAglM: m(2150), wStarMs: mps(2.6) },
    ]);
    expect(c?.level).toBe("high");
    expect(c?.ceilingSpreadM).toBe(150);
    expect(c?.modelsUsed).toEqual(["icon_eu", "gfs_seamless"]);
  });

  it("diverging models lower confidence rating", () => {
    expect(
      confidenceFrom([
        { model: "a", ceilingAglM: m(1200), wStarMs: mps(1.5) },
        { model: "b", ceilingAglM: m(2600), wStarMs: mps(3.2) },
      ])?.level,
    ).toBe("low");
  });
});
