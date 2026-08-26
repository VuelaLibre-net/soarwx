import { describe, expect, it } from "vitest";
import { at, consecutivePairs } from "../../src/types/array.js";

describe("acceso indexado", () => {
  it("devuelve el elemento", () => {
    expect(at([1, 2, 3], 1)).toBe(2);
  });

  it("un índice fuera de rango es un error de programación y lanza", () => {
    expect(() => at([1, 2], 5)).toThrow(RangeError);
    expect(() => at([], 0)).toThrow(RangeError);
    expect(() => at([1, 2], -1)).toThrow(RangeError);
  });
});

describe("pares consecutivos", () => {
  it("recorre los pares en orden", () => {
    expect([...consecutivePairs([1, 2, 3, 4])]).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
  });

  it("con menos de dos elementos no produce ninguno", () => {
    expect([...consecutivePairs([1])]).toEqual([]);
    expect([...consecutivePairs([])]).toEqual([]);
  });
});
