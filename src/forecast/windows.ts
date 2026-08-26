/**
 * Ventanas volables y mejor hora del día.
 */

import { m } from "../units/branded.js";
import type { Metres } from "../units/branded.js";
import { at } from "../types/array.js";
import type { SoaringLevel } from "./score.js";

/** Lo mínimo que necesita esta capa de cada hora. */
export interface ScoredHour {
  readonly timeUtc: string;
  readonly level: SoaringLevel;
  readonly usableCeilingAglM: Metres;
  readonly climbMs: number;
}

export interface SoaringWindow {
  readonly startUtc: string;
  readonly endUtc: string;
  readonly durationHours: number;
  readonly minLevel: SoaringLevel;
  readonly peakCeilingAglM: Metres;
}

/** Una hora suelta no hace ventana. */
export const MIN_WINDOW_HOURS = 2;

/**
 * Ventanas continuas de horas que alcanzan al menos `minLevel`.
 *
 * Las contiguas se funden; una hora aislada no forma ventana.
 *
 * @source R-11.2 de docs/REQUIREMENTS.md.
 */
export function findWindows(
  hours: readonly ScoredHour[],
  minLevel: SoaringLevel,
  minWindowHours: number = MIN_WINDOW_HOURS,
): readonly SoaringWindow[] {
  const windows: SoaringWindow[] = [];
  let run: ScoredHour[] = [];

  const flush = (): void => {
    if (run.length >= minWindowHours) {
      windows.push({
        startUtc: at(run, 0).timeUtc,
        endUtc: at(run, run.length - 1).timeUtc,
        durationHours: run.length,
        minLevel: run.reduce<SoaringLevel>(
          (worst, h) => (h.level < worst ? h.level : worst),
          5,
        ),
        peakCeilingAglM: m(Math.max(...run.map((h) => h.usableCeilingAglM))),
      });
    }
    run = [];
  };

  for (const hour of hours) {
    if (hour.level >= minLevel) run.push(hour);
    else flush();
  }
  flush();

  return windows;
}

/**
 * Mejor hora del día.
 *
 * Ordena por **nivel tras vetos**, luego por techo utilizable y luego por
 * ascendencia. **Nunca por número de factores en verde**: el predecesor
 * ordenaba por `(n_ok, w_vario)`, de modo que un día azul con 900 m de techo
 * podía ganar a uno con 2500 m y un factor menos cumplido.
 *
 * @source R-11.3 de docs/REQUIREMENTS.md.
 */
export function bestHour<T extends ScoredHour>(hours: readonly T[]): T | null {
  let best: T | null = null;
  for (const hour of hours) {
    if (hour.level <= 1) continue;
    if (best === null || better(hour, best)) best = hour;
  }
  return best;
}

function better(candidate: ScoredHour, current: ScoredHour): boolean {
  if (candidate.level !== current.level) return candidate.level > current.level;
  if (candidate.usableCeilingAglM !== current.usableCeilingAglM) {
    return candidate.usableCeilingAglM > current.usableCeilingAglM;
  }
  return candidate.climbMs > current.climbMs;
}
