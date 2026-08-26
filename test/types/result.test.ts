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
  it("distingue éxito de fallo", () => {
    expect(isOk(good)).toBe(true);
    expect(isErr(good)).toBe(false);
    expect(isOk(bad)).toBe(false);
    expect(isErr(bad)).toBe(true);
  });

  it("err conserva el código como identificador estable", () => {
    expect(isErr(bad) && bad.error.code).toBe("MISSING_VARIABLE");
  });

  it("el detalle es opcional y no se inventa", () => {
    const withoutDetail = err("NO_CONVECTION", "night");
    expect(isErr(withoutDetail) && "detail" in withoutDetail.error).toBe(false);

    const withDetail = err("OUT_OF_VALID_RANGE", "too cold", { tempK: 200 });
    expect(isErr(withDetail) && withDetail.error.detail).toEqual({ tempK: 200 });
  });

  it("map transforma el valor y deja pasar el error", () => {
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

  it("andThen encadena y corta en el primer fallo", () => {
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

  it("unwrapOr devuelve el respaldo solo en fallo", () => {
    expect(unwrapOr(good, 0)).toBe(3);
    expect(unwrapOr(bad, 0)).toBe(0);
  });
});
