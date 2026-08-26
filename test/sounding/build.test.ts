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

describe("buildSounding sobre datos reales de Fuentemilanos", () => {
  const built = buildSounding(input);

  it("se construye", () => {
    expect(built.ok).toBe(true);
  });

  // S-01
  it("descarta los cuatro niveles bajo tierra y conserva seis", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.quality.levelsDiscardedBelowGround).toBe(4);
    expect(built.value.quality.pressureLevelsUsed).toBe(6);
  });

  // S-02
  it("los 38 °C del nivel de 1000 hPa no entran en el sondeo", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // Ese nivel está a 136 m de altura geopotencial, muy por debajo de los 1001 m.
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
  it("los niveles quedan en presión estrictamente descendente", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    for (let i = 1; i < built.value.levels.length; i++) {
      expect(built.value.levels[i]!.pressurePa).toBeLessThan(
        built.value.levels[i - 1]!.pressurePa,
      );
    }
  });

  it("incorpora los tres niveles de altura sobre el terreno", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.quality.heightLevelsUsed).toBe(3);
    expect(built.value.quality.levelsUsed).toBe(10); // 1 superficie + 3 altura + 6 presión
    expect(built.value.quality.estimated).toContain("height_level_dewpoint");
  });

  it("los niveles de altura se intercalan entre superficie y 850 hPa", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const heights = built.value.levels
      .filter((l) => l.source === "height_level")
      .map((l) => l.geopotentialMslM);
    expect(heights).toEqual([m(1081), m(1121), m(1181)]);
  });

  // S-02b
  it("declara el mayor hueco vertical, y es grande", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // Entre 700 hPa (3225 m) y 600 hPa (4485 m) no hay nada: 1260 m de hueco.
    // Es la resolución vertical real con la que hay que trabajar, y por eso se
    // declara en vez de disimularse.
    expect(built.value.quality.maxVerticalGapM).toBeCloseTo(1260, 0);
    expect(built.value.quality.gapWindowTopAglM).toBe(3500);
  });

  it("el hueco se puede recalcular con un techo concreto", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // Dentro de la capa límite probable de ese día (hasta ~2100 m MSL) el
    // mayor hueco es el de 850 a 800 hPa: 528 m.
    expect(maxGapBelow(built.value, m(2094))).toBeCloseTo(528, 0);
    // Y en los primeros 200 m, los niveles de altura lo reducen a decenas.
    expect(maxGapBelow(built.value, m(1181))).toBeLessThan(80);
  });

  it("declara el desfase entre presión de superficie y columna geopotencial", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // Open-Meteo reescala `surface_pressure` a la elevación pedida pero no
    // `geopotential_height_*hPa`: la presión de superficie queda 37 m por
    // debajo de donde la columna del modelo la situaría. Se declara, no se
    // corrige, y los niveles de altura se anclan a la columna para que el
    // perfil no salga no monótono.
    expect(built.value.quality.surfacePressureOffsetM).toBeCloseTo(36.9, 0);
  });

  it("conserva presión de estación y QNH por separado", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // 909.8 hPa de estación frente a un QNH cercano a 1013: confundirlos
    // desplaza la densidad y toda la parcela.
    expect(built.value.surface.pressurePa).toBeLessThan(
      built.value.surface.mslPressurePa,
    );
  });
});

describe("buildSounding, casos límite", () => {
  // S-04
  it("con menos de tres niveles sobre el terreno devuelve INSUFFICIENT_LEVELS", () => {
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

  it("un emplazamiento más alto descarta más niveles", () => {
    const high = buildSounding({
      ...input,
      site: { ...FUENTEMILANOS, elevationMslM: m(1600) },
    });
    expect(high.ok).toBe(true);
    if (!high.ok) return;
    // A 1600 m también cae el nivel de 850 hPa, que está a 1566 m.
    // A 1600 m caen también 900 hPa (1060 m) y 850 hPa (1566 m): quedan cuatro.
    expect(high.value.quality.levelsDiscardedBelowGround).toBe(6);
    expect(high.value.quality.pressureLevelsUsed).toBe(4);
  });

  // P-09
  it("el orden de entrada no cambia el resultado", () => {
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

  it("sin niveles de altura el sondeo sigue siendo válido", () => {
    const r = buildSounding({ ...input, heightLevels: [] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.quality.heightLevelsUsed).toBe(0);
    expect(r.value.quality.estimated).not.toContain("height_level_dewpoint");
  });
});

describe("opciones y casos degenerados", () => {
  it("acepta un mínimo de niveles distinto", () => {
    const scarce = {
      ...input,
      pressureLevels: input.pressureLevels.filter((l) => l.pressurePa <= hPaToPa(600)),
      options: { minPressureLevels: 2 },
    };
    const r = buildSounding(scarce);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.quality.pressureLevelsUsed).toBe(2);
  });

  it("acepta una ventana de hueco distinta", () => {
    const r = buildSounding({ ...input, options: { gapWindowTopAglM: m(1200) } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.quality.gapWindowTopAglM).toBe(1200);
    // Hasta 2201 m MSL el mayor hueco es el de 850 a 800 hPa: 528 m.
    expect(r.value.quality.maxVerticalGapM).toBeCloseTo(528, 0);
  });

  it("con niveles a la misma presión el desfase no divide por cero", () => {
    const duplicated = input.pressureLevels.map((l) =>
      l.pressurePa < hPaToPa(900) ? l : { ...l, pressurePa: hPaToPa(900) },
    );
    const r = buildSounding({ ...input, pressureLevels: duplicated });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Number.isFinite(r.value.quality.surfacePressureOffsetM)).toBe(true);
  });

  it("propaga la lista de variables ausentes", () => {
    const r = buildSounding({ ...input, missing: ["lifted_index"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.quality.missing).toEqual(["lifted_index"]);
  });
});
