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
  ALLEN_WIND_CUTOFF_EXACT_KNOTS_MS,
  BANK_40_SINK_FACTOR,
  GLIDER_CLUB,
  RASP_HCRIT_THRESHOLD_MS,
  RASP_REFERENCE,
  findAircraftProfile,
} from "../../src/aircraft/profiles.js";
import { fpmToMs, kToCelsius } from "../../src/units/convert.js";
import { m, mps } from "../../src/units/branded.js";
import { syntheticSounding } from "../helpers/synthetic.js";
import { buildSounding } from "../../src/sounding/build.js";
import {
  indexOfLocalHour,
  loadFixture,
  seriesMax,
  toSoundingInput,
} from "../helpers/fixture.js";

describe("trigger temperature", () => {
  // B-06
  it("no condensation occurs below trigger temperature; occurs above", () => {
    const sounding = syntheticSounding(28, 2500, 3, 8);
    const r = triggerTemperature(sounding);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(kToCelsius(r.value.triggerTempK)).toBeGreaterThan(28);
    expect(r.value.cclAglM).toBeGreaterThan(0);
    expect(r.value.cclMslM).toBeGreaterThan(r.value.cclAglM - 1);
  });

  it("with more humid air trigger temperature and CCL both decrease", () => {
    const dry = triggerTemperature(syntheticSounding(28, 2500, 3, 8));
    const humid = triggerTemperature(syntheticSounding(28, 2500, 3, 14));
    expect(dry.ok && humid.ok).toBe(true);
    if (!dry.ok || !humid.ok) return;
    expect(humid.value.triggerTempK).toBeLessThan(dry.value.triggerTempK);
    expect(humid.value.cclAglM).toBeLessThan(dry.value.cclAglM);
  });

  it("at Fuentemilanos midday trigger exceeds daily max: blue thermal day", () => {
    const fixture = loadFixture("lefm-2026-08-18-icon_eu.json");
    const built = buildSounding(toSoundingInput(fixture, indexOfLocalHour(fixture, 14)));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const r = triggerTemperature(built.value);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const tmax = seriesMax(fixture, "temperature_2m");
    // With 29 K spread between temperature and dewpoint, no cumulus can form.
    expect(kToCelsius(r.value.triggerTempK)).toBeGreaterThan(tmax);
  });

  it("air so dry it never condenses returns error rather than fake value", () => {
    const r = triggerTemperature(syntheticSounding(28, 2500, 3, -40));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("OUT_OF_VALID_RANGE");
  });
});

describe("mixing height reconciliation", () => {
  // B-05
  it("computes forecast cleanly without model BL diagnosis", () => {
    const r = reconcileMixingHeight(m(2000), null);
    expect(r.chosenAglM).toBe(2000);
    expect(r.modelAglM).toBeNull();
    expect(r.divergenceFrac).toBeNull();
    expect(r.likelyShearDriven).toBe(false);
  });

  it("always chooses parcel-derived mixing height", () => {
    expect(reconcileMixingHeight(m(1500), m(4000)).chosenAglM).toBe(1500);
    expect(reconcileMixingHeight(m(2500), m(900)).chosenAglM).toBe(2500);
  });

  it("flags shear-driven mixing when model height diverges strongly", () => {
    const r = reconcileMixingHeight(m(1500), m(4000));
    expect(r.divergenceFrac).toBeCloseTo(1.667, 3);
    expect(r.likelyShearDriven).toBe(true);
  });

  it("does not flag shear on small divergences", () => {
    const r = reconcileMixingHeight(m(3000), m(3400));
    expect(r.likelyShearDriven).toBe(false);
    expect(SHEAR_DRIVEN_DIVERGENCE_FRAC).toBe(0.5);
  });

  it("accepts custom tolerance fraction", () => {
    expect(reconcileMixingHeight(m(3000), m(3400), 0.1).likelyShearDriven).toBe(true);
  });

  it("zero parcel height does not divide by zero", () => {
    const r = reconcileMixingHeight(m(0), m(3000));
    expect(r.divergenceFrac).toBeNull();
    expect(Number.isFinite(r.chosenAglM)).toBe(true);
  });
});

describe("buoyancy versus shear", () => {
  it("u* increases with wind speed and surface roughness", () => {
    expect(frictionVelocity(mps(10), m(0.1))).toBeGreaterThan(
      frictionVelocity(mps(5), m(0.1)),
    );
    expect(frictionVelocity(mps(5), m(1.0))).toBeGreaterThan(
      frictionVelocity(mps(5), m(0.01)),
    );
  });

  it("with 5 m/s wind over cropland u* is around 0.43 m/s", () => {
    expect(frictionVelocity(mps(5), m(0.1))).toBeCloseTo(0.434, 2);
  });

  it("classifies thermal organisation by DrJack thresholds", () => {
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

  it("published thresholds are 5 and 10", () => {
    expect(BROKEN_THRESHOLD).toBe(5);
    expect(ORGANISED_THRESHOLD).toBe(10);
  });

  it("exposes Obukhov parameter for transparency", () => {
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

  it("ratio degrades with increasing surface wind", () => {
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

  it("shear does not disrupt thermals under calm wind", () => {
    const r = buoyancyShearRatio({
      wStarMs: mps(2),
      surfaceWindMs: mps(0),
      roughnessLengthM: m(0.1),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.quality).toBe("organised");
  });

  it("returns error without convection", () => {
    const r = buoyancyShearRatio({
      wStarMs: mps(0),
      surfaceWindMs: mps(5),
      roughnessLengthM: m(0.1),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NO_CONVECTION");
  });
});

describe("aircraft profile", () => {
  it("hcrit threshold is DrJack's 225 fpm, identical across all profiles", () => {
    expect(RASP_HCRIT_THRESHOLD_MS).toBeCloseTo(fpmToMs(225), 12);
    expect(RASP_HCRIT_THRESHOLD_MS).toBeCloseTo(1.143, 3);
    for (const profile of AIRCRAFT_PROFILES) {
      expect(profile.hcritThresholdMs).toBe(RASP_HCRIT_THRESHOLD_MS);
    }
  });

  it("circling sink scales from straight-flight sink by 40° factor", () => {
    expect(BANK_40_SINK_FACTOR).toBeCloseTo(1.4915, 4);
    for (const profile of AIRCRAFT_PROFILES) {
      if (profile.minSinkMs === null) continue;
      expect(profile.circlingSinkMs).toBeCloseTo(
        profile.minSinkMs * BANK_40_SINK_FACTOR,
        12,
      );
      // No real glider sinks as much as DrJack's threshold under its own polar.
      expect(profile.circlingSinkMs).toBeLessThan(RASP_HCRIT_THRESHOLD_MS);
    }
  });

  it("default club glider is an ASK 21 banked at 40°", () => {
    expect(GLIDER_CLUB.minSinkMs).toBe(0.65);
    expect(GLIDER_CLUB.circlingSinkMs).toBeCloseTo(0.9695, 4);
  });

  it("RASP reference equates sink with threshold and declares no polar", () => {
    expect(RASP_REFERENCE.minSinkMs).toBeNull();
    expect(RASP_REFERENCE.circlingSinkMs).toBe(RASP_HCRIT_THRESHOLD_MS);
  });

  it("applies Allen's wind cutoff across all profiles", () => {
    for (const profile of AIRCRAFT_PROFILES) {
      expect(profile.maxSurfaceWindMs).toBe(12.87);
    }
  });

  it("does not impose temperature: pure geometry and performance", () => {
    expect(Object.keys(GLIDER_CLUB)).toEqual([
      "id",
      "minSinkMs",
      "circlingSinkMs",
      "hcritThresholdMs",
      "maxSurfaceWindMs",
      "minTurnRadiusM",
      "minUsableClimbMs",
    ]);
  });

  it("looks up profiles by identifier", () => {
    expect(findAircraftProfile("ask21")?.id).toBe("ask21");
    expect(findAircraftProfile("glider-club")?.id).toBe("glider-club");
    expect(findAircraftProfile("non-existent")).toBeUndefined();
    expect(ALLEN_WIND_CUTOFF_EXACT_KNOTS_MS).toBeCloseTo(12.86, 2);
  });
});
