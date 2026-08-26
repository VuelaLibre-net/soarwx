import { describe, expect, it } from "vitest";
import { computeDay } from "../../src/report/assemble.js";
import { confidenceFrom } from "../../src/forecast/confidence.js";
import { CAPPED_CEILING_AGL_M } from "../../src/forecast/vetoes.js";
import { m, mps } from "../../src/units/branded.js";
import { loadFixture, toHourlyObservations } from "../helpers/fixture.js";
import { FUENTEMILANOS_SITE } from "../helpers/sites.js";

const day = (name: string, convention: "down_positive" | "up_positive") => {
  const fixture = loadFixture(name);
  const result = computeDay({
    site: FUENTEMILANOS_SITE,
    hourly: toHourlyObservations(fixture, FUENTEMILANOS_SITE, convention),
    dateLocal: "2026-08-18",
    sunriseUtc: "2026-08-18T05:30",
    sunsetUtc: "2026-08-18T19:11",
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

const icon = day("lefm-2026-08-18-icon_eu.json", "down_positive");
const gfs = day("lefm-2026-08-18-gfs_seamless.json", "up_positive");
const hourAt = (d: typeof icon, local: string) =>
  d.hours.find((h) => h.timeUtc.slice(11, 16) === local);

// G-01
describe("un día real de Fuentemilanos", () => {
  it("se calcula completo", () => {
    expect(icon.hours).toHaveLength(24);
    expect(icon.dateLocal).toBe("2026-08-18");
    expect(icon.site.icao).toBe("LEFM");
  });

  it("usa el flujo del modelo, no la reconstrucción", () => {
    for (const hour of icon.hours) {
      expect(hour.quality.heatFluxSource).toBe("model");
      expect(hour.quality.heatFluxEstimated).not.toContain("sensible_heat_flux");
    }
  });

  // El signo de `sensible_heat_flux` depende del modelo: ICON lo sirve
  // positivo hacia abajo y GFS positivo hacia arriba. El informe tiene que
  // publicarlo ya normalizado, positivo hacia arriba, o el consumidor pinta
  // una tarde de agosto enfriándose. Ver OPEN_METEO_INTEGRATION.md §4.1.
  it("publica el calentamiento en superficie con el signo normalizado", () => {
    for (const d of [icon, gfs]) {
      const noon = hourAt(d, "14:00")!;
      expect(noon.thermal.surfaceHeatFluxWm2).toBeGreaterThan(0);
      expect(noon.thermal.netRadiationWm2).toBeGreaterThan(0);

      const night = hourAt(d, "04:00")!;
      expect(night.thermal.surfaceHeatFluxWm2).toBeLessThan(
        noon.thermal.surfaceHeatFluxWm2,
      );
    }
  });

  it("conserva la calidad del sondeo: cuatro niveles bajo tierra", () => {
    expect(hourAt(icon, "14:00")?.quality.levelsDiscardedBelowGround).toBe(4);
    expect(hourAt(icon, "14:00")?.quality.pressureLevelsUsed).toBe(6);
  });

  it("de noche no hay convección y se dice", () => {
    const night = hourAt(icon, "04:00");
    expect(night?.thermal.wStarMs).toBe(0);
    expect(night?.ceiling.limitedBy).toBe("no_convection");
    expect(night?.score.vetoes.map((v) => v.id)).toContain("no_convection");
    expect(night?.score.level).toBe(1);
  });

  it("el techo crece durante la mañana y el mejor momento es por la tarde", () => {
    const morning = hourAt(icon, "10:00")!.ceiling.aglM;
    const noon = hourAt(icon, "14:00")!.ceiling.aglM;
    const afternoon = hourAt(icon, "16:00")!.ceiling.aglM;
    expect(noon).toBeGreaterThan(morning);
    expect(afternoon).toBeGreaterThan(noon);
    expect(Number(icon.best?.timeUtc.slice(11, 13))).toBeGreaterThanOrEqual(13);
  });

  it("el techo lo limita la altura crítica, no el modelo", () => {
    expect(hourAt(icon, "14:00")?.ceiling.limitedBy).toBe("hcrit");
  });

  it("es un día azul, coherente con los 29 K de separación", () => {
    expect(hourAt(icon, "14:00")?.cloud.blue).toBe(true);
    expect(hourAt(gfs, "14:00")?.cloud.blue).toBe(true);
  });

  // R-10.6: el LI del modelo es positivo, pero la capa convectiva pasa de
  // 2000 m. Un índice de convección profunda no puede topar un día de capa
  // límite que funciona. Ver AUDIT.md O-1.
  it("un LI positivo no topa el día si la capa convectiva da de sí", () => {
    const noon = hourAt(gfs, "14:00")!;
    expect(noon.stability.liftedIndexSource).toBe("model");
    expect(noon.stability.liftedIndex).toBeGreaterThanOrEqual(0);
    expect(noon.ceiling.aglM).toBeGreaterThan(CAPPED_CEILING_AGL_M);
    expect(noon.score.vetoes.map((v) => v.id)).not.toContain("stable_atmosphere");
    expect(noon.score.level).toBe(noon.score.levelBeforeVetoes);
  });

  it("ICON no trae lifted_index y el respaldo se declara", () => {
    expect(hourAt(icon, "14:00")?.stability.liftedIndexSource).toBe("computed");
  });

  it("encuentra una ventana de tarde", () => {
    expect(icon.windows.length).toBeGreaterThan(0);
    const window = icon.windows[0]!;
    expect(Number(window.startUtc.slice(11, 13))).toBeGreaterThanOrEqual(11);
    expect(window.durationHours).toBeGreaterThanOrEqual(4);
  });

  it("todos los factores traen su desglose", () => {
    for (const hour of icon.hours) {
      expect(hour.score.factors).toHaveLength(7);
      for (const factor of hour.score.factors) {
        expect(factor.unit.length).toBeGreaterThan(0);
        expect(factor.weight).toBeGreaterThan(0);
        expect(Number.isFinite(factor.value)).toBe(true);
        expect(factor.score).toBeGreaterThanOrEqual(0);
        expect(factor.score).toBeLessThanOrEqual(1);
      }
    }
  });

  // G-16
  it("lleva la atribución obligatoria", () => {
    expect(icon.attribution).toContain("Open-Meteo");
    expect(icon.attribution).toContain("CC BY 4.0");
  });

  // V-09
  it("es determinista", () => {
    const again = day("lefm-2026-08-18-icon_eu.json", "down_positive");
    expect(JSON.stringify(again.hours)).toBe(JSON.stringify(icon.hours));
  });

  // P-10
  it("ningún campo numérico sale NaN", () => {
    const walk = (value: unknown): void => {
      if (typeof value === "number") {
        expect(Number.isNaN(value)).toBe(false);
      } else if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value !== null && typeof value === "object") {
        Object.values(value).forEach(walk);
      }
    };
    walk(icon.hours);
  });
});

describe("los dos modelos, el mismo día", () => {
  it("GFS da un día más fuerte que ICON, coherente con su flujo de calor", () => {
    // ICON da 243 W/m² al mediodía y GFS 417: el techo y la ascendencia siguen.
    expect(hourAt(gfs, "14:00")!.thermal.wStarMs).toBeGreaterThan(
      hourAt(icon, "14:00")!.thermal.wStarMs,
    );
    expect(hourAt(gfs, "14:00")!.ceiling.aglM).toBeGreaterThan(
      hourAt(icon, "14:00")!.ceiling.aglM,
    );
  });

  it("ambos coinciden en el diagnóstico: día azul de nivel 4", () => {
    for (const d of [icon, gfs]) {
      const noon = hourAt(d, "14:00")!;
      expect(noon.cloud.blue).toBe(true);
      expect(noon.score.level).toBe(4);
    }
  });

  // G-04
  it("con un solo modelo la confianza es null", () => {
    expect(icon.confidence).toBeNull();
  });

  // G-03
  it("la dispersión entre ambos se puede medir", () => {
    const confidence = confidenceFrom([
      {
        model: "icon_eu",
        ceilingAglM: hourAt(icon, "14:00")!.ceiling.aglM,
        wStarMs: hourAt(icon, "14:00")!.thermal.wStarMs,
      },
      {
        model: "gfs_seamless",
        ceilingAglM: hourAt(gfs, "14:00")!.ceiling.aglM,
        wStarMs: hourAt(gfs, "14:00")!.thermal.wStarMs,
      },
    ]);
    expect(confidence).not.toBeNull();
    expect(confidence?.modelsUsed).toHaveLength(2);
    // 1943 frente a 2537 m: los modelos no concuerdan del todo.
    expect(confidence?.ceilingSpreadM).toBeGreaterThan(300);
  });
});

describe("casos degenerados", () => {
  it("sin observaciones no se inventa un día", () => {
    const result = computeDay({
      site: FUENTEMILANOS_SITE,
      hourly: [],
      dateLocal: "2026-08-18",
      sunriseUtc: "2026-08-18T05:30",
      sunsetUtc: "2026-08-18T19:11",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_VARIABLE");
  });

  it("la confianza inyectada se propaga", () => {
    const fixture = loadFixture("lefm-2026-08-18-icon_eu.json");
    const confidence = confidenceFrom([
      { model: "a", ceilingAglM: m(2000), wStarMs: mps(2.4) },
      { model: "b", ceilingAglM: m(2100), wStarMs: mps(2.5) },
    ]);
    const result = computeDay({
      site: FUENTEMILANOS_SITE,
      hourly: toHourlyObservations(fixture, FUENTEMILANOS_SITE, "down_positive"),
      dateLocal: "2026-08-18",
      sunriseUtc: "2026-08-18T05:30",
      sunsetUtc: "2026-08-18T19:11",
      confidence,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.confidence?.level).toBe("high");
  });

  it("una configuración distinta cambia el veredicto del día", () => {
    const fixture = loadFixture("lefm-2026-08-18-gfs_seamless.json");
    const hourly = toHourlyObservations(fixture, FUENTEMILANOS_SITE, "up_positive");
    const strict = computeDay({
      site: FUENTEMILANOS_SITE,
      hourly,
      dateLocal: "2026-08-18",
      sunriseUtc: "2026-08-18T05:30",
      sunsetUtc: "2026-08-18T19:11",
      scoring: { levelThresholds: [0.5, 0.75, 0.95, 0.99] },
    });
    expect(strict.ok).toBe(true);
    if (!strict.ok) return;
    const noon = strict.value.hours.find((h) => h.timeUtc.slice(11, 16) === "14:00");
    expect(noon?.score.levelBeforeVetoes).toBeLessThan(4);
  });
});

describe("caminos de respaldo", () => {
  const base = {
    site: FUENTEMILANOS_SITE,
    dateLocal: "2026-08-18",
    sunriseUtc: "2026-08-18T05:30",
    sunsetUtc: "2026-08-18T19:11",
  };

  it("sin lifted_index calculable, la fuente es «no disponible»", () => {
    const fixture = loadFixture("lefm-2026-08-18-icon_eu.json");
    const hourly = toHourlyObservations(fixture, FUENTEMILANOS_SITE, "down_positive").map(
      (observation) => ({
        ...observation,
        modelLiftedIndex: null,
        // Sondeo truncado por debajo de 500 hPa: el LI no se puede calcular.
        sounding: {
          ...observation.sounding,
          levels: observation.sounding.levels.filter((l) => l.pressurePa > 60000),
        },
      }),
    );
    const result = computeDay({ ...base, hourly });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const noon = result.value.hours.find((h) => h.timeUtc.slice(11, 16) === "14:00");
    expect(noon?.stability.liftedIndexSource).toBe("unavailable");
    expect(noon?.stability.liftedIndex).toBeNull();
    // Y sin LI no se veta por estabilidad: ausente no es cero.
    expect(noon?.score.vetoes.map((v) => v.id)).not.toContain("stable_atmosphere");
  });

  it("un sondeo sin niveles altos usa el viento de superficie como respaldo", () => {
    const fixture = loadFixture("lefm-2026-08-18-gfs_seamless.json");
    const hourly = toHourlyObservations(fixture, FUENTEMILANOS_SITE, "up_positive").map(
      (observation) => ({
        ...observation,
        sounding: {
          ...observation.sounding,
          levels: observation.sounding.levels.slice(0, 3),
        },
      }),
    );
    const result = computeDay({ ...base, hourly });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const hour of result.value.hours) {
      expect(Number.isFinite(hour.wind.blMean.speedMs)).toBe(true);
      expect(Number.isFinite(hour.wind.blTop.speedMs)).toBe(true);
    }
  });

  it("con nubosidad baja cerrada el día se veta por cielo cubierto", () => {
    const fixture = loadFixture("lefm-2026-08-18-gfs_seamless.json");
    const hourly = toHourlyObservations(fixture, FUENTEMILANOS_SITE, "up_positive").map(
      (observation) => ({
        ...observation,
        sounding: {
          ...observation.sounding,
          surface: { ...observation.sounding.surface, cloudCoverLowFrac: 0.9 },
        },
      }),
    );
    const result = computeDay({ ...base, hourly });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const noon = result.value.hours.find((h) => h.timeUtc.slice(11, 16) === "14:00");
    expect(noon?.cloud.overcast).toBe(true);
    expect(noon?.score.vetoes.map((v) => v.id)).toContain("overcast");
    expect(noon?.ceiling.limitedBy).toBe("overcast");
    expect(result.value.best).toBeNull();
  });

  it("una superficie declarada por el emplazamiento se respeta", () => {
    const fixture = loadFixture("lefm-2026-08-18-icon_eu.json");
    const arid = {
      ...FUENTEMILANOS_SITE,
      surface: { type: "arid" as const, albedoFrac: 0.32 },
    };
    const hourly = toHourlyObservations(fixture, arid, "down_positive");
    const result = computeDay({ ...base, site: arid, hourly });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hours[14]?.quality.heatFluxEstimated).not.toContain("albedo");
    }
  });
});
