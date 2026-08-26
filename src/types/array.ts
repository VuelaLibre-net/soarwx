/**
 * Indexed access with narrowing.
 *
 * `noUncheckedIndexedAccess` forces checks on every index access, cluttering
 * loops with `if (!x) continue` guards that never trigger and are unreachable
 * by branch coverage. This helper centralizes the check in one place.
 *
 * An out-of-range index is a **programmer error**, not an expected condition:
 * therefore it throws instead of returning `Result` (see docs/SPEC.md §3).
 */

export function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) {
    throw new RangeError(
      `index out of range: ${String(index)} on ${String(items.length)} elements`,
    );
  }
  return value;
}

/** Consecutive element pairs: (0,1), (1,2), … */
export function* consecutivePairs<T>(items: readonly T[]): Generator<readonly [T, T]> {
  for (let i = 1; i < items.length; i++) {
    yield [at(items, i - 1), at(items, i)] as const;
  }
}
