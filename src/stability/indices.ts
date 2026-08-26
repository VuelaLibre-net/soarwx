/**
 * Índices de estabilidad clásicos.
 *
 * Todos devuelven `Result`. **Una variable ausente nunca vale cero**: el
 * predecesor hacía `_opt_float(...) or 0.0` y un LI ausente disparaba el mismo
 * veto de «atmósfera estable» que un LI real de 0.0.
 *
 * En emplazamientos elevados los niveles de 850 hPa pueden caer bajo tierra, y
 * entonces el K-Index sencillamente no se puede calcular. Eso es un
 * `MISSING_VARIABLE`, no un número.
 */

import { hPaToPa, kToCelsius } from "../units/convert.js";
import type { Kelvin } from "../units/branded.js";
import { andThen, err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import { interpolateAtPressure } from "../sounding/interpolate.js";
import type { Level, Sounding } from "../sounding/types.js";
import { lcl } from "../thermo/lcl.js";
import { dryAdiabaticLift, moistAdiabaticLift } from "../thermo/parcel.js";

/** Nivel exigido por el índice, o `MISSING_VARIABLE` si queda fuera del sondeo. */
function requireLevel(sounding: Sounding, hpa: number): Result<Level> {
  const level = interpolateAtPressure(sounding, hPaToPa(hpa));
  if (level.ok) return level;
  return err(
    "MISSING_VARIABLE",
    `pressure level ${String(hpa)} hPa is not available in this sounding`,
    { hpa, reason: level.error.code },
  );
}

/**
 * K-Index de George.
 *
 *     KI = (T850 − T500) + Td850 − (T700 − Td700)      [°C]
 *
 * Es un índice tormentoso. **No** se usa como medida de sequedad: para eso
 * están el déficit de punto de rocío y la razón de mezcla de la capa mezclada.
 *
 * @source George, J. J. (1960), Weather Forecasting for Aeronautics.
 */
export function kIndex(sounding: Sounding): Result<number> {
  return andThen(requireLevel(sounding, 850), (l850) =>
    andThen(requireLevel(sounding, 700), (l700) =>
      andThen(requireLevel(sounding, 500), (l500) =>
        ok(
          kToCelsius(l850.tempK) -
            kToCelsius(l500.tempK) +
            kToCelsius(l850.dewpointK) -
            (kToCelsius(l700.tempK) - kToCelsius(l700.dewpointK)),
        ),
      ),
    ),
  );
}

/**
 * Total Totals.
 *
 *     TT = VT + CT = (T850 − T500) + (Td850 − T500)     [°C]
 *
 * @source Miller, R. C. (1972), Notes on Analysis and Severe-Storm Forecasting.
 */
export function totalTotals(sounding: Sounding): Result<number> {
  return andThen(requireLevel(sounding, 850), (l850) =>
    andThen(requireLevel(sounding, 500), (l500) =>
      ok(
        kToCelsius(l850.tempK) -
          kToCelsius(l500.tempK) +
          (kToCelsius(l850.dewpointK) - kToCelsius(l500.tempK)),
      ),
    ),
  );
}

/**
 * Lifted Index de parcela de superficie.
 *
 *     LI = T500_entorno − T500_parcela                  [K]
 *
 * Es un **respaldo**: cuando el modelo sirve su propio `lifted_index` se
 * prefiere el suyo, y el consumidor debe marcar cuál usó.
 *
 * @source Galway, J. G. (1956), Bulletin of the AMS 37 (Lifted Index).
 */
export function liftedIndex(
  sounding: Sounding,
  surfaceTempK: Kelvin = sounding.surface.tempK,
): Result<number> {
  return andThen(requireLevel(sounding, 500), (l500) => {
    const surfacePressurePa = sounding.surface.pressurePa;
    const condensation = lcl(surfaceTempK, sounding.surface.dewpointK, surfacePressurePa);

    // Por encima del LCL el ascenso es saturado; si el LCL queda por encima de
    // 500 hPa, todo el ascenso es adiabático seco.
    if (condensation.pressurePa <= l500.pressurePa) {
      return ok(
        l500.tempK - dryAdiabaticLift(surfaceTempK, surfacePressurePa, l500.pressurePa),
      );
    }

    return andThen(
      moistAdiabaticLift(condensation.tempK, condensation.pressurePa, l500.pressurePa),
      (parcelK) => ok(l500.tempK - parcelK),
    );
  });
}

/** Bandas ordinales del Lifted Index, para el diagnóstico de convección profunda. */
export type LiftedIndexBand =
  | "stable"
  | "marginally_unstable"
  | "moderately_unstable"
  | "very_unstable"
  | "extremely_unstable";

/**
 * Diagnóstico ordinal del Lifted Index.
 *
 * @source Galway, J. G. (1956), Bulletin of the AMS 37; bandas de uso habitual
 *         en meteorología aeronáutica.
 */
export function liftedIndexBand(li: number): LiftedIndexBand {
  if (li > 2) return "stable";
  if (li >= 0) return "marginally_unstable";
  if (li >= -3) return "moderately_unstable";
  if (li >= -6) return "very_unstable";
  return "extremely_unstable";
}
