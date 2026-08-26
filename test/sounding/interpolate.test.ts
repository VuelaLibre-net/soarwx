import { describe, expect, it } from "vitest";
import { buildSounding } from "../../src/sounding/build.js";
import {
  interpolateAtAgl,
  interpolateAtHeight,
  interpolateAtPressure,
} from "../../src/sounding/interpolate.js";
import { hPaToPa, kToCelsius, paToHPa } from "../../src/units/convert.js";
import { Pa, m } from "../../src/units/branded.js";
import { indexOfLocalHour, loadFixture, toSoundingInput } from "../helpers/fixture.js";

const fixture = loadFixture("lefm-2026-08-18-icon_eu.json");
const built = buildSounding(toSoundingInput(fixture, indexOfLocalHour(fixture, 14)));
if (!built.ok) throw new Error(built.error.message);
const sounding = built.value;

describe("interpolación por presión", () => {
  it("en un nivel existente devuelve ese nivel", () => {
    const r = interpolateAtPressure(sounding, hPaToPa(850));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(kToCelsius(r.value.tempK)).toBeCloseTo(25.9, 6);
    expect(r.value.geopotentialMslM).toBeCloseTo(1566, 6);
  });

  // S-05
  it("a media capa cae entre los dos niveles que la acotan", () => {
    const r = interpolateAtPressure(sounding, hPaToPa(825));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(kToCelsius(r.value.tempK)).toBeGreaterThan(20.7);
    expect(kToCelsius(r.value.tempK)).toBeLessThan(25.9);
    expect(r.value.geopotentialMslM).toBeGreaterThan(1566);
    expect(r.value.geopotentialMslM).toBeLessThan(2094);
    expect(r.value.source).toBe("interpolated");
  });

  it("es monótona entre dos niveles", () => {
    let previous = Infinity;
    for (let hpa = 850; hpa >= 800; hpa -= 5) {
      const r = interpolateAtPressure(sounding, hPaToPa(hpa));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.tempK).toBeLessThan(previous);
      previous = r.value.tempK;
    }
  });

  it("por debajo de la superficie es LEVEL_BELOW_GROUND", () => {
    const r = interpolateAtPressure(sounding, hPaToPa(950));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("LEVEL_BELOW_GROUND");
  });

  it("por encima del techo del sondeo es OUT_OF_VALID_RANGE", () => {
    const r = interpolateAtPressure(sounding, hPaToPa(300));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("OUT_OF_VALID_RANGE");
  });
});

describe("interpolación por altura", () => {
  it("coincide con la interpolación por presión en el mismo punto", () => {
    const byHeight = interpolateAtHeight(sounding, m(1800));
    expect(byHeight.ok).toBe(true);
    if (!byHeight.ok) return;
    const byPressure = interpolateAtPressure(sounding, Pa(byHeight.value.pressurePa));
    expect(byPressure.ok).toBe(true);
    if (!byPressure.ok) return;
    expect(byPressure.value.geopotentialMslM).toBeCloseTo(1800, 3);
    expect(byPressure.value.tempK).toBeCloseTo(byHeight.value.tempK, 6);
  });

  it("interpolateAtAgl ancla en la elevación del emplazamiento", () => {
    const agl = interpolateAtAgl(sounding, m(565));
    expect(agl.ok).toBe(true);
    if (agl.ok) expect(agl.value.geopotentialMslM).toBeCloseTo(1566, 6);
  });

  it("bajo el terreno es LEVEL_BELOW_GROUND", () => {
    const r = interpolateAtHeight(sounding, m(500));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("LEVEL_BELOW_GROUND");
  });

  it("por encima del techo es OUT_OF_VALID_RANGE", () => {
    const r = interpolateAtHeight(sounding, m(9000));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("OUT_OF_VALID_RANGE");
  });

  it("el viento se interpola por componentes, no por dirección", () => {
    // Entre 800 hPa (256°) y 700 hPa (240°) la dirección gira; el resultado
    // intermedio debe quedar entre ambas y con módulo entre los dos.
    const r = interpolateAtPressure(sounding, hPaToPa(750));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.windFromDeg).toBeGreaterThan(235);
    expect(r.value.windFromDeg).toBeLessThan(260);
    expect(r.value.windSpeedMs).toBeGreaterThan(1.7);
    expect(r.value.windSpeedMs).toBeLessThan(4.2);
  });

  it("el sondeo llega hasta 500 hPa", () => {
    expect(paToHPa(sounding.levels[sounding.levels.length - 1]!.pressurePa)).toBeCloseTo(
      500,
      6,
    );
  });
});
