/**
 * Soaring windows and best thermal hour computation.
 */

import { m } from "../units/branded.js";
import type { Metres } from "../units/branded.js";
import { at } from "../types/array.js";
import type { SoaringLevel } from "./score.js";

/** Minimum required fields for an hourly forecast evaluation. */
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

/** Minimum consecutive hours required to establish a soaring window. */
export const MIN_WINDOW_HOURS = 2;

/**
 * Identifies contiguous windows of hours that achieve at least `minLevel`.
 *
 * Adjacent eligible hours are merged into a continuous window.
 *
 * @source Requirement R-11.2 from docs/REQUIREMENTS.md.
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
 * Determines the best soaring hour of the day.
 *
 * Ranks primarily by **post-veto rating level**, then by usable ceiling, and finally by climb rate.
 *
 * @source Requirement R-11.3 from docs/REQUIREMENTS.md.
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
