/**
 * Techo utilizable y su factor limitante.
 *
 * El número que el piloto mira, y el motivo por el que es ese y no otro. Sin el
 * factor limitante, un techo bajo no dice si el problema es que la nube está
 * baja, que la térmica es débil o que el cielo está cerrado.
 */

import { m } from "../units/branded.js";
import type { Metres } from "../units/branded.js";
import { at } from "../types/array.js";

export type CeilingLimit =
  "cloudbase" | "hcrit" | "boundary_layer" | "overcast" | "no_convection";

export interface CeilingInput {
  /** Altura crítica del perfil de ascendencia. `null` si no hay convección. */
  readonly hcritAglM: Metres | null;
  readonly thermalTopAglM: Metres;
  /** Base de cumulus. `null` en día azul o sin humedad suficiente. */
  readonly cloudBaseAglM: Metres | null;
  /** Cielo cerrado por debajo o dentro de la capa: corta la convección. */
  readonly overcast: boolean;
  readonly elevationMslM: Metres;
}

export interface CeilingResult {
  readonly aglM: Metres;
  readonly mslM: Metres;
  readonly limitedBy: CeilingLimit;
}

/**
 * Techo utilizable: el menor de la altura crítica, el techo térmico y la base
 * de nubes, con el motivo declarado.
 *
 * @source Composición de los criterios de Glendening (DrJack): `hcrit` como
 *         techo práctico y la base de nubes como tope superior.
 */
export function usableCeiling(input: CeilingInput): CeilingResult {
  const withElevation = (aglM: number, limitedBy: CeilingLimit): CeilingResult => ({
    aglM: m(Math.max(0, aglM)),
    mslM: m(input.elevationMslM + Math.max(0, aglM)),
    limitedBy,
  });

  if (input.overcast) return withElevation(0, "overcast");
  if (input.hcritAglM === null || input.thermalTopAglM <= 0) {
    return withElevation(0, "no_convection");
  }

  const candidates: [number, CeilingLimit][] = [
    [input.hcritAglM, "hcrit"],
    [input.thermalTopAglM, "boundary_layer"],
  ];
  if (input.cloudBaseAglM !== null) {
    candidates.push([input.cloudBaseAglM, "cloudbase"]);
  }

  let best = at(candidates, 0);
  for (const candidate of candidates) {
    if (candidate[0] < best[0]) best = candidate;
  }

  return withElevation(best[0], best[1]);
}
