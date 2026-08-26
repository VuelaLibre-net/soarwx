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
 * Recalculation of the reference case from meteorological notes (`docs/chatgpt_meteo_analisis.md`).
 *
 * Input parameters from Fuentemilanos report:
 * Surface 34.6 °C / Dewpoint 6.8 °C, surface pressure 909 hPa, shortwave radiation 894 W/m²,
 * cloud cover 4%, wind 5 kt, reported w* 3.0 m/s, reported ceiling 3365 m AGL.
 */
const TEMP_K = K(34.6 + 273.15);
const DEWPOINT_K = K(6.8 + 273.15);
const PRESSURE_PA = Pa(909e2);
const SHORTWAVE_WM2 = wm2(894);
const REPORTED_ZI_M = m(3365);
const REPORTED_WSTAR_MS = mps(3.0);

describe("ChatGPT meteorological analysis reference case", () => {
  const theta = potentialTemperature(TEMP_K, PRESSURE_PA);

  const flux = surfaceHeatFlux({
    shortwaveDownWm2: SHORTWAVE_WM2,
    surfaceTempK: TEMP_K,
    surfaceDewpointK: DEWPOINT_K,
    surfacePressurePa: PRESSURE_PA,
    cloudCoverFrac: 0.04,
    surfaceType: "cropland",
  });

  // G-12: the predecessor report underestimated surface heating.
  it("sensible heat flux exceeds fixed 0.30 fraction", () => {
    const predecessor = 0.3 * SHORTWAVE_WM2; // 268 W/m²
    expect(flux.netRadiationWm2).toBeCloseTo(617, 0);
    expect(flux.sensibleHeatWm2).toBeCloseTo(346, 0);
    expect(flux.sensibleHeatWm2).toBeGreaterThan(predecessor);
  });

  it("reported w* matches flawed fixed-fraction derivation", () => {
    const required = Math.pow(REPORTED_WSTAR_MS, 3) / ((9.81 / theta) * REPORTED_ZI_M);
    const requiredWm2 = required * flux.airDensityKgM3 * 1004.67;
    expect(requiredWm2).toBeCloseTo(0.3 * SHORTWAVE_WM2, -1);
  });

  it("w* with rigorous surface energy balance is higher than reported value", () => {
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

  // G-10, G-11: Espy rule check
  it("reported cloud base corresponds to Espy rule rather than independent sounding analysis", () => {
    const spreadC = 34.6 - 6.8;
    expect(spreadC * 122).toBeCloseTo(3392, 0);
    const bolton = lcl(TEMP_K, DEWPOINT_K, PRESSURE_PA);
    expect(bolton.heightAboveParcelM).toBeCloseTo(3461, 0);
  });

  // G-08: 1.8 m/s was simply 0.6 * w*
  it("reported mean climb does not match physical core or variometer values", () => {
    expect(0.6 * REPORTED_WSTAR_MS).toBeCloseTo(1.8, 10);

    const samples = [...Array(199)].map((_, i) =>
      updraftPeakAt(REPORTED_WSTAR_MS, m((REPORTED_ZI_M * (i + 1)) / 200), REPORTED_ZI_M),
    );
    const peak = Math.max(...samples);
    expect(peak).toBeCloseTo(2.79, 2);
    expect(peak / REPORTED_WSTAR_MS).toBeCloseTo(0.93, 2);

    const rasp = meanClimbOverBand(REPORTED_WSTAR_MS, REPORTED_ZI_M, RASP_REFERENCE);
    if (!rasp.ok) throw new Error(rasp.error.message);
    expect(rasp.value).toBeCloseTo(1.11, 2);

    const vario = meanClimbOverBand(REPORTED_WSTAR_MS, REPORTED_ZI_M, GLIDER_CLUB);
    if (!vario.ok) throw new Error(vario.error.message);
    expect(vario.value).toBeCloseTo(1.28, 2);
    expect(vario.value).toBeGreaterThan(rasp.value);
    expect(vario.value).toBeLessThan(0.6 * REPORTED_WSTAR_MS);
  });

  // G-09: reported ceiling was boundary layer height rather than usable hcrit
  it("usable hcrit is well below boundary layer height declared in predecessor report", () => {
    const critical = criticalHeight(REPORTED_WSTAR_MS, REPORTED_ZI_M, GLIDER_CLUB);
    if (!critical.ok) throw new Error(critical.error.message);
    expect(critical.value.hcritAglM).toBeCloseTo(2364, 0);
    expect(critical.value.peakHeightAglM).toBeCloseTo(642, 0);
    expect(REPORTED_ZI_M - critical.value.hcritAglM).toBeGreaterThan(900);
  });
});
