import { describe, expect, it } from "vitest";
import {
  DAYTIME_RADIATION_THRESHOLD_WM2,
  detectFluxSign,
  normaliseUpwardFlux,
} from "../../src/convection/heatFluxSign.js";
import { netLongwaveUpWm2, surfaceHeatFlux } from "../../src/convection/heatFlux.js";
import { bowenRatioFor } from "../../src/convection/surfaceDefaults.js";
import { celsiusToK, hPaToPa } from "../../src/units/convert.js";
import { wm2 } from "../../src/units/branded.js";
import { loadFixture, series, times } from "../helpers/fixture.js";

function fluxSamples(name: string) {
  const fixture = loadFixture(name);
  const radiation = series(fixture, "shortwave_radiation");
  const flux = series(fixture, "sensible_heat_flux");
  return times(fixture).map((_, i) => ({
    shortwaveWm2: radiation[i] ?? 0,
    fluxWm2: flux[i] ?? null,
  }));
}

describe("detección del signo del flujo (H-01, H-02)", () => {
  it("ICON-EU da flujo positivo hacia abajo", () => {
    const detected = detectFluxSign(fluxSamples("lefm-2026-08-18-icon_eu.json"));
    expect(detected.convention).toBe("down_positive");
    expect(detected.agreementFrac).toBe(1);
    expect(detected.samplesUsed).toBeGreaterThanOrEqual(6);
  });

  it("GFS da flujo positivo hacia arriba", () => {
    const detected = detectFluxSign(fluxSamples("lefm-2026-08-18-gfs_seamless.json"));
    expect(detected.convention).toBe("up_positive");
    expect(detected.agreementFrac).toBe(1);
  });

  it("la misma función acierta con los dos: normalizado, el mediodía sube", () => {
    for (const name of [
      "lefm-2026-08-18-icon_eu.json",
      "lefm-2026-08-18-gfs_seamless.json",
    ]) {
      const samples = fluxSamples(name);
      const { convention } = detectFluxSign(samples);
      for (const s of samples) {
        if (s.fluxWm2 === null) continue;
        if (s.shortwaveWm2 < DAYTIME_RADIATION_THRESHOLD_WM2) continue;
        expect(normaliseUpwardFlux(s.fluxWm2, convention)!).toBeGreaterThan(0);
      }
    }
  });

  it("sin muestras diurnas suficientes la convención es desconocida", () => {
    const detected = detectFluxSign([
      { shortwaveWm2: 0, fluxWm2: -10 },
      { shortwaveWm2: 900, fluxWm2: 200 },
    ]);
    expect(detected.convention).toBe("unknown");
    expect(normaliseUpwardFlux(200, "unknown")).toBeNull();
  });

  it("ignora las muestras sin dato y las de flujo exactamente nulo", () => {
    const detected = detectFluxSign([
      { shortwaveWm2: 900, fluxWm2: null },
      { shortwaveWm2: 900, fluxWm2: 0 },
      { shortwaveWm2: 900, fluxWm2: 300 },
      { shortwaveWm2: 900, fluxWm2: 310 },
      { shortwaveWm2: 900, fluxWm2: 320 },
    ]);
    expect(detected.convention).toBe("up_positive");
    expect(detected.samplesUsed).toBe(3);
  });
});

const commonSurface = {
  surfaceTempK: celsiusToK(34.7),
  surfaceDewpointK: celsiusToK(4.0),
  surfacePressurePa: hPaToPa(909),
  cloudCoverFrac: 0,
};

describe("flujo de calor sensible", () => {
  // H-03
  it("usa el flujo de ICON tal cual, con el signo corregido", () => {
    const r = surfaceHeatFlux({
      ...commonSurface,
      shortwaveDownWm2: wm2(926),
      modelFluxWm2: -243.1,
      fluxConvention: "down_positive",
    });
    expect(r.source).toBe("model");
    expect(r.sensibleHeatWm2).toBeCloseTo(243.1, 6);
    expect(r.estimated).not.toContain("sensible_heat_flux");
  });

  // H-04
  it("usa el flujo de GFS tal cual, sin cambiarle el signo", () => {
    const r = surfaceHeatFlux({
      ...commonSurface,
      shortwaveDownWm2: wm2(913),
      modelFluxWm2: 416.7,
      fluxConvention: "up_positive",
    });
    expect(r.source).toBe("model");
    expect(r.sensibleHeatWm2).toBeCloseTo(416.7, 6);
  });

  it("sin corregir el signo, ICON daría flujo negativo al mediodía", () => {
    // Es el fallo que la normalización impide: no lanza, no rompe, y produce
    // un informe plausible con cero convección todo el día.
    const wrong = surfaceHeatFlux({
      ...commonSurface,
      shortwaveDownWm2: wm2(926),
      modelFluxWm2: -243.1,
      fluxConvention: "up_positive",
    });
    expect(wrong.sensibleHeatWm2).toBeLessThan(0);
    expect(wrong.virtualHeatFluxKMs).toBeLessThan(0);
  });

  // H-05
  it("sin flujo del modelo reconstruye por balance energético y lo declara", () => {
    const r = surfaceHeatFlux({ ...commonSurface, shortwaveDownWm2: wm2(926) });
    expect(r.source).toBe("energy_balance");
    expect(r.estimated).toContain("sensible_heat_flux");
    expect(r.estimated).toContain("bowen_ratio");
    expect(r.estimated).toContain("albedo");
    expect(r.sensibleHeatWm2).toBeGreaterThan(0);
  });

  it("la reconstrucción queda en el orden de magnitud del modelo", () => {
    const reconstructed = surfaceHeatFlux({
      ...commonSurface,
      shortwaveDownWm2: wm2(926),
      surfaceType: "cropland",
      soilMoistureFrac: 0.1,
    });
    // ICON da 243 W/m² a esa hora. No se pide que acierte, sí que no delire.
    expect(reconstructed.sensibleHeatWm2).toBeGreaterThan(150);
    expect(reconstructed.sensibleHeatWm2).toBeLessThan(600);
  });

  // H-06
  it("de noche el flujo virtual no es positivo", () => {
    const night = surfaceHeatFlux({
      surfaceTempK: celsiusToK(15),
      surfaceDewpointK: celsiusToK(8),
      surfacePressurePa: hPaToPa(909),
      cloudCoverFrac: 0,
      shortwaveDownWm2: wm2(0),
    });
    expect(night.netRadiationWm2).toBeLessThan(0);
    expect(night.virtualHeatFluxKMs).toBeLessThanOrEqual(0);
  });

  it("declara la razón de Bowen implícita cuando usa el modelo", () => {
    const r = surfaceHeatFlux({
      ...commonSurface,
      shortwaveDownWm2: wm2(926),
      modelFluxWm2: -243.1,
      fluxConvention: "down_positive",
    });
    // ICON reparte 243 de sensible frente a 125 de latente a esa hora: β ≈ 2.
    expect(r.bowenRatio).toBeGreaterThan(0.5);
    expect(r.bowenRatio).toBeLessThan(6);
  });

  it("el flujo virtual supera al cinemático con aire húmedo", () => {
    const r = surfaceHeatFlux({
      ...commonSurface,
      surfaceDewpointK: celsiusToK(20),
      shortwaveDownWm2: wm2(900),
      modelFluxWm2: 300,
      fluxConvention: "up_positive",
    });
    expect(r.virtualHeatFluxKMs).toBeGreaterThan(r.kinematicHeatFluxKMs);
  });

  it("la densidad del aire es razonable a 909 hPa y 34.7 °C", () => {
    const r = surfaceHeatFlux({ ...commonSurface, shortwaveDownWm2: wm2(900) });
    expect(r.airDensityKgM3).toBeGreaterThan(0.95);
    expect(r.airDensityKgM3).toBeLessThan(1.1);
  });
});

describe("onda larga neta", () => {
  it("es mayor con cielo despejado que con cielo cubierto", () => {
    const clear = netLongwaveUpWm2(celsiusToK(30), celsiusToK(5), 0);
    const overcast = netLongwaveUpWm2(celsiusToK(30), celsiusToK(5), 1);
    expect(clear).toBeGreaterThan(overcast);
    expect(clear).toBeGreaterThan(50);
    expect(clear).toBeLessThan(150);
  });

  it("es menor con aire húmedo", () => {
    expect(netLongwaveUpWm2(celsiusToK(30), celsiusToK(25), 0)).toBeLessThan(
      netLongwaveUpWm2(celsiusToK(30), celsiusToK(0), 0),
    );
  });
});

describe("razón de Bowen por terreno", () => {
  it("el suelo seco reparte más hacia sensible que el húmedo", () => {
    expect(bowenRatioFor("cropland", 0)).toBeGreaterThan(bowenRatioFor("cropland", 1));
  });

  it("el terreno árido supera al cultivo", () => {
    expect(bowenRatioFor("arid", 0.5)).toBeGreaterThan(bowenRatioFor("cropland", 0.5));
  });

  it("sin humedad de suelo toma el punto medio", () => {
    expect(bowenRatioFor("grass")).toBeCloseTo((0.4 + 2.5) / 2, 9);
  });
});
