import { describe, expect, it } from "vitest";
import { mixedLayerMean } from "../../src/clouds/mixedLayer.js";
import { cumulusBase } from "../../src/clouds/cloudBase.js";
import { cumulusDepth, isBlueDay } from "../../src/clouds/cumulus.js";
import {
  DEPTH_THRESHOLDS_M,
  overdevelopmentRisk,
} from "../../src/clouds/overdevelopment.js";
import { usableCeiling } from "../../src/clouds/ceiling.js";
import { mixingRatio } from "../../src/thermo/saturation.js";
import { celsiusToK, kToCelsius } from "../../src/units/convert.js";
import { m } from "../../src/units/branded.js";
import { syntheticSounding } from "../helpers/synthetic.js";
import { buildSounding } from "../../src/sounding/build.js";
import {
  indexOfLocalHour,
  loadFixture,
  seriesMax,
  toSoundingInput,
} from "../helpers/fixture.js";

describe("promedios de la capa mezclada", () => {
  const sounding = syntheticSounding(30, 2000, 3, 8);

  it("devuelve medias dentro del rango de los niveles que promedia", () => {
    const r = mixedLayerMean(sounding, m(1500));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.meanMixingRatioKgKg).toBeGreaterThan(0);
    expect(r.value.levelsUsed).toBeGreaterThan(2);
    expect(r.value.topAglM).toBe(1500);
  });

  it("promediar más capa cambia el resultado", () => {
    const shallow = mixedLayerMean(sounding, m(500));
    const deep = mixedLayerMean(sounding, m(2000));
    expect(shallow.ok && deep.ok).toBe(true);
    if (!shallow.ok || !deep.ok) return;
    expect(deep.value.levelsUsed).toBeGreaterThan(shallow.value.levelsUsed);
  });

  it("sin capa que promediar es INSUFFICIENT_LEVELS", () => {
    const r = mixedLayerMean(sounding, m(0));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INSUFFICIENT_LEVELS");
  });
});

describe("base de cumulus", () => {
  // N-01
  it("la parcela de capa mezclada difiere de la instantánea de dos metros", () => {
    const fixture = loadFixture("lefm-2026-08-18-icon_eu.json");
    const built = buildSounding(toSoundingInput(fixture, indexOfLocalHour(fixture, 14)));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const tmax = celsiusToK(seriesMax(fixture, "temperature_2m"));

    const mixed = cumulusBase(built.value, m(1500), tmax);
    expect(mixed.ok).toBe(true);
    if (!mixed.ok) return;

    const surfaceW = mixingRatio(
      built.value.surface.dewpointK,
      built.value.surface.pressurePa,
    );
    expect(mixed.value.mixedLayerMixingRatioKgKg).not.toBeCloseTo(surfaceW, 6);
    expect(mixed.value.method).toBe("mixed_layer_ccl");
  });

  it("con más humedad la base baja", () => {
    const dry = cumulusBase(syntheticSounding(30, 2000, 3, 0), m(1500), celsiusToK(30));
    const humid = cumulusBase(
      syntheticSounding(30, 2000, 3, 15),
      m(1500),
      celsiusToK(30),
    );
    expect(dry.ok && humid.ok).toBe(true);
    if (!dry.ok || !humid.ok) return;
    expect(humid.value.baseAglM).toBeLessThan(dry.value.baseAglM);
  });

  it("la base en MSL es la AGL más la elevación", () => {
    const r = cumulusBase(syntheticSounding(30, 2000, 3, 10), m(1500), celsiusToK(30));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.baseMslM).toBeCloseTo(r.value.baseAglM, 6);
  });

  it("declara si hay humedad suficiente para que se forme la nube", () => {
    const humid = cumulusBase(
      syntheticSounding(30, 2000, 3, 15),
      m(1500),
      celsiusToK(30),
      m(2500),
    );
    const dry = cumulusBase(
      syntheticSounding(30, 2000, 3, -5),
      m(1500),
      celsiusToK(30),
      m(2500),
    );
    expect(humid.ok && dry.ok).toBe(true);
    if (!humid.ok || !dry.ok) return;
    expect(humid.value.sufficientMoisture).toBe(true);
    expect(dry.value.sufficientMoisture).toBe(false);
  });

  it("en Fuentemilanos el 18 de agosto la base queda por encima del techo", () => {
    const fixture = loadFixture("lefm-2026-08-18-icon_eu.json");
    const built = buildSounding(toSoundingInput(fixture, indexOfLocalHour(fixture, 14)));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const r = cumulusBase(
      built.value,
      m(1500),
      celsiusToK(seriesMax(fixture, "temperature_2m")),
      m(2600),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 29 K de separación entre temperatura y rocío: día azul.
    expect(r.value.baseAglM).toBeGreaterThan(2600);
    expect(r.value.sufficientMoisture).toBe(false);
  });
});

describe("día azul y espesor", () => {
  // N-02
  it("hay día azul cuando la condensación queda por encima del techo", () => {
    expect(isBlueDay(m(3000), m(2000))).toBe(true);
    expect(isBlueDay(m(1200), m(2000))).toBe(false);
  });

  it("el espesor nunca es negativo", () => {
    expect(cumulusDepth(m(1200), m(2000))).toBe(800);
    expect(cumulusDepth(m(3000), m(2000))).toBe(0);
  });
});

describe("riesgo de sobredesarrollo", () => {
  // N-06
  it("crece con el espesor, todo lo demás igual", () => {
    let previous = -1;
    for (const depth of [0, 1200, 2200, 3500]) {
      const r = overdevelopmentRisk({ cumulusDepthM: m(depth) });
      expect(r.riskPoints).toBeGreaterThanOrEqual(previous);
      previous = r.riskPoints;
    }
    expect(DEPTH_THRESHOLDS_M).toEqual([1000, 2000, 3000]);
  });

  it("sin ningún indicador el riesgo es nulo", () => {
    const r = overdevelopmentRisk({ cumulusDepthM: m(500) });
    expect(r.level).toBe("none");
    expect(r.drivers).toEqual([]);
  });

  it("declara qué indicadores lo empujan", () => {
    const r = overdevelopmentRisk({
      cumulusDepthM: m(2500),
      midLevelHumidityFrac: 0.85,
      capeBand: "strong",
      convectiveInhibitionJkg: -5,
      cloudCoverMidFrac: 0.7,
    });
    expect(r.drivers).toContain("depth");
    expect(r.drivers).toContain("midlevel_moisture");
    expect(r.drivers).toContain("cape");
    expect(r.drivers).toContain("low_inhibition");
    expect(r.drivers).toContain("cloud_cover");
    expect(r.level).toBe("severe");
  });

  it("una inhibición fuerte no cuenta como indicador", () => {
    const r = overdevelopmentRisk({
      cumulusDepthM: m(1500),
      convectiveInhibitionJkg: -120,
    });
    expect(r.drivers).not.toContain("low_inhibition");
  });

  it("la CAPE solo suma riesgo, nunca lo resta", () => {
    const without = overdevelopmentRisk({ cumulusDepthM: m(1500) });
    const with2500 = overdevelopmentRisk({
      cumulusDepthM: m(1500),
      capeBand: "strong",
    });
    expect(with2500.riskPoints).toBeGreaterThan(without.riskPoints);
  });

  it("es ordinal, no binario", () => {
    const levels = [0, 1500, 2500, 3500].map(
      (depth) =>
        overdevelopmentRisk(
          depth > 2000
            ? { cumulusDepthM: m(depth), capeBand: "moderate" }
            : { cumulusDepthM: m(depth) },
        ).level,
    );
    expect(new Set(levels).size).toBeGreaterThan(2);
  });
});

describe("techo utilizable", () => {
  const base = {
    hcritAglM: m(2200),
    thermalTopAglM: m(2600),
    cloudBaseAglM: null,
    overcast: false,
    elevationMslM: m(1001),
  };

  // N-03, P-02
  it("con nubes lo limita la base y lo dice", () => {
    const r = usableCeiling({ ...base, cloudBaseAglM: m(1800) });
    expect(r.aglM).toBe(1800);
    expect(r.limitedBy).toBe("cloudbase");
    expect(r.mslM).toBe(2801);
  });

  it("en día azul lo limita la altura crítica", () => {
    const r = usableCeiling(base);
    expect(r.aglM).toBe(2200);
    expect(r.limitedBy).toBe("hcrit");
  });

  it("si el techo térmico es el más bajo, manda él", () => {
    const r = usableCeiling({ ...base, thermalTopAglM: m(1500) });
    expect(r.aglM).toBe(1500);
    expect(r.limitedBy).toBe("boundary_layer");
  });

  // N-04
  it("el cielo cerrado corta el día", () => {
    const r = usableCeiling({ ...base, overcast: true, cloudBaseAglM: m(1800) });
    expect(r.aglM).toBe(0);
    expect(r.limitedBy).toBe("overcast");
  });

  it("sin convección el techo es cero y se declara", () => {
    expect(usableCeiling({ ...base, hcritAglM: null }).limitedBy).toBe("no_convection");
    expect(usableCeiling({ ...base, thermalTopAglM: m(0) }).limitedBy).toBe(
      "no_convection",
    );
  });

  // P-02
  it("nunca supera el menor de la altura crítica y la base de nubes", () => {
    for (const hcrit of [800, 1500, 2200, 3000]) {
      for (const cloud of [900, 1600, 2400, 4000]) {
        const r = usableCeiling({
          ...base,
          hcritAglM: m(hcrit),
          cloudBaseAglM: m(cloud),
          thermalTopAglM: m(3500),
        });
        expect(r.aglM).toBeLessThanOrEqual(Math.min(hcrit, cloud));
      }
    }
  });

  it("la conversión a MSL es coherente con la elevación", () => {
    const r = usableCeiling({ ...base, elevationMslM: m(500) });
    expect(r.mslM - r.aglM).toBe(500);
    expect(kToCelsius(celsiusToK(0))).toBeCloseTo(0, 9);
  });
});

describe("indicadores parciales del sobredesarrollo", () => {
  it("la humedad media alta suma menos que la muy alta", () => {
    const moderate = overdevelopmentRisk({
      cumulusDepthM: m(0),
      midLevelHumidityFrac: 0.65,
    });
    const high = overdevelopmentRisk({
      cumulusDepthM: m(0),
      midLevelHumidityFrac: 0.9,
    });
    expect(moderate.riskPoints).toBe(1);
    expect(high.riskPoints).toBe(2);
  });

  it("la humedad baja no suma nada", () => {
    const r = overdevelopmentRisk({ cumulusDepthM: m(0), midLevelHumidityFrac: 0.3 });
    expect(r.riskPoints).toBe(0);
    expect(r.drivers).not.toContain("midlevel_moisture");
  });

  it("las bandas de CAPE bajas no suman", () => {
    expect(
      overdevelopmentRisk({ cumulusDepthM: m(0), capeBand: "none" }).riskPoints,
    ).toBe(0);
    expect(
      overdevelopmentRisk({ cumulusDepthM: m(0), capeBand: "weak" }).riskPoints,
    ).toBe(0);
    expect(
      overdevelopmentRisk({ cumulusDepthM: m(0), capeBand: "extreme" }).riskPoints,
    ).toBe(3);
  });

  it("una inhibición ausente no cuenta como débil", () => {
    const r = overdevelopmentRisk({
      cumulusDepthM: m(0),
      convectiveInhibitionJkg: null,
    });
    expect(r.drivers).not.toContain("low_inhibition");
  });
});
