import { describe, expect, it } from "vitest";
import * as u from "../../src/units/index.js";

/** P-08 de docs/ACCEPTANCE.md: toda conversión va y vuelve. */
describe("conversiones (P-08)", () => {
  const roundTrips: readonly [string, (v: number) => number][] = [
    ["celsius", (v) => u.kToCelsius(u.celsiusToK(v))],
    ["hPa", (v) => u.paToHPa(u.hPaToPa(v))],
    ["km/h", (v) => u.msToKmh(u.kmhToMs(v))],
    ["nudos", (v) => u.msToKnots(u.knotsToMs(v))],
    ["pies", (v) => u.mToFeet(u.feetToM(v))],
    ["fpm", (v) => u.msToFpm(u.fpmToMs(v))],
  ];

  for (const [name, trip] of roundTrips) {
    it(`${name} va y vuelve con error relativo < 1e-12`, () => {
      for (const v of [-273.15, -40, -1, 0, 1, 15, 100, 1013.25, 5280, 12345.678]) {
        const back = trip(v);
        if (v === 0) expect(Math.abs(back)).toBeLessThan(1e-12);
        else expect(Math.abs((back - v) / v)).toBeLessThan(1e-12);
      }
    });
  }

  it("225 fpm es el criterio de hcrit: 1.143 m/s", () => {
    expect(u.fpmToMs(225)).toBeCloseTo(1.143, 3);
  });

  // Allen (2006) escribe «12.87 m/s (25 knots)». Con el nudo exacto
  // (1852 m/h) 25 kt son 12.8611 m/s: la cifra de 12.87 del artículo lleva
  // 0.017 kt de redondeo. La constante del corte se fija en 12.87 m/s, que es
  // el valor que el artículo usa; esta prueba deja constancia de la diferencia.
  it("25 nudos exactos son 12.861 m/s, no los 12.87 del artículo", () => {
    expect(u.knotsToMs(25)).toBeCloseTo(12.8611, 4);
    expect(Math.abs(u.knotsToMs(25) - 12.87)).toBeLessThan(0.01);
  });

  it("normaliza rumbos al intervalo [0, 360)", () => {
    expect(u.normaliseBearing(-10)).toBe(350);
    expect(u.normaliseBearing(370)).toBe(10);
    expect(u.normaliseBearing(360)).toBe(0);
    expect(u.normaliseBearing(0)).toBe(0);
  });

  it("Γd es g/cp ≈ 9.761 K/km", () => {
    expect(u.GAMMA_D * 1000).toBeCloseTo(9.761, 3);
  });
});
