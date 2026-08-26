import { describe, expect, it } from "vitest";
import { at, consecutivePairs } from "../../src/types/array.js";

describe("indexed access", () => {
  it("returns the element", () => {
    expect(at([1, 2, 3], 1)).toBe(2);
  });

  it("out-of-range index is a programmer error and throws", () => {
    expect(() => at([1, 2], 5)).toThrow(RangeError);
    expect(() => at([], 0)).toThrow(RangeError);
    expect(() => at([1, 2], -1)).toThrow(RangeError);
  });
});

describe("consecutive pairs", () => {
  it("iterates pairs in order", () => {
    expect([...consecutivePairs([1, 2, 3, 4])]).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
  });

  it("produces nothing with fewer than two elements", () => {
    expect([...consecutivePairs([1])]).toEqual([]);
    expect([...consecutivePairs([])]).toEqual([]);
  });
});
