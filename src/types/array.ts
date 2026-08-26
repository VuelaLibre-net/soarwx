/**
 * Acceso indexado con narrowing.
 *
 * `noUncheckedIndexedAccess` obliga a comprobar cada acceso por índice, lo que
 * llena los bucles de guardas `if (!x) continue` que nunca se cumplen y que la
 * cobertura de ramas no puede alcanzar. Este ayudante concentra la comprobación
 * en un sitio.
 *
 * Un índice fuera de rango es un **error de programación**, no una condición
 * esperada: por eso lanza en vez de devolver `Result` (ver docs/SPEC.md §3).
 */

export function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) {
    throw new RangeError(
      `índice fuera de rango: ${String(index)} sobre ${String(items.length)} elementos`,
    );
  }
  return value;
}

/** Pares de elementos consecutivos: (0,1), (1,2), … */
export function* consecutivePairs<T>(items: readonly T[]): Generator<readonly [T, T]> {
  for (let i = 1; i < items.length; i++) {
    yield [at(items, i - 1), at(items, i)] as const;
  }
}
