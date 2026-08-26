import { describe, expect, it } from "vitest";
import * as en from "../../src/i18n/en.js";
import { DEFAULT_FACTORS } from "../../src/forecast/factors.js";
import { evaluateVetoes } from "../../src/forecast/vetoes.js";
import { capeRisk } from "../../src/stability/capeRisk.js";
import { m } from "../../src/units/branded.js";

describe("translation coverage (en)", () => {
  it("all factors have descriptive text", () => {
    for (const id of Object.keys(DEFAULT_FACTORS) as (keyof typeof DEFAULT_FACTORS)[]) {
      expect(en.describeFactor(id).length).toBeGreaterThan(3);
    }
  });

  it("all possible vetoes have descriptive text", () => {
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
      expect(en.describeVeto(veto.id).length).toBeGreaterThan(5);
    }
  });

  it("all levels, ceiling limits and bands have descriptive text", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(en.describeLevel(level).length).toBeGreaterThan(3);
    }
    for (const limit of [
      "cloudbase",
      "hcrit",
      "boundary_layer",
      "overcast",
      "no_convection",
    ] as const) {
      expect(en.describeCeilingLimit(limit)).toContain(" ");
    }
    for (const band of ["none", "weak", "moderate", "strong", "extreme"] as const) {
      expect(en.describeCapeBand(band).length).toBeGreaterThan(3);
    }
    for (const q of ["broken", "tilted", "organised"] as const) {
      expect(en.describeThermalQuality(q).toLowerCase()).toContain("thermal");
    }
    for (const w of ["none", "marginal", "likely", "strong"] as const) {
      expect(en.describeWave(w).length).toBeGreaterThan(3);
    }
    for (const source of ["model", "computed", "unavailable"] as const) {
      expect(en.describeLiftedIndexSource(source).length).toBeGreaterThan(5);
    }
    for (const source of ["model", "energy_balance"] as const) {
      expect(en.describeHeatFluxSource(source)).toContain("heat flux");
    }
    for (const kind of ["inversion", "stable", "isothermal"] as const) {
      expect(en.describeLayer(kind).length).toBeGreaterThan(3);
    }
    for (const band of ["insufficient", "marginal", "optimal", "dangerous"] as const) {
      expect(en.describeRidgeLift(band).length).toBeGreaterThan(5);
    }
    for (const method of ["scorer", "heuristic"] as const) {
      expect(en.describeWaveMethod(method).length).toBeGreaterThan(5);
    }
    for (const level of ["low", "medium", "high"] as const) {
      expect(en.describeConfidence(level)).toContain("confidence");
    }
    for (const band of [
      "stable",
      "marginally_unstable",
      "moderately_unstable",
      "very_unstable",
      "extremely_unstable",
    ] as const) {
      expect(en.describeLiftedIndex(band).length).toBeGreaterThan(5);
    }
    for (const level of ["none", "low", "moderate", "high", "severe"] as const) {
      expect(en.describeOverdevelopment(level).toLowerCase()).toContain(
        "overdevelopment",
      );
    }
  });
});

describe("date formatting (en)", () => {
  it("uses site timezone", () => {
    const madrid = en.formatHour("2026-08-18T12:00", "Europe/Madrid");
    const canarias = en.formatHour("2026-08-18T12:00", "Atlantic/Canary");
    expect(madrid).not.toBe(canarias);
    expect(madrid).toMatch(/\d{2}:\d{2}/);
  });

  it("full instant includes day and month in English", () => {
    const label = en.formatInstant("2026-08-18T12:00", "Europe/Madrid");
    expect(label).toContain("August");
    expect(label).toContain("18");
  });

  it("accepts timestamps with seconds and UTC zone", () => {
    expect(en.formatHour("2026-08-18T12:00:00Z", "Europe/Madrid")).toMatch(/\d{2}:\d{2}/);
  });
});

describe("mandatory disclaimer (en)", () => {
  it("mentions briefing and pilot in command", () => {
    expect(en.DISCLAIMER).toContain("briefing");
    expect(en.DISCLAIMER).toContain("pilot");
  });
});
