/**
 * Parámetro de Scorer.
 *
 *     l² = N²/U² − (1/U)·d²U/dz²
 *
 * Es el criterio físico de la onda de montaña: la onda queda atrapada cuando l²
 * decrece con fuerza suficiente con la altura. El predecesor usaba en su lugar
 * un heurístico de sector angular y umbral de viento, con el comentario y el
 * código discrepando en el sector (290-340° escrito, 280-350° programado).
 *
 * Con seis a nueve niveles y huecos de cientos de metros, la segunda derivada
 * del viento es ruidosa. Se calcula igualmente, se declara el término de
 * curvatura por separado y se marca la calidad del cálculo.
 */

import { m } from "../units/branded.js";
import type { MPerS, Metres } from "../units/branded.js";
import { G } from "../units/constants.js";
import { err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import { potentialTemperature } from "../thermo/potential.js";
import { toComponents } from "../sounding/wind.js";
import { at } from "../types/array.js";
import type { Level, Sounding } from "../sounding/types.js";

const DEG_TO_RAD = Math.PI / 180;

/** Viento mínimo a lo largo del flujo por debajo del cual el parámetro no significa nada. */
export const MIN_ALONG_FLOW_MS = 2;

export interface ScorerPoint {
  readonly mslM: Metres;
  /** Componente del viento a lo largo de la dirección de flujo. */
  readonly alongFlowMs: MPerS;
  /** Frecuencia de Brunt-Väisälä al cuadrado. */
  readonly bruntVaisalaPerS2: number;
  /** Término de estabilidad, N²/U². */
  readonly buoyancyTermPerM2: number;
  /** Término de curvatura, −U″/U. Ruidoso con pocos niveles. */
  readonly curvatureTermPerM2: number;
  readonly scorerSquaredPerM2: number;
}

/** Proyección del viento de un nivel sobre la dirección de flujo. */
function alongFlow(level: Level, flowTowardDeg: number): number {
  const wind = toComponents(level.windSpeedMs, level.windFromDeg);
  const rad = flowTowardDeg * DEG_TO_RAD;
  return wind.uMs * Math.sin(rad) + wind.vMs * Math.cos(rad);
}

/**
 * Perfil del parámetro de Scorer a lo largo de una dirección de flujo.
 *
 * `flowTowardDeg` es la dirección **hacia la que** sopla el flujo que cruza la
 * cresta, es decir, perpendicular a ella.
 *
 * @source Scorer, R. S. (1949), Quarterly Journal of the RMS 75, 41-56.
 */
export function scorerParameter(
  sounding: Sounding,
  flowTowardDeg: number,
): Result<readonly ScorerPoint[]> {
  const levels = sounding.levels;
  if (levels.length < 3) {
    return err("INSUFFICIENT_LEVELS", "the Scorer parameter needs at least 3 levels", {
      levels: levels.length,
    });
  }

  const points: ScorerPoint[] = [];

  for (let i = 1; i < levels.length - 1; i++) {
    const below = at(levels, i - 1);
    const here = at(levels, i);
    const above = at(levels, i + 1);

    const zBelow = below.geopotentialMslM;
    const zHere = here.geopotentialMslM;
    const zAbove = above.geopotentialMslM;
    if (zAbove <= zHere || zHere <= zBelow) continue;

    const u = alongFlow(here, flowTowardDeg);
    if (Math.abs(u) < MIN_ALONG_FLOW_MS) continue;

    const thetaBelow = potentialTemperature(below.tempK, below.pressurePa);
    const thetaAbove = potentialTemperature(above.tempK, above.pressurePa);
    const thetaHere = potentialTemperature(here.tempK, here.pressurePa);
    const nSquared = ((G / thetaHere) * (thetaAbove - thetaBelow)) / (zAbove - zBelow);

    // Segunda derivada por diferencias finitas sobre malla no uniforme.
    const uBelow = alongFlow(below, flowTowardDeg);
    const uAbove = alongFlow(above, flowTowardDeg);
    const hLower = zHere - zBelow;
    const hUpper = zAbove - zHere;
    const secondDerivative =
      (2 * (uBelow * hUpper - u * (hLower + hUpper) + uAbove * hLower)) /
      (hLower * hUpper * (hLower + hUpper));

    const buoyancyTerm = nSquared / (u * u);
    const curvatureTerm = -secondDerivative / u;

    points.push({
      mslM: m(zHere),
      alongFlowMs: here.windSpeedMs,
      bruntVaisalaPerS2: nSquared,
      buoyancyTermPerM2: buoyancyTerm,
      curvatureTermPerM2: curvatureTerm,
      scorerSquaredPerM2: buoyancyTerm + curvatureTerm,
    });
  }

  if (points.length === 0) {
    return err("OUT_OF_VALID_RANGE", "no level has enough along-flow wind", {
      minAlongFlowMs: MIN_ALONG_FLOW_MS,
    });
  }

  return ok(points);
}
