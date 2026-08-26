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
      name: "función exportada con cita",
      code: `
        /**
         * Presión de vapor de saturación.
         * @source Bolton (1980), ec. 10
         */
        export function saturationVapourPressure(t: number): number { return t; }
      `,
    },
    {
      name: "const arrow exportada con cita",
      code: `
        /** @source Allen (2006), ec. 11 */
        export const updraft = (z: number): number => z;
      `,
    },
    {
      name: "función NO exportada, sin cita",
      code: `function helper(t: number): number { return t; }`,
    },
    {
      name: "constante exportada que no es función",
      code: `export const GAMMA_D = 0.009761;`,
    },
  ],
  invalid: [
    {
      name: "función exportada sin docblock",
      code: `export function lclTemperature(t: number): number { return t; }`,
      errors: [
        { messageId: "missing", data: { name: "lclTemperature", tag: "@source" } },
      ],
    },
    {
      name: "docblock sin @source",
      code: `
        /** Calcula algo importante. */
        export function wStar(q: number): number { return q; }
      `,
      errors: [{ messageId: "missing" }],
    },
    {
      name: "comentario de línea no cuenta como docblock",
      code: `
        // @source Bolton (1980)
        export function esat(t: number): number { return t; }
      `,
      errors: [{ messageId: "missing" }],
    },
    {
      name: "arrow exportada sin cita",
      code: `export const hcrit = (w: number): number => w;`,
      errors: [{ messageId: "missing", data: { name: "hcrit", tag: "@source" } }],
    },
  ],
});
