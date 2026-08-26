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
      name: "sufijos de unidad reconocidos",
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
      name: "tipo marcado, no number desnudo",
      code: `
        type Kelvin = number & { __brand: "K" };
        export interface S { temperature: Kelvin; }
      `,
    },
    {
      name: "nombres adimensionales de la lista",
      code: `export interface Factor { score: number; weight: number; }`,
    },
    {
      name: "contadores adimensionales",
      code: `export interface Opts { maxIterations: number; iterations: number; }`,
    },
    {
      name: "sufijos adimensionales genéricos",
      code: `export interface Q { pressureLevelsUsed: number; bowenRatio: number; kIndex: number; }`,
    },
    {
      name: "interfaz no exportada",
      code: `interface Internal { temp: number; }`,
    },
    {
      name: "propiedad no numérica",
      code: `export interface S { name: string; blue: boolean; }`,
    },
    {
      name: "AGL y MSL distinguidos",
      code: `export interface C { ceilingAglM: number; ceilingMslM: number; }`,
    },
  ],
  invalid: [
    {
      name: "altura sin sufijo",
      code: `export interface C { altitude: number; }`,
      // `data` no se afirma: el mensaje interpola la lista completa de sufijos.
      errors: [{ messageId: "missing", column: 22 }],
    },
    {
      name: "temperatura sin sufijo",
      code: `export interface S { temp: number; }`,
      errors: [{ messageId: "missing" }],
    },
    {
      name: "unión con number tampoco escapa",
      code: `export interface S { ceiling: number | null; }`,
      errors: [{ messageId: "missing" }],
    },
    {
      name: "type alias exportado también se inspecciona",
      code: `export type S = { windSpeed: number };`,
      errors: [{ messageId: "missing" }],
    },
    {
      name: "varias propiedades, varios errores",
      code: `export interface S { depth: number; width: number; heightM: number; }`,
      errors: [{ messageId: "missing" }, { messageId: "missing" }],
    },
  ],
});
