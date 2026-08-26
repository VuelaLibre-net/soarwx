/**
 * Altura crítica: hasta dónde se puede subir de verdad.
 *
 * `hcrit` es la altura a la que la ascendencia cae por debajo del umbral con el
 * que se declara la térmica todavía explotable. DrJack la describe como el
 * techo práctico de ascenso sobre terreno llano y sin nubes, y fija ese umbral
 * en 225 fpm.
 *
 * El umbral **no** es el hundimiento del avión que se vuele: es una convención
 * de RASP, la misma para todo el catálogo de perfiles. Lo que sí depende del
 * avión es la lectura de variómetro, `expectedVarioAt`, que resta
 * `circlingSinkMs`. Separarlos es lo que permite elegir velero sin que se mueva
 * el techo. Ver `aircraft/profiles.ts`.
 *
 * Se mide contra el **núcleo** de la térmica, no contra la media sobre su
 * sección: con `w* = 2.56 m/s` y `zi = 1401 m` la media a media capa es
 * 0.91 m/s, por debajo de los 1.143 m/s del umbral, y el día saldría involable
 * cuando es un día medio normal.
 */

import { m, mps } from "../units/branded.js";
import type { MPerS, Metres } from "../units/branded.js";
import { err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import type { AircraftProfile } from "../aircraft/profiles.js";
import { ZERO_CROSSING_RATIO, updraftPeakAt } from "./updraft.js";

/** Muestreo grueso para localizar el máximo antes de refinar. */
const COARSE_SAMPLES = 200;
const BISECTION_STEPS = 60;

export interface CriticalHeightResult {
  readonly hcritAglM: Metres;
  /** Altura del máximo de ascendencia en el núcleo. */
  readonly peakHeightAglM: Metres;
  /** Ascendencia máxima en el núcleo. */
  readonly peakClimbMs: MPerS;
}

/**
 * Altura donde la ascendencia del núcleo cae por debajo del umbral de `hcrit`
 * del perfil.
 *
 * Devuelve `NO_CONVECTION` cuando la térmica nunca llega a alcanzar el umbral:
 * eso es un día involable, no un `hcrit` de cero.
 *
 * @source Glendening (DrJack), RASP BLIPMAP, definición de hcrit (225 fpm);
 *         Allen, M. J. (2006), AIAA 2006-1510, ec. 11-15 (perfil).
 */
export function criticalHeight(
  wStarMs: MPerS,
  ziAglM: Metres,
  profile: AircraftProfile,
): Result<CriticalHeightResult> {
  if (wStarMs <= 0 || ziAglM <= 0) {
    return err("NO_CONVECTION", "no convective velocity scale", { wStarMs, ziAglM });
  }

  const top = ziAglM * ZERO_CROSSING_RATIO;

  // 1. Localizar el máximo del perfil de núcleo.
  let peakHeight = 0;
  let peakClimb = -Infinity;
  for (let i = 1; i <= COARSE_SAMPLES; i++) {
    const z = (top * i) / COARSE_SAMPLES;
    const w = updraftPeakAt(wStarMs, m(z), ziAglM);
    if (w > peakClimb) {
      peakClimb = w;
      peakHeight = z;
    }
  }

  if (peakClimb < profile.hcritThresholdMs) {
    return err("NO_CONVECTION", "peak core climb never reaches the hcrit threshold", {
      peakClimbMs: peakClimb,
      hcritThresholdMs: profile.hcritThresholdMs,
      wStarMs,
      ziAglM,
    });
  }

  // 2. Bisecar en la rama descendente, donde el perfil es monótono.
  let low = peakHeight;
  let high = top;
  for (let i = 0; i < BISECTION_STEPS; i++) {
    const mid = (low + high) / 2;
    if (updraftPeakAt(wStarMs, m(mid), ziAglM) >= profile.hcritThresholdMs) low = mid;
    else high = mid;
  }

  return ok({
    hcritAglM: m(low),
    peakHeightAglM: m(peakHeight),
    peakClimbMs: mps(peakClimb),
  });
}

/** Altura relativa desde la que se considera que empieza la banda de trabajo. */
export const WORKING_BAND_BOTTOM_FRAC = 0.1;

/**
 * Ascendencia media que ve el variómetro a lo largo de una subida completa,
 * desde el 10 % de la capa hasta la altura crítica.
 *
 * Es el número que corresponde a lo que el piloto experimenta subiendo, y no
 * depende de elegir una altura arbitraria: el perfil del núcleo tiene su máximo
 * cerca del 20 % de la capa, así que evaluarlo a media capa infravalora la
 * térmica y evaluarlo en el máximo la exagera.
 *
 * Mezcla las dos magnitudes del perfil a propósito: la banda la delimita el
 * umbral de `hcrit`, y el valor dentro de ella lo fija el hundimiento del avión.
 *
 * @source Allen (2006), AIAA 2006-1510, ec. 11-15 (perfil); promediado sobre la
 *         banda de trabajo definida por `hcrit`.
 */
export function meanClimbOverBand(
  wStarMs: MPerS,
  ziAglM: Metres,
  profile: AircraftProfile,
  samples = 200,
): Result<MPerS> {
  const critical = criticalHeight(wStarMs, ziAglM, profile);
  if (!critical.ok) return critical;

  const bottom = WORKING_BAND_BOTTOM_FRAC * ziAglM;
  const top = critical.value.hcritAglM;
  if (top <= bottom) {
    return ok(expectedVarioAt(wStarMs, m(top), ziAglM, profile));
  }

  let total = 0;
  for (let i = 0; i < samples; i++) {
    const z = bottom + ((top - bottom) * (i + 0.5)) / samples;
    total += expectedVarioAt(wStarMs, m(z), ziAglM, profile);
  }
  return ok(mps(total / samples));
}

/**
 * Lectura esperada de variómetro a una altura: ascendencia del núcleo menos el
 * régimen de caída del avión virando. Puede ser negativa, y eso es información.
 *
 * Salvo con `RASP_REFERENCE`, no cruza cero en `hcrit` sino más arriba: en
 * `hcrit` vale `hcritThresholdMs - circlingSinkMs`, que para un velero real es
 * positivo. Es la consecuencia buscada de separar el criterio del avión.
 *
 * @source Glendening (DrJack): «restar el régimen de caída del planeador para
 *         obtener la lectura media de variómetro».
 */
export function expectedVarioAt(
  wStarMs: MPerS,
  zAglM: Metres,
  ziAglM: Metres,
  profile: AircraftProfile,
): MPerS {
  return mps(updraftPeakAt(wStarMs, zAglM, ziAglM) - profile.circlingSinkMs);
}
