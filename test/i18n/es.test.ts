import { describe, expect, it } from "vitest";
import * as es from "../../src/i18n/es.js";
import { DEFAULT_FACTORS } from "../../src/forecast/factors.js";
import { evaluateVetoes } from "../../src/forecast/vetoes.js";
import { capeRisk } from "../../src/stability/capeRisk.js";
import { m } from "../../src/units/branded.js";

// I-03
describe("cobertura de traducción", () => {
  it("todos los factores tienen texto", () => {
    for (const id of Object.keys(DEFAULT_FACTORS) as (keyof typeof DEFAULT_FACTORS)[]) {
      expect(es.describeFactor(id).length).toBeGreaterThan(3);
    }
  });

  it("todos los vetos posibles tienen texto", () => {
    // Se disparan todos a la vez y se comprueba que ninguno queda sin traducir.
    const vetoes = evaluateVetoes({
      hasConvection: false,
      overcast: true,
      usableCeilingAglM: m(100),
      liftedIndex: 3,
      cape: capeRisk(4000),
      kIndex: 30,
      surfaceWindMs: 20,
    });
    expect(vetoes.length).toBeGreaterThanOrEqual(5);
    for (const veto of vetoes) {
      expect(es.describeVeto(veto.id).length).toBeGreaterThan(5);
    }
  });

  it("todos los niveles, límites de techo y bandas tienen texto", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(es.describeLevel(level).length).toBeGreaterThan(3);
    }
    for (const limit of [
      "cloudbase",
      "hcrit",
      "boundary_layer",
      "overcast",
      "no_convection",
    ] as const) {
      expect(es.describeCeilingLimit(limit)).toContain(" ");
    }
    for (const band of ["none", "weak", "moderate", "strong", "extreme"] as const) {
      expect(es.describeCapeBand(band).length).toBeGreaterThan(5);
    }
    for (const q of ["broken", "tilted", "organised"] as const) {
      expect(es.describeThermalQuality(q)).toContain("érmica");
    }
    for (const w of ["none", "marginal", "likely", "strong"] as const) {
      expect(es.describeWave(w).length).toBeGreaterThan(3);
    }
    for (const source of ["model", "computed", "unavailable"] as const) {
      expect(es.describeLiftedIndexSource(source).length).toBeGreaterThan(10);
    }
    for (const source of ["model", "energy_balance"] as const) {
      expect(es.describeHeatFluxSource(source)).toContain("flujo de calor");
    }
    for (const kind of ["inversion", "stable", "isothermal"] as const) {
      expect(es.describeLayer(kind).length).toBeGreaterThan(3);
    }
    for (const band of ["insufficient", "marginal", "optimal", "dangerous"] as const) {
      expect(es.describeRidgeLift(band).length).toBeGreaterThan(5);
    }
    for (const method of ["scorer", "heuristic"] as const) {
      expect(es.describeWaveMethod(method)).toContain("por ");
    }
    for (const level of ["low", "medium", "high"] as const) {
      expect(es.describeConfidence(level)).toContain("Confianza");
    }
    for (const band of [
      "stable",
      "marginally_unstable",
      "moderately_unstable",
      "very_unstable",
      "extremely_unstable",
    ] as const) {
      expect(es.describeLiftedIndex(band).length).toBeGreaterThan(5);
    }
    for (const level of ["none", "low", "moderate", "high", "severe"] as const) {
      expect(es.describeOverdevelopment(level)).toContain("desarrollo");
    }
  });
});

describe("formato de fechas", () => {
  it("usa la zona del emplazamiento", () => {
    const madrid = es.formatHour("2026-08-18T12:00", "Europe/Madrid");
    const canarias = es.formatHour("2026-08-18T12:00", "Atlantic/Canary");
    expect(madrid).not.toBe(canarias);
    expect(madrid).toMatch(/\d{2}:\d{2}/);
  });

  it("el instante completo lleva día y mes en español", () => {
    const label = es.formatInstant("2026-08-18T12:00", "Europe/Madrid");
    expect(label).toContain("agosto");
    expect(label).toContain("18");
  });

  it("acepta marcas con segundos y zona", () => {
    expect(es.formatHour("2026-08-18T12:00:00Z", "Europe/Madrid")).toMatch(/\d{2}:\d{2}/);
  });
});

describe("aviso obligatorio", () => {
  it("dice que no sustituye al briefing ni a la decisión del piloto", () => {
    expect(es.DISCLAIMER).toContain("briefing");
    expect(es.DISCLAIMER).toContain("piloto");
  });
});
