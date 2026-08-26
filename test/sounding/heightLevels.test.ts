import { describe, expect, it } from "vitest";
import {
  heightLevelsToLevels,
  pressureAtHeight,
  pressureFromGeopotentialProfile,
} from "../../src/sounding/heightLevels.js";
import type { HeightLevelContext } from "../../src/sounding/heightLevels.js";
import { celsiusToK, hPaToPa, paToHPa } from "../../src/units/convert.js";
import { deg, m, mps } from "../../src/units/branded.js";
import { mixingRatio } from "../../src/thermo/saturation.js";

const column = [
  { pressurePa: hPaToPa(900), geopotentialMslM: m(1060) },
  { pressurePa: hPaToPa(850), geopotentialMslM: m(1566) },
  { pressurePa: hPaToPa(800), geopotentialMslM: m(2094) },
];

const baseContext: HeightLevelContext = {
  surfacePressurePa: hPaToPa(909.8),
  surfaceTempK: celsiusToK(33.9),
  surfaceMixingRatioKgKg: mixingRatio(celsiusToK(4.5), hPaToPa(909.8)),
  elevationMslM: m(1001),
  column,
};

const raw = [
  {
    heightAglM: m(80),
    tempK: celsiusToK(31.2),
    windSpeedMs: mps(1.4),
    windFromDeg: deg(335),
  },
  {
    heightAglM: m(180),
    tempK: celsiusToK(29.7),
    windSpeedMs: mps(1.3),
    windFromDeg: deg(333),
  },
];

describe("presión desde la columna geopotencial", () => {
  it("reproduce los niveles de la propia columna", () => {
    expect(paToHPa(pressureFromGeopotentialProfile(column, m(1566))!)).toBeCloseTo(
      850,
      6,
    );
    expect(paToHPa(pressureFromGeopotentialProfile(column, m(1060))!)).toBeCloseTo(
      900,
      6,
    );
  });

  it("interpola dentro de la columna", () => {
    const p = paToHPa(pressureFromGeopotentialProfile(column, m(1300))!);
    expect(p).toBeGreaterThan(850);
    expect(p).toBeLessThan(900);
  });

  it("extrapola por debajo del primer nivel", () => {
    const p = paToHPa(pressureFromGeopotentialProfile(column, m(1001))!);
    expect(p).toBeGreaterThan(900);
    expect(p).toBeLessThan(915);
  });

  it("extrapola por encima del último nivel", () => {
    const p = paToHPa(pressureFromGeopotentialProfile(column, m(2400))!);
    expect(p).toBeLessThan(800);
  });

  it("con menos de dos niveles no puede hacer nada", () => {
    expect(pressureFromGeopotentialProfile([], m(1500))).toBeNull();
    expect(pressureFromGeopotentialProfile([column[0]!], m(1500))).toBeNull();
  });

  it("tolera dos niveles a la misma altura", () => {
    const degenerate = [
      { pressurePa: hPaToPa(900), geopotentialMslM: m(1060) },
      { pressurePa: hPaToPa(900), geopotentialMslM: m(1060) },
    ];
    expect(paToHPa(pressureFromGeopotentialProfile(degenerate, m(1060))!)).toBeCloseTo(
      900,
      6,
    );
  });
});

describe("hipsométrica (respaldo)", () => {
  it("da unos 10 Pa por metro cerca del suelo", () => {
    const p = pressureAtHeight(
      hPaToPa(909.8),
      celsiusToK(33.9),
      celsiusToK(31.2),
      0.005,
      m(100),
    );
    const dropHpaPerM = (909.8 - paToHPa(p)) / 100;
    expect(dropHpaPerM).toBeGreaterThan(0.09);
    expect(dropHpaPerM).toBeLessThan(0.11);
  });

  it("decrece con la altura", () => {
    const a = pressureAtHeight(
      hPaToPa(1013),
      celsiusToK(15),
      celsiusToK(14),
      0.005,
      m(100),
    );
    const b = pressureAtHeight(
      hPaToPa(1013),
      celsiusToK(15),
      celsiusToK(13),
      0.005,
      m(200),
    );
    expect(b).toBeLessThan(a);
  });
});

describe("niveles de altura como niveles del sondeo", () => {
  it("usa la columna del modelo y sale monótono con ella", () => {
    const levels = heightLevelsToLevels(baseContext, raw);
    expect(levels).toHaveLength(2);
    expect(levels[0]!.geopotentialMslM).toBe(1081);
    // Por encima de 1060 m (900 hPa) la presión debe ser menor que 900 hPa.
    expect(paToHPa(levels[0]!.pressurePa)).toBeLessThan(900);
    expect(levels[1]!.pressurePa).toBeLessThan(levels[0]!.pressurePa);
    expect(levels[0]!.source).toBe("height_level");
  });

  it("sin columna cae a la hipsométrica y sigue produciendo niveles", () => {
    const levels = heightLevelsToLevels({ ...baseContext, column: [] }, raw);
    expect(levels).toHaveLength(2);
    expect(Number.isFinite(levels[0]!.pressurePa)).toBe(true);
  });

  it("el rocío derivado nunca supera la temperatura del nivel", () => {
    const humid = heightLevelsToLevels({ ...baseContext, surfaceMixingRatioKgKg: 0.03 }, [
      {
        heightAglM: m(80),
        tempK: celsiusToK(2),
        windSpeedMs: mps(1),
        windFromDeg: deg(0),
      },
    ]);
    expect(humid[0]!.dewpointK).toBeLessThanOrEqual(humid[0]!.tempK);
  });

  it("una lista vacía devuelve una lista vacía", () => {
    expect(heightLevelsToLevels(baseContext, [])).toHaveLength(0);
  });
});
