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

describe("puntuación por bandas", () => {
  const band = { idealMin: 10, idealMax: 20, zeroMin: 0, zeroMax: 30 };

  it("vale 1 dentro de la banda ideal", () => {
    expect(scoreBand(10, band)).toBe(1);
    expect(scoreBand(15, band)).toBe(1);
    expect(scoreBand(20, band)).toBe(1);
  });

  it("vale 0 fuera de los extremos", () => {
    expect(scoreBand(0, band)).toBe(0);
    expect(scoreBand(-5, band)).toBe(0);
    expect(scoreBand(30, band)).toBe(0);
    expect(scoreBand(40, band)).toBe(0);
  });

  it("interpola linealmente en las rampas", () => {
    expect(scoreBand(5, band)).toBeCloseTo(0.5, 9);
    expect(scoreBand(25, band)).toBeCloseTo(0.5, 9);
  });

  it("acepta bandas abiertas por arriba", () => {
    const open = { idealMin: 2, idealMax: INF, zeroMin: 0.4, zeroMax: INF };
    expect(scoreBand(100, open)).toBe(1);
    expect(scoreBand(0.4, open)).toBe(0);
    expect(scoreBand(1.2, open)).toBeCloseTo(0.5, 9);
  });
});

// V-01
describe("factores", () => {
  it("cada factor trae valor, unidad, puntuación, peso y banda", () => {
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

  it("todos los factores por defecto justifican su banda", () => {
    for (const spec of Object.values(DEFAULT_FACTORS)) {
      expect(spec.rationale.length).toBeGreaterThan(40);
      expect(spec.weight).toBeGreaterThan(0);
    }
  });

  // V-03 y E-04
  it("ninguna clave de factor menciona la CAPE", () => {
    const ids = Object.keys(DEFAULT_FACTORS);
    expect(ids).not.toContain("cape");
    expect(ids.join(" ")).not.toMatch(/cape/i);
  });

  it("la calidad de térmica usa los umbrales de DrJack", () => {
    expect(DEFAULT_FACTORS.thermal_quality.band.zeroMin).toBe(5);
    expect(DEFAULT_FACTORS.thermal_quality.band.idealMin).toBe(10);
  });

  it("el umbral de cumplimiento es 0.6", () => {
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

describe("vetos", () => {
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
  it("un día perfecto no dispara ninguno", () => {
    expect(evaluateVetoes(baseInput)).toEqual([]);
    const score = aggregate(factorSet(), []);
    expect(score.level).toBe(5);
    expect(score.factors.every((f) => f.ok)).toBe(true);
  });

  // V-07
  it("el cielo cerrado topa en 1", () => {
    const vetoes = evaluateVetoes({ ...baseInput, overcast: true });
    expect(vetoes.map((v) => v.id)).toContain("overcast");
    expect(vetoCap(vetoes)).toBe(1);
    expect(aggregate(factorSet(), vetoes).level).toBe(1);
  });

  it("un techo inservible topa en 2", () => {
    const vetoes = evaluateVetoes({ ...baseInput, usableCeilingAglM: m(500) });
    expect(vetoes.map((v) => v.id)).toContain("ceiling_too_low");
    expect(vetoCap(vetoes)).toBe(2);
    expect(UNUSABLE_CEILING_AGL_M).toBe(800);
  });

  // V-06
  it("el viento fuerte topa en 3", () => {
    const vetoes = evaluateVetoes({ ...baseInput, surfaceWindMs: 15 });
    expect(vetoes.map((v) => v.id)).toContain("wind_too_strong");
    expect(aggregate(factorSet({ surface_wind: 15 }), vetoes).level).toBeLessThanOrEqual(
      3,
    );
    expect(STRONG_WIND_MS).toBe(12.87);
  });

  // V-08
  it("una CAPE severa topa en 2", () => {
    const vetoes = evaluateVetoes({ ...baseInput, cape: capeRisk(3800) });
    expect(vetoes.map((v) => v.id)).toContain("cape_severe");
    expect(aggregate(factorSet(), vetoes).level).toBeLessThanOrEqual(2);
    expect(SEVERE_CAPE_JKG).toBe(3500);
  });

  it("una CAPE alta con K-Index tormentoso también", () => {
    const vetoes = evaluateVetoes({ ...baseInput, cape: capeRisk(2800), kIndex: 30 });
    expect(vetoes.map((v) => v.id)).toContain("cape_with_storm_index");
  });

  // R-10.6: el LI describe la atmósfera sobre la capa límite, no dentro de ella.
  it("un LI positivo no veta si la capa convectiva da de sí", () => {
    const vetoes = evaluateVetoes({ ...baseInput, liftedIndex: 1.5 });
    expect(vetoes.map((v) => v.id)).not.toContain("stable_atmosphere");
    expect(vetoCap(vetoes)).toBe(5);
  });

  it("la atmósfera estable sobre una capa corta topa en 3", () => {
    const vetoes = evaluateVetoes({
      ...baseInput,
      liftedIndex: 1.5,
      usableCeilingAglM: m(1200),
    });
    expect(vetoes.map((v) => v.id)).toContain("stable_atmosphere");
    expect(vetoCap(vetoes)).toBe(3);
    expect(CAPPED_CEILING_AGL_M).toBe(1500);
  });

  it("una estabilidad franca sobre una capa corta topa en 2", () => {
    const vetoes = evaluateVetoes({
      ...baseInput,
      liftedIndex: 6,
      usableCeilingAglM: m(1200),
    });
    expect(vetoes.find((v) => v.id === "stable_atmosphere")?.capsAtLevel).toBe(2);
    expect(STRONGLY_STABLE_LI).toBe(2);
  });

  // E-01 aplicado al veredicto
  it("un índice ausente no veta: ausente no es cero", () => {
    const vetoes = evaluateVetoes({ ...baseInput, liftedIndex: null });
    expect(vetoes.map((v) => v.id)).not.toContain("stable_atmosphere");
  });

  it("sin convección topa en 1", () => {
    const vetoes = evaluateVetoes({ ...baseInput, hasConvection: false });
    expect(vetoCap(vetoes)).toBe(1);
  });

  // V-03
  it("ningún valor saca nota máxima y dispara un veto a la vez", () => {
    // 2400 J/kg sacaba nota máxima en el predecesor y estaba a 100 de un veto.
    const vetoes = evaluateVetoes({ ...baseInput, cape: capeRisk(2400) });
    const score = aggregate(factorSet(), vetoes);
    const capeInFactors = score.factors.some((f) => f.id.includes("cape"));
    expect(capeInFactors).toBe(false);
  });
});

describe("agregación", () => {
  // V-02
  it("los vetos topan, no restan", () => {
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
    // La puntuación no cambia: lo que cambia es el nivel.
    expect(withVeto.value).toBeCloseTo(withoutVeto.value, 12);
    expect(withVeto.levelBeforeVetoes).toBe(withoutVeto.level);
    expect(withVeto.level).toBe(1);
  });

  // P-07
  it("añadir un veto nunca sube el nivel", () => {
    const factors = factorSet();
    const none = aggregate(factors, []);
    for (const extra of [1, 2, 3] as const) {
      const capped = aggregate(factors, [
        { id: "overcast", capsAtLevel: extra, reason: "overcast" },
      ]);
      expect(capped.level).toBeLessThanOrEqual(none.level);
    }
  });

  it("el nivel 5 exige todos los factores cumplidos", () => {
    const almost = aggregate(factorSet({ moisture: 3 }), []);
    expect(almost.factors.every((f) => f.ok)).toBe(false);
    expect(almost.level).toBeLessThanOrEqual(4);
  });

  it("lista los factores limitantes de peor a mejor", () => {
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
  it("la puntuación cae en [0,1] y el nivel en {1..5}", () => {
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
  it("es determinista", () => {
    const first = JSON.stringify(aggregate(factorSet(), []));
    for (let i = 0; i < 50; i++) {
      expect(JSON.stringify(aggregate(factorSet(), []))).toBe(first);
    }
  });

  it("sin factores no divide por cero", () => {
    expect(aggregate([], []).value).toBe(0);
  });
});

// V-04
describe("configuración", () => {
  it("cambiar un peso cambia el nivel: no es decorativa", () => {
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

  it("cambiar una banda cambia la puntuación", () => {
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

  it("cambiar los umbrales de nivel cambia el nivel", () => {
    const factors = factorSet({ climb_strength: 1.5 });
    const strict = aggregate(factors, [], [0.5, 0.7, 0.9, 0.99]);
    const loose = aggregate(factors, [], [0.1, 0.2, 0.3, 0.4]);
    expect(loose.level).toBeGreaterThan(strict.level);
    expect(DEFAULT_LEVEL_THRESHOLDS).toEqual([0.3, 0.58, 0.78, 0.9]);
  });

  it("sin configuración usa los valores por defecto", () => {
    expect(resolveScoring().factors.climb_strength.weight).toBe(2);
  });
});

const hour = (timeUtc: string, level: 1 | 2 | 3 | 4 | 5, ceiling: number, climb = 2) => ({
  timeUtc,
  level,
  usableCeilingAglM: m(ceiling),
  climbMs: climb,
});

describe("ventanas y mejor hora", () => {
  // W-01
  it("gana el techo alto, no el número de factores en verde", () => {
    const best = bestHour([hour("10:00", 4, 900, 2.4), hour("14:00", 4, 2500, 2.0)]);
    expect(best?.timeUtc).toBe("14:00");
  });

  // W-02
  it("una hora vetada nunca es la mejor si hay otra sin vetar", () => {
    const best = bestHour([hour("12:00", 2, 4000, 5), hour("14:00", 4, 1900, 2)]);
    expect(best?.timeUtc).toBe("14:00");
  });

  // W-03
  it("funde las contiguas y descarta las aisladas", () => {
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

  it("la ventana declara su nivel mínimo", () => {
    const windows = findWindows(
      [hour("10:00", 5, 2600), hour("11:00", 3, 1800), hour("12:00", 4, 2100)],
      3,
    );
    expect(windows[0]!.minLevel).toBe(3);
  });

  // W-04
  it("sin horas volables no devuelve la menos mala", () => {
    const flat = [hour("10:00", 1, 200), hour("11:00", 1, 150)];
    expect(bestHour(flat)).toBeNull();
    expect(findWindows(flat, 3)).toEqual([]);
  });
});

// G-03, G-04
describe("confianza", () => {
  it("con un solo modelo es null, no un valor inventado", () => {
    expect(
      confidenceFrom([{ model: "icon_eu", ceilingAglM: m(2000), wStarMs: mps(2.4) }]),
    ).toBeNull();
    expect(confidenceFrom([])).toBeNull();
  });

  it("modelos que concuerdan dan confianza alta", () => {
    const c = confidenceFrom([
      { model: "icon_eu", ceilingAglM: m(2000), wStarMs: mps(2.4) },
      { model: "gfs_seamless", ceilingAglM: m(2150), wStarMs: mps(2.6) },
    ]);
    expect(c?.level).toBe("high");
    expect(c?.ceilingSpreadM).toBe(150);
    expect(c?.modelsUsed).toEqual(["icon_eu", "gfs_seamless"]);
  });

  it("modelos que discrepan bajan la confianza", () => {
    expect(
      confidenceFrom([
        { model: "a", ceilingAglM: m(1200), wStarMs: mps(1.5) },
        { model: "b", ceilingAglM: m(2600), wStarMs: mps(3.2) },
      ])?.level,
    ).toBe("low");
  });
});
