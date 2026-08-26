/**
 * Velocidad convectiva de Deardorff, `w*`.
 */

import { mps } from "../units/branded.js";
import type { Kelvin, MPerS, Metres } from "../units/branded.js";
import { G } from "../units/constants.js";
import { err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import type { AircraftProfile } from "../aircraft/profiles.js";

export interface WStarInput {
  /** Flujo virtual cinemático, K·m/s. Sale de `surfaceHeatFlux`. */
  readonly virtualHeatFluxKMs: number;
  readonly mixingHeightAglM: Metres;
  /**
   * Temperatura potencial de superficie. **No** la temperatura absoluta: a
   * 900 hPa la diferencia es de unos 9 K.
   */
  readonly surfacePotentialTempK: Kelvin;
  readonly surfaceWindMs: MPerS;
  readonly profile: AircraftProfile;
}

export interface WStarResult {
  readonly wStarMs: MPerS;
  /** Verdadero si el corte por viento fuerte anuló el resultado. */
  readonly suppressedByWind: boolean;
}

/**
 * Velocidad convectiva de Deardorff.
 *
 *     w* = ( Qov · zi · g / θ̄₀ )^(1/3)
 *
 * Se anula cuando el viento en superficie supera el límite del perfil de
 * aeronave: por encima, las térmicas dejan de ser explotables.
 *
 * Allen define θ̄₀ como la temperatura potencial superficial **media diurna**.
 * Aquí se usa la instantánea de cada hora, que es lo coherente con una
 * previsión horaria; la diferencia entra en `w*` con potencia 1/3 y es del
 * orden del uno por ciento.
 *
 * @source Allen, M. J. (2006), AIAA 2006-1510, ec. 9-10 y §II (corte de viento);
 *         Deardorff, J. W. (1970), escala de velocidad convectiva.
 */
export function convectiveVelocityScale(input: WStarInput): Result<WStarResult> {
  if (input.surfaceWindMs > input.profile.maxSurfaceWindMs) {
    return ok({ wStarMs: mps(0), suppressedByWind: true });
  }
  if (input.virtualHeatFluxKMs <= 0) {
    return err("NO_CONVECTION", "no upward virtual heat flux", {
      virtualHeatFluxKMs: input.virtualHeatFluxKMs,
    });
  }
  if (input.mixingHeightAglM <= 0) {
    return err("NO_CONVECTION", "mixing height is not positive", {
      mixingHeightAglM: input.mixingHeightAglM,
    });
  }

  const cubed =
    (input.virtualHeatFluxKMs * input.mixingHeightAglM * G) / input.surfacePotentialTempK;

  return ok({ wStarMs: mps(Math.cbrt(cubed)), suppressedByWind: false });
}
