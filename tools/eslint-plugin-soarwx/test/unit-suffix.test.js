import { RuleTester } from "@typescript-eslint/rule-tester";
import * as vitest from "vitest";
import rule from "../rules/unit-suffix.js";

RuleTester.afterAll = vitest.afterAll;
RuleTester.it = vitest.it;
RuleTester.itOnly = vitest.it.only;
RuleTester.describe = vitest.describe;

const ruleTester = new RuleTester();

ruleTester.run("unit-suffix", rule, {
  valid: [
    {
      name: "recognised unit suffixes",
      code: `
        export interface Level {
          tempK: number;
          pressurePa: number;
          geopotentialMslM: number;
          windSpeedMs: number;
          airDensityKgM3: number;
          windFromDeg: number;
        }
      `,
    },
    {
      name: "branded type, not bare number",
      code: `
        type Kelvin = number & { __brand: "K" };
        export interface S { temperature: Kelvin; }
      `,
    },
    {
      name: "allowlisted dimensionless names",
      code: `export interface Factor { score: number; weight: number; }`,
    },
    {
      name: "dimensionless counters",
      code: `export interface Opts { maxIterations: number; iterations: number; }`,
    },
    {
      name: "generic dimensionless suffixes",
      code: `export interface Q { pressureLevelsUsed: number; bowenRatio: number; kIndex: number; }`,
    },
    {
      name: "non-exported interface",
      code: `interface Internal { temp: number; }`,
    },
    {
      name: "non-numeric property",
      code: `export interface S { name: string; blue: boolean; }`,
    },
    {
      name: "AGL and MSL distinguished",
      code: `export interface C { ceilingAglM: number; ceilingMslM: number; }`,
    },
  ],
  invalid: [
    {
      name: "height without suffix",
      code: `export interface C { altitude: number; }`,
      // `data` is not asserted: message interpolates full suffix list.
      errors: [{ messageId: "missing", column: 22 }],
    },
    {
      name: "temperature without suffix",
      code: `export interface S { temp: number; }`,
      errors: [{ messageId: "missing" }],
    },
    {
      name: "union with number does not escape",
      code: `export interface S { ceiling: number | null; }`,
      errors: [{ messageId: "missing" }],
    },
    {
      name: "exported type alias is also checked",
      code: `export type S = { windSpeed: number };`,
      errors: [{ messageId: "missing" }],
    },
    {
      name: "multiple properties, multiple errors",
      code: `export interface S { depth: number; width: number; heightM: number; }`,
      errors: [{ messageId: "missing" }, { messageId: "missing" }],
    },
  ],
});
