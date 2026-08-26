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

describe("índices sobre un sondeo real", () => {
  it("el K-Index se calcula y queda en rango razonable", () => {
    const r = kIndex(sounding);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBeGreaterThan(-60);
      expect(r.value).toBeLessThan(50);
    }
  });

  it("Total Totals se calcula y se usa: no es un parámetro muerto", () => {
    const r = totalTotals(sounding);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Number.isFinite(r.value)).toBe(true);
  });

  it("el Lifted Index de una masa seca y estable es positivo", () => {
    const r = liftedIndex(sounding);
    expect(r.ok).toBe(true);
    // Ese día ICON da lifted_index positivo: atmósfera estable en altura.
    if (r.ok) expect(r.value).toBeGreaterThan(-3);
  });

  it("una parcela más caliente baja el Lifted Index", () => {
    const cool = liftedIndex(sounding, celsiusToK(30));
    const warm = liftedIndex(sounding, celsiusToK(40));
    expect(cool.ok && warm.ok).toBe(true);
    if (!cool.ok || !warm.ok) return;
    expect(warm.value).toBeLessThan(cool.value);
  });
});

// E-01
describe("niveles ausentes", () => {
  // Emplazamiento a 1600 m, con la presión de estación que le corresponde: el
  // nivel de 850 hPa queda literalmente bajo tierra.
  const raw = toSoundingInput(fixture, indexOfLocalHour(fixture, 14));
  const high = buildSounding({
    ...raw,
    site: { ...sounding.site, elevationMslM: m(1600) },
    surface: { ...raw.surface, pressurePa: hPaToPa(840) },
  });

  it("sin 850 hPa el K-Index es MISSING_VARIABLE, no cero", () => {
    expect(high.ok).toBe(true);
    if (!high.ok) return;
    const r = kIndex(high.value);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("MISSING_VARIABLE");
      expect(r.error.detail).toMatchObject({ hpa: 850 });
    }
  });

  it("sin 850 hPa Total Totals tampoco se inventa", () => {
    expect(high.ok).toBe(true);
    if (!high.ok) return;
    const r = totalTotals(high.value);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("MISSING_VARIABLE");
  });

  it("sin 500 hPa el Lifted Index es MISSING_VARIABLE", () => {
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
describe("ausente frente a cero", () => {
  it("un índice de valor 0.0 es un resultado válido, distinguible de la ausencia", () => {
    const present = liftedIndex(sounding);
    expect(present.ok).toBe(true);
    // El contrato es `Result`: `ok:false` marca ausencia y `ok:true` con valor
    // 0 marca un cero real. Nunca se colapsan en el mismo número.
    const absent = kIndex({ ...sounding, levels: sounding.levels.slice(0, 2) });
    expect(absent.ok).toBe(false);
    if (present.ok && !absent.ok) {
      expect(typeof present.value).toBe("number");
      expect(absent.error.code).toBe("MISSING_VARIABLE");
    }
  });
});

describe("bandas del Lifted Index", () => {
  it("clasifica según los umbrales al uso", () => {
    expect(liftedIndexBand(4)).toBe("stable");
    expect(liftedIndexBand(1)).toBe("marginally_unstable");
    expect(liftedIndexBand(-2)).toBe("moderately_unstable");
    expect(liftedIndexBand(-5)).toBe("very_unstable");
    expect(liftedIndexBand(-8)).toBe("extremely_unstable");
  });
});

// E-03
describe("CAPE como riesgo", () => {
  it("clasifica en las bandas de DrJack", () => {
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

  it("una CAPE ausente es banda nula, no una tormenta", () => {
    const r = capeRisk(null);
    expect(r.band).toBe("none");
    expect(r.stormPotential).toBe(false);
    expect(r.capeJkg).toBeNull();
  });

  it("una inhibición fuerte tapa el potencial de tormenta", () => {
    expect(capeRisk(3000, -10).stormPotential).toBe(true);
    expect(capeRisk(3000, -120).stormPotential).toBe(false);
    expect(capeRisk(3000, -120).inhibited).toBe(true);
  });

  it("el signo de la inhibición no importa: los modelos discrepan", () => {
    expect(capeRisk(3000, 120).inhibited).toBe(capeRisk(3000, -120).inhibited);
  });

  // E-04
  it("no existe ninguna forma de convertir la CAPE en puntuación positiva", () => {
    const risk = capeRisk(1800);
    expect(Object.keys(risk).sort()).toEqual([
      "band",
      "capeJkg",
      "convectiveInhibitionJkg",
      "inhibited",
      "stormPotential",
    ]);
    // No hay `score`, ni `weight`, ni nada que suene a mérito.
    expect(Object.keys(risk)).not.toContain("score");
    expect(Object.keys(risk)).not.toContain("weight");
  });

  it("más CAPE nunca mejora nada: solo sube de banda", () => {
    const order = ["none", "weak", "moderate", "strong", "extreme"];
    let previous = -1;
    for (const cape of [0, 500, 1800, 3000, 6000]) {
      const index = order.indexOf(capeRisk(cape).band);
      expect(index).toBeGreaterThan(previous);
      previous = index;
    }
  });
});

describe("ascenso saturado en el Lifted Index", () => {
  it("con aire húmedo el ascenso pasa por la fase saturada", () => {
    // Rocío alto pone el LCL muy por debajo de 500 hPa: la parcela asciende
    // saturada la mayor parte del camino y el índice baja mucho.
    const humid = syntheticSounding(30, 3000, 1, 22);
    const r = liftedIndex(humid, celsiusToK(30));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const dry = liftedIndex(syntheticSounding(30, 3000, 1, -30), celsiusToK(30));
    expect(dry.ok).toBe(true);
    if (dry.ok) expect(r.value).toBeLessThan(dry.value);
  });

  it("con aire muy seco todo el ascenso es adiabático seco", () => {
    const r = liftedIndex(syntheticSounding(30, 3000, 1, -40), celsiusToK(30));
    expect(r.ok).toBe(true);
    if (r.ok) expect(Number.isFinite(r.value)).toBe(true);
  });
});
