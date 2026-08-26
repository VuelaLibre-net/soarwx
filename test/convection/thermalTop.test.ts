import { describe, expect, it } from "vitest";
import {
  WORKING_THERMAL_INDEX_K,
  superadiabaticExcessK,
  thermalIndexAt,
  thermalTop,
} from "../../src/convection/thermalIndex.js";
import { buildSounding } from "../../src/sounding/build.js";
import { celsiusToK, kToCelsius } from "../../src/units/convert.js";
import { K, m } from "../../src/units/branded.js";
import { syntheticSounding } from "../helpers/synthetic.js";
import {
  indexOfLocalHour,
  loadFixture,
  series,
  seriesMax,
  times,
  toSoundingInput,
} from "../helpers/fixture.js";

describe("índice térmico", () => {
  const sounding = syntheticSounding(30, 2000, 3);

  it("es negativo dentro de la capa mezclada y positivo por encima", () => {
    const below = thermalIndexAt(sounding, celsiusToK(30), m(1500));
    const above = thermalIndexAt(sounding, celsiusToK(30), m(2600));
    expect(below.ok && below.value).toBeLessThan(0);
    expect(above.ok && above.value).toBeGreaterThan(0);
  });

  // P-05
  it("cambia de signo exactamente una vez por debajo de la inversión", () => {
    let changes = 0;
    let previous: number | null = null;
    for (let z = 100; z <= 2600; z += 25) {
      const ti = thermalIndexAt(sounding, celsiusToK(30), m(z));
      if (!ti.ok) continue;
      const sign = Math.sign(ti.value);
      if (previous !== null && sign !== previous && sign !== 0) changes++;
      previous = sign;
    }
    expect(changes).toBe(1);
  });

  it("una parcela más caliente da índices más negativos", () => {
    const cool = thermalIndexAt(sounding, celsiusToK(28), m(1500));
    const warm = thermalIndexAt(sounding, celsiusToK(32), m(1500));
    expect(cool.ok && warm.ok).toBe(true);
    if (!cool.ok || !warm.ok) return;
    expect(warm.value).toBeLessThan(cool.value);
  });

  it("fuera del sondeo propaga el error de interpolación", () => {
    const r = thermalIndexAt(sounding, celsiusToK(30), m(9000));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("OUT_OF_VALID_RANGE");
  });
});

describe("techo térmico por el método de la parcela", () => {
  // B-01
  it("encuentra el techo en la capa que contiene la inversión", () => {
    const sounding = syntheticSounding(30, 2000, 3);
    const r = thermalTop(sounding, celsiusToK(30));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // La inversión empieza a 2000 m, pero los niveles que la acotan están a
    // 1760 y 2030 m: el techo cae dentro de esa capa. La discretización, no el
    // método, es lo que limita la precisión.
    expect(r.value.topAglM).toBeGreaterThan(1700);
    expect(r.value.topAglM).toBeLessThan(2100);
    expect(r.value.method).toBe("parcel");
  });

  // B-02
  it("el techo de trabajo queda por debajo del absoluto", () => {
    // Con la parcela 3 K por encima del perfil, el índice térmico llega a −2 K
    // dentro de la capa mezclada y el techo de trabajo se separa del absoluto.
    const r = thermalTop(syntheticSounding(30, 2000, 3), celsiusToK(33));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.workingTopAglM).toBeLessThan(r.value.topAglM);
    expect(WORKING_THERMAL_INDEX_K).toBe(-2);
  });

  it("sin llegar a TI = −2 el techo de trabajo iguala al absoluto", () => {
    const r = thermalTop(syntheticSounding(30, 2000, 3), celsiusToK(30));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.workingTopAglM).toBeCloseTo(r.value.topAglM, 6);
  });

  it("una inversión más alta da un techo más alto", () => {
    const low = thermalTop(syntheticSounding(30, 1500, 3), celsiusToK(30));
    const high = thermalTop(syntheticSounding(30, 2500, 3), celsiusToK(30));
    expect(low.ok && high.ok).toBe(true);
    if (!low.ok || !high.ok) return;
    expect(high.value.topAglM).toBeGreaterThan(low.value.topAglM);
  });

  it("identifica la capa estable que corta el ascenso", () => {
    const r = thermalTop(syntheticSounding(30, 2000, 3), celsiusToK(30));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.cappedByInversion).not.toBeNull();
    expect(r.value.cappedByInversion?.kind).toBe("inversion");
  });

  it("sin flotabilidad por encima del suelo es NO_CONVECTION", () => {
    const stable = syntheticSounding(30, 0, 5);
    const r = thermalTop(stable, celsiusToK(20));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NO_CONVECTION");
  });

  it("una parcela que no deja de flotar dentro del sondeo se declara, no se inventa", () => {
    const r = thermalTop(syntheticSounding(30, 6000, 0), celsiusToK(60));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("OUT_OF_VALID_RANGE");
  });

  it("un sondeo sin capas es INSUFFICIENT_LEVELS", () => {
    const sounding = syntheticSounding(30, 2000, 3);
    const r = thermalTop({ ...sounding, levels: [] }, celsiusToK(30));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INSUFFICIENT_LEVELS");
  });
});

describe("exceso superadiabático de la capa superficial", () => {
  const fixture = loadFixture("lefm-2026-08-18-icon_eu.json");
  const noon = buildSounding(toSoundingInput(fixture, indexOfLocalHour(fixture, 14)));
  const morning = buildSounding(toSoundingInput(fixture, indexOfLocalHour(fixture, 8)));

  it("a mediodía la superficie está 2.1 K por encima de la capa mezclada", () => {
    expect(noon.ok).toBe(true);
    if (!noon.ok) return;
    expect(superadiabaticExcessK(noon.value)).toBeCloseTo(2.13, 1);
  });

  it("por la mañana temprano el exceso es pequeño o nulo", () => {
    expect(morning.ok).toBe(true);
    if (!morning.ok) return;
    expect(superadiabaticExcessK(morning.value)).toBeLessThan(1);
  });

  it("nunca es negativo", () => {
    expect(noon.ok).toBe(true);
    if (!noon.ok) return;
    expect(superadiabaticExcessK(noon.value, m(50))).toBeGreaterThanOrEqual(0);
  });

  it("el techo de capa mezclada es más conservador que el de superficie", () => {
    expect(noon.ok).toBe(true);
    if (!noon.ok) return;
    const tmax = seriesMax(fixture, "temperature_2m");
    const r = thermalTop(noon.value, celsiusToK(tmax));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Descontar 2.13 K de exceso baja el techo unos 800 m: la diferencia entre
    // prometer 3357 m y prometer 2584 m.
    expect(r.value.mixedLayerTopAglM).toBeLessThan(r.value.topAglM);
    expect(r.value.topAglM - r.value.mixedLayerTopAglM).toBeGreaterThan(400);
  });
});

describe("evolución diurna sobre datos reales", () => {
  const gfs = loadFixture("lefm-2026-08-18-gfs_seamless.json");

  it("el techo crece durante la mañana y desaparece al anochecer", () => {
    const tops: number[] = [];
    for (const hour of [10, 12, 14, 16]) {
      const built = buildSounding(toSoundingInput(gfs, indexOfLocalHour(gfs, hour)));
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      const r = thermalTop(built.value, built.value.surface.tempK);
      expect(r.ok).toBe(true);
      if (r.ok) tops.push(r.value.topAglM);
    }
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i]!).toBeGreaterThan(tops[i - 1]!);
    }

    const night = buildSounding(toSoundingInput(gfs, indexOfLocalHour(gfs, 20)));
    expect(night.ok).toBe(true);
    if (!night.ok) return;
    const r = thermalTop(night.value, night.value.surface.tempK);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NO_CONVECTION");
  });

  it("la temperatura que se pasa manda: con la máxima del día el techo no evoluciona", () => {
    // Con la máxima del día el método clásico da el techo del día, no el de la
    // hora. Documentado para que la fase de informe pase la temperatura correcta.
    const tmax = K(seriesMax(gfs, "temperature_2m") + 273.15);
    const tops: number[] = [];
    for (const hour of [10, 14, 18]) {
      const built = buildSounding(toSoundingInput(gfs, indexOfLocalHour(gfs, hour)));
      if (!built.ok) return;
      const r = thermalTop(built.value, tmax);
      if (r.ok) tops.push(r.value.topAglM);
    }
    expect(tops).toHaveLength(3);
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(500);
    expect(Math.min(...tops)).toBeGreaterThan(3000);
  });
});

describe("comparación con el diagnóstico del modelo", () => {
  const gfs = loadFixture("lefm-2026-08-18-gfs_seamless.json");
  const blh = series(gfs, "boundary_layer_height");
  const sw = series(gfs, "shortwave_radiation");

  // B-04
  it("boundary_layer_height alcanza su máximo cuando las térmicas ya mueren", () => {
    const peakIndex = blh.reduce<number>(
      (best, value, i) => ((value ?? -1) > (blh[best] ?? -1) ? i : best),
      0,
    );
    const localHour = Number(times(gfs)[peakIndex]!.slice(11, 13));
    expect(localHour).toBe(18);
    // A esa hora la radiación ya ha caído casi un 30 % desde el máximo del día.
    const maxSw = Math.max(...sw.map((v) => v ?? 0));
    expect((sw[peakIndex] ?? 0) / maxSw).toBeLessThan(0.75);
  });

  // B-03
  it("el techo por parcela y el del modelo se exponen por separado", () => {
    const i = indexOfLocalHour(gfs, 14);
    const built = buildSounding(toSoundingInput(gfs, i));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const r = thermalTop(built.value, built.value.surface.tempK);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(kToCelsius(built.value.surface.tempK)).toBeGreaterThan(30);
    expect(r.value.topAglM).toBeGreaterThan(2000);
    expect(blh[i]).toBeGreaterThan(2000);
  });
});
