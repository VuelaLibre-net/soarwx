/**
 * Sensible heat flux sign normalisation.
 *
 * **The sign convention depends on the forecast model.** Measured at
 * Fuentemilanos on the same day and hour: ICON-EU produces −243.1 W/m² at midday
 * while GFS produces +416.7 W/m². ICON uses positive downward (DWD convention),
 * GFS uses positive upward.
 *
 * Taking the raw value directly into `w*` causes ICON to register negative flux
 * at solar noon and zero convection all day long. It raises no exceptions and
 * silently outputs a plausible yet incorrect soaring forecast.
 *
 * Consequently, sign convention is **auto-detected** rather than hardcoded in
 * a static table: tables silently become obsolete if Open-Meteo updates backend criteria.
 */

export type FluxSignConvention = "up_positive" | "down_positive" | "unknown";

export interface FluxSample {
  readonly shortwaveWm2: number;
  readonly fluxWm2: number | null;
}

export interface FluxSignDetection {
  readonly convention: FluxSignConvention;
  /** Fraction of daytime samples that agree with the selected convention. */
  readonly agreementFrac: number;
  readonly samplesUsed: number;
}

/** Radiation threshold above which the surface is considered heating up. */
export const DAYTIME_RADIATION_THRESHOLD_WM2 = 200;

/** Minimum daytime samples required for reliable detection. Below this, convention is unknown. */
export const MIN_SAMPLES_FOR_DETECTION = 3;

/**
 * Detects sign convention by correlating heat flux with shortwave radiation:
 * when the surface receives > 200 W/m², sensible heat flux is physically
 * directed **upward**, and the sign during those daytime hours reveals the model convention.
 *
 * @source docs/OPEN_METEO_INTEGRATION.md §4.1 (measured conventions).
 */
export function detectFluxSign(
  samples: readonly FluxSample[],
  radiationThresholdWm2: number = DAYTIME_RADIATION_THRESHOLD_WM2,
  minSamples: number = MIN_SAMPLES_FOR_DETECTION,
): FluxSignDetection {
  const daytime = samples.filter(
    (s): s is { shortwaveWm2: number; fluxWm2: number } =>
      s.fluxWm2 !== null && s.shortwaveWm2 >= radiationThresholdWm2 && s.fluxWm2 !== 0,
  );

  if (daytime.length < minSamples) {
    return {
      convention: "unknown",
      agreementFrac: 0,
      samplesUsed: daytime.length,
    };
  }

  const positive = daytime.filter((s) => s.fluxWm2 > 0).length;
  const convention: FluxSignConvention =
    positive * 2 >= daytime.length ? "up_positive" : "down_positive";
  const agreeing = convention === "up_positive" ? positive : daytime.length - positive;

  return {
    convention,
    agreementFrac: agreeing / daytime.length,
    samplesUsed: daytime.length,
  };
}

/**
 * Normalises heat flux to internal convention: **positive upward**.
 *
 * @source docs/OPEN_METEO_INTEGRATION.md §4.1.
 */
export function normaliseUpwardFlux(
  fluxWm2: number,
  convention: FluxSignConvention,
): number | null {
  switch (convention) {
    case "up_positive":
      return fluxWm2;
    case "down_positive":
      return -fluxWm2;
    case "unknown":
      return null;
  }
}
