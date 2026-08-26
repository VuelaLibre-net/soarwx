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

describe("pressure from geopotential column", () => {
  it("reproduces levels existing in the column", () => {
    expect(paToHPa(pressureFromGeopotentialProfile(column, m(1566))!)).toBeCloseTo(
      850,
      6,
    );
    expect(paToHPa(pressureFromGeopotentialProfile(column, m(1060))!)).toBeCloseTo(
      900,
      6,
    );
  });

  it("interpolates within column bounds", () => {
    const p = paToHPa(pressureFromGeopotentialProfile(column, m(1300))!);
    expect(p).toBeGreaterThan(850);
    expect(p).toBeLessThan(900);
  });

  it("extrapolates below lowest level", () => {
    const p = paToHPa(pressureFromGeopotentialProfile(column, m(1001))!);
    expect(p).toBeGreaterThan(900);
    expect(p).toBeLessThan(915);
  });

  it("extrapolates above highest level", () => {
    const p = paToHPa(pressureFromGeopotentialProfile(column, m(2400))!);
    expect(p).toBeLessThan(800);
  });

  it("returns null with fewer than two levels", () => {
    expect(pressureFromGeopotentialProfile([], m(1500))).toBeNull();
    expect(pressureFromGeopotentialProfile([column[0]!], m(1500))).toBeNull();
  });

  it("tolerates duplicate levels at identical altitude", () => {
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

describe("hypsometric formula (fallback)", () => {
  it("yields approximately 10 Pa per metre near ground", () => {
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

  it("decreases monotonically with altitude", () => {
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

describe("height levels as sounding levels", () => {
  it("anchors to model column and preserves monotonicity", () => {
    const levels = heightLevelsToLevels(baseContext, raw);
    expect(levels).toHaveLength(2);
    expect(levels[0]!.geopotentialMslM).toBe(1081);
    // Above 1060 m (900 hPa) pressure must be less than 900 hPa.
    expect(paToHPa(levels[0]!.pressurePa)).toBeLessThan(900);
    expect(levels[1]!.pressurePa).toBeLessThan(levels[0]!.pressurePa);
    expect(levels[0]!.source).toBe("height_level");
  });

  it("falls back to hypsometric formula when column is absent", () => {
    const levels = heightLevelsToLevels({ ...baseContext, column: [] }, raw);
    expect(levels).toHaveLength(2);
    expect(Number.isFinite(levels[0]!.pressurePa)).toBe(true);
  });

  it("derived dewpoint never exceeds level temperature", () => {
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

  it("empty list returns empty list", () => {
    expect(heightLevelsToLevels(baseContext, [])).toHaveLength(0);
  });
});
