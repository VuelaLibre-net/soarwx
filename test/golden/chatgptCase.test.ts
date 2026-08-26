import { describe, expect, it } from "vitest";
import { lcl, potentialTemperature } from "../../src/thermo/index.js";
import {
  convectiveVelocityScale,
  criticalHeight,
  meanClimbOverBand,
  surfaceHeatFlux,
  updraftPeakAt,
} from "../../src/convection/index.js";
import { GLIDER_CLUB, RASP_REFERENCE } from "../../src/aircraft/index.js";
import { K, Pa, m, mps, wm2 } from "../../src/units/branded.js";

/**
 * Recálculo del caso concreto que analizan las notas de ChatGPT
 * (`docs/chatgpt_meteo_analisis.md`). Fija la tabla de `AUDIT.md` §3.1, que es
 * lo que sostiene las clasificaciones G-08, G-09, G-10 y G-12.
 *
 * Datos de partida del informe de `open-meteo-soar`: Fuentemilanos, superficie
 * 34.6 °C / rocío 6.8 °C, presión de estación 909 hPa, radiación global
 * 894 W/m², nubosidad 4 %, viento 5 kt, w* 3.0 m/s, techo 3365 m AGL.
 */
const TEMP_K = K(34.6 + 273.15);
const DEWPOINT_K = K(6.8 + 273.15);
const PRESSURE_PA = Pa(909e2);
const SHORTWAVE_WM2 = wm2(894);
const REPORTED_ZI_M = m(3365);
const REPORTED_WSTAR_MS = mps(3.0);

describe("caso de las notas de ChatGPT", () => {
  const theta = potentialTemperature(TEMP_K, PRESSURE_PA);

  const flux = surfaceHeatFlux({
    shortwaveDownWm2: SHORTWAVE_WM2,
    surfaceTempK: TEMP_K,
    surfaceDewpointK: DEWPOINT_K,
    surfacePressurePa: PRESSURE_PA,
    cloudCoverFrac: 0.04,
    surfaceType: "cropland",
  });

  // G-12: el informe subestimaba el calentamiento, no lo exageraba.
  it("el flujo de calor sensible supera al de la fracción fija 0.30", () => {
    const predecessor = 0.3 * SHORTWAVE_WM2; // 268 W/m², defecto A1
    expect(flux.netRadiationWm2).toBeCloseTo(617, 0);
    expect(flux.sensibleHeatWm2).toBeCloseTo(346, 0);
    expect(flux.sensibleHeatWm2).toBeGreaterThan(predecessor);
  });

  // El w* del informe es trazable a la fracción fija 0.30 con un 1 % de margen:
  // es aritmética, no coincidencia.
  it("el w* del informe corresponde al flujo mal derivado", () => {
    const required = Math.pow(REPORTED_WSTAR_MS, 3) / ((9.81 / theta) * REPORTED_ZI_M);
    const requiredWm2 = required * flux.airDensityKgM3 * 1004.67;
    expect(requiredWm2).toBeCloseTo(0.3 * SHORTWAVE_WM2, -1);
  });

  it("w* con el flujo correcto sale mayor que el del informe", () => {
    const wStar = convectiveVelocityScale({
      virtualHeatFluxKMs: flux.virtualHeatFluxKMs,
      mixingHeightAglM: REPORTED_ZI_M,
      surfacePotentialTempK: theta,
      surfaceWindMs: mps(2.57),
      profile: GLIDER_CLUB,
    });
    if (!wStar.ok) throw new Error(wStar.error.message);
    expect(wStar.value.wStarMs).toBeCloseTo(3.28, 2);
  });

  // G-10, G-11: la «base de nubes» del informe es 27.8 × 122, la regla de Espy.
  it("la base del informe es la regla de Espy, no una estimación independiente", () => {
    const spreadC = 34.6 - 6.8;
    expect(spreadC * 122).toBeCloseTo(3392, 0);
    const bolton = lcl(TEMP_K, DEWPOINT_K, PRESSURE_PA);
    expect(bolton.heightAboveParcelM).toBeCloseTo(3461, 0);
  });

  // G-08: 1.8 m/s es 0.6·w*, y no coincide con ninguna magnitud del perfil.
  it("la ascendencia media del informe no es ni el núcleo ni el vario", () => {
    expect(0.6 * REPORTED_WSTAR_MS).toBeCloseTo(1.8, 10);

    const samples = [...Array(199)].map((_, i) =>
      updraftPeakAt(REPORTED_WSTAR_MS, m((REPORTED_ZI_M * (i + 1)) / 200), REPORTED_ZI_M),
    );
    const peak = Math.max(...samples);
    expect(peak).toBeCloseTo(2.79, 2);
    expect(peak / REPORTED_WSTAR_MS).toBeCloseTo(0.93, 2);

    // Con la referencia de RASP, que es contra lo que se contrasta el caso.
    const rasp = meanClimbOverBand(REPORTED_WSTAR_MS, REPORTED_ZI_M, RASP_REFERENCE);
    if (!rasp.ok) throw new Error(rasp.error.message);
    expect(rasp.value).toBeCloseTo(1.11, 2);

    // Y con el perfil de club, que resta la polar real del velero y no el
    // umbral: sube, pero sigue muy por debajo del 0.6·w* del informe.
    const vario = meanClimbOverBand(REPORTED_WSTAR_MS, REPORTED_ZI_M, GLIDER_CLUB);
    if (!vario.ok) throw new Error(vario.error.message);
    expect(vario.value).toBeCloseTo(1.28, 2);
    expect(vario.value).toBeGreaterThan(rasp.value);
    expect(vario.value).toBeLessThan(0.6 * REPORTED_WSTAR_MS);
  });

  // G-09: el techo del informe es boundary_layer_height, no hcrit.
  it("hcrit queda muy por debajo del techo que declara el informe", () => {
    const critical = criticalHeight(REPORTED_WSTAR_MS, REPORTED_ZI_M, GLIDER_CLUB);
    if (!critical.ok) throw new Error(critical.error.message);
    // Los mismos 2364 m que antes de separar el umbral del hundimiento: el
    // techo del caso no se mueve, y ese es el contrato con RASP.
    expect(critical.value.hcritAglM).toBeCloseTo(2364, 0);
    expect(critical.value.peakHeightAglM).toBeCloseTo(642, 0);
    expect(REPORTED_ZI_M - critical.value.hcritAglM).toBeGreaterThan(900);
  });
});
