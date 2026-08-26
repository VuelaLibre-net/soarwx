import { describe, expect, it } from "vitest";
import { triggerTemperature } from "../../src/convection/trigger.js";
import {
  SHEAR_DRIVEN_DIVERGENCE_FRAC,
  reconcileMixingHeight,
} from "../../src/convection/mixingHeight.js";
import {
  BROKEN_THRESHOLD,
  ORGANISED_THRESHOLD,
  buoyancyShearRatio,
  frictionVelocity,
} from "../../src/convection/buoyancyShear.js";
import {
  AIRCRAFT_PROFILES,
  BANK_40_SINK_FACTOR,
  GLIDER_CLUB,
  RASP_HCRIT_THRESHOLD_MS,
  RASP_REFERENCE,
} from "../../src/aircraft/profiles.js";
import { celsiusToK, fpmToMs, kToCelsius } from "../../src/units/convert.js";
import { m, mps } from "../../src/units/branded.js";
import { syntheticSounding } from "../helpers/synthetic.js";
import { buildSounding } from "../../src/sounding/build.js";
import {
  indexOfLocalHour,
  loadFixture,
  seriesMax,
  toSoundingInput,
} from "../helpers/fixture.js";

describe("temperatura de disparo", () => {
  // B-06
  it("por debajo de ella no hay condensación; por encima sí", () => {
    const sounding = syntheticSounding(28, 2500, 3, 8);
    const r = triggerTemperature(sounding);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(kToCelsius(r.value.triggerTempK)).toBeGreaterThan(28);
    expect(r.value.cclAglM).toBeGreaterThan(0);
    expect(r.value.cclMslM).toBeGreaterThan(r.value.cclAglM - 1);
  });

  it("con aire más húmedo, el disparo baja y el CCL también", () => {
    const dry = triggerTemperature(syntheticSounding(28, 2500, 3, 8));
    const humid = triggerTemperature(syntheticSounding(28, 2500, 3, 14));
    expect(dry.ok && humid.ok).toBe(true);
    if (!dry.ok || !humid.ok) return;
    expect(humid.value.triggerTempK).toBeLessThan(dry.value.triggerTempK);
    expect(humid.value.cclAglM).toBeLessThan(dry.value.cclAglM);
  });

  it("en Fuentemilanos a mediodía el disparo supera la máxima: día azul", () => {
    const fixture = loadFixture("lefm-2026-08-18-icon_eu.json");
    const built = buildSounding(toSoundingInput(fixture, indexOfLocalHour(fixture, 14)));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const r = triggerTemperature(built.value);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const tmax = seriesMax(fixture, "temperature_2m");
    // Con 29 K de separación entre temperatura y rocío no se forma un cumulus.
    expect(kToCelsius(r.value.triggerTempK)).toBeGreaterThan(tmax);
  });

  it("un aire tan seco que nunca condensa se declara, no se inventa", () => {
    const r = triggerTemperature(syntheticSounding(28, 2500, 3, -40));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("OUT_OF_VALID_RANGE");
  });
});

describe("reconciliación de la altura de mezcla", () => {
  // B-05
  it("sin diagnóstico del modelo el día se calcula igual", () => {
    const r = reconcileMixingHeight(m(2000), null);
    expect(r.chosenAglM).toBe(2000);
    expect(r.modelAglM).toBeNull();
    expect(r.divergenceFrac).toBeNull();
    expect(r.likelyShearDriven).toBe(false);
  });

  it("el elegido es siempre el de la parcela", () => {
    expect(reconcileMixingHeight(m(1500), m(4000)).chosenAglM).toBe(1500);
    expect(reconcileMixingHeight(m(2500), m(900)).chosenAglM).toBe(2500);
  });

  it("marca mezcla por cizalladura cuando el modelo se dispara", () => {
    const r = reconcileMixingHeight(m(1500), m(4000));
    expect(r.divergenceFrac).toBeCloseTo(1.667, 3);
    expect(r.likelyShearDriven).toBe(true);
  });

  it("no la marca con divergencias pequeñas", () => {
    const r = reconcileMixingHeight(m(3000), m(3400));
    expect(r.likelyShearDriven).toBe(false);
    expect(SHEAR_DRIVEN_DIVERGENCE_FRAC).toBe(0.5);
  });

  it("acepta una tolerancia propia", () => {
    expect(reconcileMixingHeight(m(3000), m(3400), 0.1).likelyShearDriven).toBe(true);
  });

  it("una parcela nula no divide por cero", () => {
    const r = reconcileMixingHeight(m(0), m(3000));
    expect(r.divergenceFrac).toBeNull();
    expect(Number.isFinite(r.chosenAglM)).toBe(true);
  });
});

describe("boyancia frente a cizalladura", () => {
  it("u* crece con el viento y con la rugosidad", () => {
    expect(frictionVelocity(mps(10), m(0.1))).toBeGreaterThan(
      frictionVelocity(mps(5), m(0.1)),
    );
    expect(frictionVelocity(mps(5), m(1.0))).toBeGreaterThan(
      frictionVelocity(mps(5), m(0.01)),
    );
  });

  it("con 5 m/s sobre cultivo, u* ronda 0.43 m/s", () => {
    expect(frictionVelocity(mps(5), m(0.1))).toBeCloseTo(0.434, 2);
  });

  it("clasifica según los umbrales de DrJack", () => {
    const weakWind = buoyancyShearRatio({
      wStarMs: mps(2.2),
      surfaceWindMs: mps(2),
      roughnessLengthM: m(0.1),
    });
    expect(weakWind.ok).toBe(true);
    if (weakWind.ok) expect(weakWind.value.quality).toBe("organised");

    const strongWind = buoyancyShearRatio({
      wStarMs: mps(2.2),
      surfaceWindMs: mps(10),
      roughnessLengthM: m(0.1),
    });
    expect(strongWind.ok).toBe(true);
    if (strongWind.ok) expect(strongWind.value.quality).toBe("broken");
  });

  it("los umbrales son los publicados: 5 y 10", () => {
    expect(BROKEN_THRESHOLD).toBe(5);
    expect(ORGANISED_THRESHOLD).toBe(10);
  });

  it("expone el parámetro de Obukhov para no esconder la aproximación", () => {
    const r = buoyancyShearRatio({
      wStarMs: mps(2.4),
      surfaceWindMs: mps(4),
      roughnessLengthM: m(0.1),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.obukhovStabilityIndex).toBeCloseTo(
      0.4 * Math.pow(r.value.ratio, 3),
      6,
    );
  });

  it("la relación empeora al aumentar el viento", () => {
    let previous = Infinity;
    for (let wind = 1; wind <= 12; wind += 1) {
      const r = buoyancyShearRatio({
        wStarMs: mps(2.5),
        surfaceWindMs: mps(wind),
        roughnessLengthM: m(0.1),
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.ratio).toBeLessThan(previous);
      previous = r.value.ratio;
    }
  });

  it("en calma la cizalladura no rompe nada", () => {
    const r = buoyancyShearRatio({
      wStarMs: mps(2),
      surfaceWindMs: mps(0),
      roughnessLengthM: m(0.1),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.quality).toBe("organised");
  });

  it("sin convección no hay relación que calcular", () => {
    const r = buoyancyShearRatio({
      wStarMs: mps(0),
      surfaceWindMs: mps(5),
      roughnessLengthM: m(0.1),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NO_CONVECTION");
  });
});

describe("perfil de aeronave", () => {
  it("el umbral de hcrit son los 225 fpm de DrJack, iguales para todos", () => {
    expect(RASP_HCRIT_THRESHOLD_MS).toBeCloseTo(fpmToMs(225), 12);
    expect(RASP_HCRIT_THRESHOLD_MS).toBeCloseTo(1.143, 3);
    for (const profile of AIRCRAFT_PROFILES) {
      expect(profile.hcritThresholdMs).toBe(RASP_HCRIT_THRESHOLD_MS);
    }
  });

  it("la caída virando sale del mínimo en recto por el factor de 40°", () => {
    expect(BANK_40_SINK_FACTOR).toBeCloseTo(1.4915, 4);
    for (const profile of AIRCRAFT_PROFILES) {
      if (profile.minSinkMs === null) continue;
      expect(profile.circlingSinkMs).toBeCloseTo(
        profile.minSinkMs * BANK_40_SINK_FACTOR,
        12,
      );
      // El aviso que motivó el cambio: ningún velero real cae tanto como el
      // umbral de DrJack cuando se le aplica su propia polar.
      expect(profile.circlingSinkMs).toBeLessThan(RASP_HCRIT_THRESHOLD_MS);
    }
  });

  it("el planeador de club por omisión es un ASK 21 a 40°", () => {
    expect(GLIDER_CLUB.minSinkMs).toBe(0.65);
    expect(GLIDER_CLUB.circlingSinkMs).toBeCloseTo(0.9695, 4);
  });

  it("la referencia de RASP iguala caída y umbral, y no declara polar", () => {
    expect(RASP_REFERENCE.minSinkMs).toBeNull();
    expect(RASP_REFERENCE.circlingSinkMs).toBe(RASP_HCRIT_THRESHOLD_MS);
  });

  it("y el corte de viento que usa Allen en sus cálculos", () => {
    for (const profile of AIRCRAFT_PROFILES) {
      expect(profile.maxSurfaceWindMs).toBe(12.87);
    }
  });

  it("no impone la temperatura: es solo geometría y prestaciones", () => {
    expect(Object.keys(GLIDER_CLUB)).toEqual([
      "id",
      "minSinkMs",
      "circlingSinkMs",
      "hcritThresholdMs",
      "maxSurfaceWindMs",
      "minTurnRadiusM",
      "minUsableClimbMs",
    ]);
    expect(celsiusToK(0)).toBeCloseTo(273.15, 6);
  });
});
