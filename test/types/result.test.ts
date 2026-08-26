import { describe, expect, it } from "vitest";
import {
  andThen,
  err,
  isErr,
  isOk,
  mapResult,
  ok,
  unwrapOr,
} from "../../src/types/result.js";
import type { Result } from "../../src/types/result.js";

const good: Result<number> = ok(3);
const bad: Result<number> = err("MISSING_VARIABLE", "no data");

describe("Result", () => {
  it("distinguishes success from failure", () => {
    expect(isOk(good)).toBe(true);
    expect(isErr(good)).toBe(false);
    expect(isOk(bad)).toBe(false);
    expect(isErr(bad)).toBe(true);
  });

  it("err preserves the code as a stable identifier", () => {
    expect(isErr(bad) && bad.error.code).toBe("MISSING_VARIABLE");
  });

  it("detail is optional and never fabricated", () => {
    const withoutDetail = err("NO_CONVECTION", "night");
    expect(isErr(withoutDetail) && "detail" in withoutDetail.error).toBe(false);

    const withDetail = err("OUT_OF_VALID_RANGE", "too cold", { tempK: 200 });
    expect(isErr(withDetail) && withDetail.error.detail).toEqual({ tempK: 200 });
  });

  it("map transforms the value and propagates the error", () => {
    expect(
      unwrapOr(
        mapResult(good, (v) => v * 2),
        0,
      ),
    ).toBe(6);
    expect(
      unwrapOr(
        mapResult(bad, (v) => v * 2),
        -1,
      ),
    ).toBe(-1);
  });

  it("andThen chains and short-circuits on first failure", () => {
    expect(
      unwrapOr(
        andThen(good, (v) => ok(v + 1)),
        0,
      ),
    ).toBe(4);
    expect(
      unwrapOr(
        andThen(good, () => bad),
        -1,
      ),
    ).toBe(-1);
    expect(
      unwrapOr(
        andThen(bad, () => ok(99)),
        -1,
      ),
    ).toBe(-1);
  });

  it("unwrapOr returns fallback only on failure", () => {
    expect(unwrapOr(good, 0)).toBe(3);
    expect(unwrapOr(bad, 0)).toBe(0);
  });
});
