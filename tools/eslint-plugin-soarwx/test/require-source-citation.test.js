import { RuleTester } from "@typescript-eslint/rule-tester";
import * as vitest from "vitest";
import rule from "../rules/require-source-citation.js";

RuleTester.afterAll = vitest.afterAll;
RuleTester.it = vitest.it;
RuleTester.itOnly = vitest.it.only;
RuleTester.describe = vitest.describe;

const ruleTester = new RuleTester();

ruleTester.run("require-source-citation", rule, {
  valid: [
    {
      name: "exported function with citation",
      code: `
        /**
         * Saturation vapour pressure.
         * @source Bolton (1980), eq. 10
         */
        export function saturationVapourPressure(t: number): number { return t; }
      `,
    },
    {
      name: "exported arrow const with citation",
      code: `
        /** @source Allen (2006), eq. 11 */
        export const updraft = (z: number): number => z;
      `,
    },
    {
      name: "non-exported function without citation",
      code: `function helper(t: number): number { return t; }`,
    },
    {
      name: "exported constant that is not a function",
      code: `export const GAMMA_D = 0.009761;`,
    },
  ],
  invalid: [
    {
      name: "exported function without docblock",
      code: `export function lclTemperature(t: number): number { return t; }`,
      errors: [
        { messageId: "missing", data: { name: "lclTemperature", tag: "@source" } },
      ],
    },
    {
      name: "docblock without @source",
      code: `
        /** Calculates something important. */
        export function wStar(q: number): number { return q; }
      `,
      errors: [{ messageId: "missing" }],
    },
    {
      name: "line comment does not count as docblock",
      code: `
        // @source Bolton (1980)
        export function esat(t: number): number { return t; }
      `,
      errors: [{ messageId: "missing" }],
    },
    {
      name: "exported arrow without citation",
      code: `export const hcrit = (w: number): number => w;`,
      errors: [{ messageId: "missing", data: { name: "hcrit", tag: "@source" } }],
    },
  ],
});
