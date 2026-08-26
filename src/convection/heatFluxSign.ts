/**
 * Normalización del signo del flujo de calor sensible.
 *
 * **La convención depende del modelo.** Medido en Fuentemilanos el mismo día y
 * a la misma hora: ICON-EU da −243.1 W/m² al mediodía y GFS +416.7 W/m². ICON
 * usa flujo positivo hacia abajo (convención DWD), GFS positivo hacia arriba.
 *
 * Tomar el valor tal cual y meterlo en `w*` da, con ICON, flujo negativo al
 * mediodía y cero convección todo el día. No lanza excepción, no rompe nada y
 * produce un informe plausible y equivocado.
 *
 * Por eso la convención **se detecta**, no se tabula: una tabla se queda
 * obsoleta en silencio si Open-Meteo cambia de criterio.
 */

export type FluxSignConvention = "up_positive" | "down_positive" | "unknown";

export interface FluxSample {
  readonly shortwaveWm2: number;
  readonly fluxWm2: number | null;
}

export interface FluxSignDetection {
  readonly convention: FluxSignConvention;
  /** Fracción de las muestras diurnas que apoyan la convención elegida. */
  readonly agreementFrac: number;
  readonly samplesUsed: number;
}

/** Radiación por encima de la cual se considera que la superficie se calienta. */
export const DAYTIME_RADIATION_THRESHOLD_WM2 = 200;

/** Muestras diurnas mínimas para decidir. Por debajo, la convención es desconocida. */
export const MIN_SAMPLES_FOR_DETECTION = 3;

/**
 * Detecta la convención de signo correlacionando el flujo con la radiación de
 * onda corta: cuando la superficie recibe más de 200 W/m², el flujo de calor
 * sensible va **hacia arriba**, y el signo que tome en esas horas define la
 * convención del modelo.
 *
 * @source docs/OPEN_METEO_INTEGRATION.md §4.1 (convenciones medidas).
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
 * Devuelve el flujo con el criterio interno: **positivo hacia arriba**.
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
