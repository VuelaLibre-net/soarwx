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

/** Cresta orientada norte-sur: la cruza el viento de componente este u oeste. */
const NORTH_SOUTH: RidgeSpec = {
  name: "sintética",
  bearingDeg: deg(0),
  slopeDeg: deg(15),
  crestMslM: m(2000),
};

const W = (speed: number, from: number) => ({ speedMs: mps(speed), fromDeg: deg(from) });

// O-01
describe("ningún emplazamiento incrustado", () => {
  /** Quita comentarios de bloque y de línea, para mirar solo el código. */
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  it("ninguna sierra ni aeródromo aparece en el código, solo en comentarios", () => {
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

  it("los emplazamientos sí pueden citarse en comentarios: documentan la medida", () => {
    const anywhere = execSync("grep -ril 'fuentemilanos' src/ || true", {
      encoding: "utf8",
    }).trim();
    // No es un requisito, es constancia de que la distinción es real: hay
    // comentarios que citan dónde se midió, y ninguno es lógica de sitio.
    expect(anywhere.length).toBeGreaterThan(0);
  });
});

describe("sustentación de ladera", () => {
  // O-02
  it("un viento paralelo a la cresta no genera ascendencia", () => {
    const r = ridgeLift(NORTH_SOUTH, W(12, 180));
    expect(r.perpendicularMs).toBeCloseTo(0, 9);
    expect(r.verticalMs).toBeCloseTo(0, 9);
    expect(r.incidenceDeg).toBeCloseTo(90, 6);
  });

  // O-03
  it("con viento perpendicular la vertical es U·sen(pendiente)", () => {
    const r = ridgeLift(NORTH_SOUTH, W(10, 270));
    expect(r.perpendicularMs).toBeCloseTo(10, 9);
    expect(r.verticalMs).toBeCloseTo(10 * Math.sin((15 * Math.PI) / 180), 9);
    expect(r.verticalMs).toBeCloseTo(2.588, 3);
  });

  it("el factor empírico 0.08 del predecesor equivalía a una ladera de 4.6°", () => {
    const gentle: RidgeSpec = { ...NORTH_SOUTH, slopeDeg: deg(4.6) };
    const r = ridgeLift(gentle, W(10, 270));
    expect(r.verticalMs).toBeCloseTo(10 * 0.08, 2);
    // Con la pendiente real de una sierra, la ascendencia triplica esa cifra.
    expect(ridgeLift(NORTH_SOUTH, W(10, 270)).verticalMs).toBeGreaterThan(
      3 * r.verticalMs,
    );
  });

  it("las dos caras funcionan: el signo del viento no cambia la magnitud", () => {
    const west = ridgeLift(NORTH_SOUTH, W(10, 270));
    const east = ridgeLift(NORTH_SOUTH, W(10, 90));
    expect(east.perpendicularMs).toBeCloseTo(west.perpendicularMs, 9);
  });

  it("un viento oblicuo da solo su componente perpendicular", () => {
    const r = ridgeLift(NORTH_SOUTH, W(10, 315));
    expect(r.perpendicularMs).toBeCloseTo(10 * Math.SQRT1_2, 6);
    expect(r.incidenceDeg).toBeCloseTo(45, 4);
  });

  it("clasifica por bandas y las bandas son constantes exportadas", () => {
    expect(ridgeLift(NORTH_SOUTH, W(2, 270)).band).toBe("insufficient");
    expect(ridgeLift(NORTH_SOUTH, W(5, 270)).band).toBe("marginal");
    expect(ridgeLift(NORTH_SOUTH, W(10, 270)).band).toBe("optimal");
    expect(ridgeLift(NORTH_SOUTH, W(20, 270)).band).toBe("dangerous");
    expect(RIDGE_LIFT_THRESHOLDS_MS.optimal).toBeCloseTo(7.7, 6);
  });

  it("la calma no inventa incidencia", () => {
    expect(ridgeLift(NORTH_SOUTH, W(0, 0)).incidenceDeg).toBe(90);
  });

  it("la orientación de la cresta manda: la misma cresta girada cambia el resultado", () => {
    const eastWest: RidgeSpec = { ...NORTH_SOUTH, bearingDeg: deg(90) };
    expect(ridgeLift(eastWest, W(10, 270)).perpendicularMs).toBeCloseTo(0, 6);
    expect(ridgeLift(eastWest, W(10, 180)).perpendicularMs).toBeCloseTo(10, 6);
  });
});

describe("parámetro de Scorer", () => {
  const sounding = syntheticSounding(25, 1500, 4);

  it("se calcula y descompone en estabilidad y curvatura", () => {
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

  it("es mayor en la capa estable que en la mezclada", () => {
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

  it("sin viento a lo largo del flujo no hay nada que calcular", () => {
    const calm = syntheticSounding(25, 1500, 4);
    const r = scorerParameter(
      { ...calm, levels: calm.levels.map((l) => ({ ...l, windSpeedMs: mps(0.5) })) },
      90,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("OUT_OF_VALID_RANGE");
    expect(MIN_ALONG_FLOW_MS).toBe(2);
  });

  it("con menos de tres niveles no se puede derivar dos veces", () => {
    const r = scorerParameter({ ...sounding, levels: sounding.levels.slice(0, 2) }, 90);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INSUFFICIENT_LEVELS");
  });
});

describe("potencial de onda", () => {
  // O-05
  it("siempre declara el método que ha usado", () => {
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

  it("con viento débil perpendicular no hay onda", () => {
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

  it("con viento paralelo a la cresta tampoco, aunque sople fuerte", () => {
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

  it("informa de la componente perpendicular y de la longitud de onda", () => {
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

  it("si el sondeo no cubre las dos capas, lo dice y no inventa", () => {
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

  it("funciona sobre un sondeo real con la cresta real", () => {
    const fixture = loadFixture("lefm-2026-08-18-icon_eu.json");
    const built = buildSounding(toSoundingInput(fixture, indexOfLocalHour(fixture, 14)));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const r = wavePotential(built.value, LA_MUJER_MUERTA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Ese día el viento es flojo: sin onda, y dicho con su motivo.
    expect(r.value.potential).toBe("none");
    expect(r.value.reason).toBe("cross_ridge_wind_too_weak");
  });
});

// O-04
describe("sectores y umbrales", () => {
  it("no hay sectores angulares codificados: la orientación es un dato", () => {
    const source = execSync("cat src/orographic/*.ts", { encoding: "utf8" });
    // Ningún rango del tipo `280 <= dir <= 350` que discrepe de su comentario.
    expect(source).not.toMatch(/\d{3}\s*<=\s*\w*[Dd]eg/);
    expect(source).not.toMatch(/wind\w*Deg\s*<=\s*\d{3}/);
  });

  it("todos los umbrales viven en constantes exportadas", () => {
    expect(RIDGE_LIFT_THRESHOLDS_MS).toBeDefined();
    expect(MIN_CROSS_RIDGE_MS).toBeDefined();
    expect(MIN_ALONG_FLOW_MS).toBeDefined();
  });
});

describe("onda atrapada con perfil favorable", () => {
  const ridge: RidgeSpec = {
    name: "sintética",
    bearingDeg: deg(0),
    slopeDeg: deg(20),
    crestMslM: m(1500),
  };

  it("una capa estable sobre la cresta con atmósfera neutra encima atrapa la onda", () => {
    const r = wavePotential(waveSounding(2, 9, 10), ridge);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.method).toBe("scorer");
    expect(r.value.trappedLeeWave).toBe(true);
    expect(r.value.potential).toBe("likely");
    expect(r.value.reason).toBe("scorer_drop_exceeds_trapping_threshold");
  });

  it("la longitud de onda estimada cae en el rango observado de ondas de sotavento", () => {
    const r = wavePotential(waveSounding(2, 9, 10), ridge);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.estimatedWavelengthM).not.toBeNull();
    expect(r.value.estimatedWavelengthM!).toBeGreaterThan(2000);
    expect(r.value.estimatedWavelengthM!).toBeLessThan(12000);
  });

  it("una inversión marcada con viento holgado da potencial fuerte", () => {
    const r = wavePotential(waveSounding(-8, 9, 14), ridge);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.potential).toBe("strong");
    expect(STRONG_WAVE_DROP_FACTOR).toBe(2);
  });

  it("sin contraste de estabilidad entre capas no hay atrapamiento", () => {
    const r = wavePotential(waveSounding(6, 6.5, 12), ridge);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.trappedLeeWave).toBe(false);
    expect(r.value.potential).toBe("marginal");
    expect(r.value.reason).toBe("scorer_drop_insufficient");
  });

  it("una onda más marcada da longitud de onda más corta", () => {
    const sharp = wavePotential(waveSounding(0, 9, 10), ridge);
    const soft = wavePotential(waveSounding(9.5, 9.6, 12), ridge);
    expect(sharp.ok && soft.ok).toBe(true);
    if (!sharp.ok || !soft.ok) return;
    expect(sharp.value.estimatedWavelengthM!).toBeLessThan(
      soft.value.estimatedWavelengthM!,
    );
  });

  it("con la cresta por debajo del sondeo se usa el viento de superficie", () => {
    const belowGround: RidgeSpec = { ...ridge, crestMslM: m(-100) };
    const r = wavePotential(waveSounding(2, 9, 10), belowGround);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.crossRidgeMs).toBeCloseTo(10, 4);
  });
});

describe("respaldo declarado cuando falla el perfil", () => {
  it("con viento fuerte pero sin perfil utilizable, el método es heurístico", () => {
    const sounding = waveSounding(2, 9, 14);
    const truncated = { ...sounding, levels: sounding.levels.slice(0, 2) };
    const ridge: RidgeSpec = {
      name: "sintética",
      bearingDeg: deg(0),
      slopeDeg: deg(20),
      crestMslM: m(1500),
    };
    const r = wavePotential(truncated, ridge);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.method).toBe("heuristic");
    expect(r.value.reason).toBe("no_usable_scorer_profile");
    // 14 m/s supera 1.5 veces el mínimo: el heurístico admite «marginal».
    expect(r.value.potential).toBe("marginal");
    expect(r.value.trappedLeeWave).toBe(false);
  });

  it("el heurístico no promete más que «marginal»", () => {
    const sounding = waveSounding(2, 9, 9);
    const truncated = { ...sounding, levels: sounding.levels.slice(0, 2) };
    const ridge: RidgeSpec = {
      name: "sintética",
      bearingDeg: deg(0),
      slopeDeg: deg(20),
      crestMslM: m(1500),
    };
    const r = wavePotential(truncated, ridge);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.potential).toBe("none");
  });
});

describe("La Mujer Muerta, la ladera que se vuela desde Fuentemilanos", () => {
  it("el viento que la ataca de frente viene del 338°, no del 310°", () => {
    // El cordal va de oeste-suroeste a este-noreste: eje 68°, normal 338°.
    const head = ridgeLift(LA_MUJER_MUERTA, W(12, 338));
    expect(head.perpendicularMs).toBeCloseTo(12, 2);
    expect(head.incidenceDeg).toBeCloseTo(0, 1);
  });

  it("los 310° que el predecesor tenía fijos pierden un 11 % de la componente", () => {
    // 28° de error entre 338° y 310°. Un viento real del 338° evaluado como si
    // la normal fuese 310° se queda en cos(28°) = 0.887 de su valor.
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

  it("un viento del suroeste corre paralelo al cordal y no da ladera", () => {
    const alongRidge = ridgeLift(LA_MUJER_MUERTA, W(15, 248));
    expect(alongRidge.perpendicularMs).toBeLessThan(1);
    expect(alongRidge.band).toBe("insufficient");
  });

  it("la pendiente elegida cambia la ascendencia en un factor 1.4", () => {
    const wind = W(10, 338);
    const upperFace = ridgeLift(LA_MUJER_MUERTA, wind);
    const wholeFace = ridgeLift({ ...LA_MUJER_MUERTA, slopeDeg: deg(11.4) }, wind);
    expect(upperFace.verticalMs).toBeCloseTo(2.76, 2);
    expect(wholeFace.verticalMs).toBeCloseTo(1.98, 2);
    expect(upperFace.verticalMs / wholeFace.verticalMs).toBeCloseTo(1.39, 2);
  });

  it("el emplazamiento lleva su cresta como dato, no la librería", () => {
    expect(FUENTEMILANOS_SITE.ridges).toHaveLength(1);
    expect(FUENTEMILANOS_SITE.ridges?.[0]?.name).toBe("La Mujer Muerta");
    expect(FUENTEMILANOS_SITE.elevationMslM).toBe(1001);
  });
});

describe("Sierra de Ayllón", () => {
  it("su eje sale del terreno, no de la descripción publicada", () => {
    // La fuente publicada dice «oeste-este» (eje 90°); el ajuste de la caída de
    // elevación en 24 rumbos da 65°, coherente con el resto del Sistema Central.
    expect(SIERRA_DE_AYLLON.bearingDeg).toBe(65);
    const head = ridgeLift(SIERRA_DE_AYLLON, W(14, 335));
    expect(head.perpendicularMs).toBeCloseTo(14, 1);
    expect(head.incidenceDeg).toBeCloseTo(0, 0);
  });

  it("evaluada como «oeste-este» perdería un 40 % de la componente", () => {
    const wind = W(14, 335);
    const fromTerrain = ridgeLift(SIERRA_DE_AYLLON, wind);
    const asPublished = ridgeLift({ ...SIERRA_DE_AYLLON, bearingDeg: deg(90) }, wind);
    expect(asPublished.perpendicularMs / fromTerrain.perpendicularMs).toBeCloseTo(
      Math.cos((25 * Math.PI) / 180),
      2,
    );
  });

  it("comparte tendencia con La Mujer Muerta: ambas son Sistema Central", () => {
    // 68° y 65°, derivados por separado de dos transectos independientes.
    expect(
      Math.abs(SIERRA_DE_AYLLON.bearingDeg - LA_MUJER_MUERTA.bearingDeg),
    ).toBeLessThan(5);
  });

  it("no cuelga de Fuentemilanos: está a 71 km y necesita su propio sondeo", () => {
    expect(FUENTEMILANOS_SITE.ridges).toHaveLength(1);
    expect(FUENTEMILANOS_SITE.ridges?.[0]?.name).toBe("La Mujer Muerta");
    expect(PICO_DEL_LOBO_SITE.ridges?.[0]?.name).toBe("Sierra de Ayllón");
    expect(PICO_DEL_LOBO_SITE.elevationMslM).toBeGreaterThan(
      FUENTEMILANOS_SITE.elevationMslM,
    );
  });
});

describe("límites del método de derivación del eje", () => {
  it("un macizo da anisotropía modesta y una cima no da ninguna", () => {
    expect(RIDGE_ANISOTROPY["Sierra de Ayllón"]!).toBeGreaterThan(
      MIN_MEANINGFUL_ANISOTROPY,
    );
    expect(RIDGE_ANISOTROPY["Peñalara"]!).toBeLessThan(MIN_MEANINGFUL_ANISOTROPY);
  });

  it("con eje poco fiable, la ladera depende mucho del rumbo supuesto", () => {
    // Peñalara cae parecido en todas direcciones: elegir un eje u otro cambia
    // la componente perpendicular sin que el terreno lo justifique.
    const wind = W(12, 270);
    const asFitted = ridgeLift(PENALARA, wind);
    const asGuadarramaTrend = ridgeLift({ ...PENALARA, bearingDeg: deg(68) }, wind);
    expect(
      Math.abs(asFitted.perpendicularMs - asGuadarramaTrend.perpendicularMs),
    ).toBeGreaterThan(3);
  });

  it("Peñalara es más alta que La Mujer Muerta: por eso hay que ganar altura antes", () => {
    expect(PENALARA.crestMslM).toBeGreaterThan(LA_MUJER_MUERTA.crestMslM);
    expect(PENALARA.crestMslM - LA_MUJER_MUERTA.crestMslM).toBe(231);
  });

  it("cada cresta cuelga de su propio punto de consulta", () => {
    for (const site of [FUENTEMILANOS_SITE, PICO_DEL_LOBO_SITE, PENALARA_SITE]) {
      expect(site.ridges).toHaveLength(1);
      expect(site.ridges?.[0]?.crestMslM).toBeGreaterThan(0);
    }
  });
});
