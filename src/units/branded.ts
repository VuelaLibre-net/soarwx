/**
 * Branded types for physical quantities.
 *
 * The compiler prevents adding kelvin to pascals or passing metres where
 * metres per second are expected. The brand is erased at runtime:
 * constructors are identity functions.
 *
 * See docs/SPEC.md §2.1.
 */

declare const brand: unique symbol;

/** Number carrying a compile-time unit brand. */
export type Branded<T, B extends string> = T & { readonly [brand]: B };

export type Kelvin = Branded<number, "K">;
export type Pascal = Branded<number, "Pa">;
export type Metres = Branded<number, "m">;
export type MPerS = Branded<number, "m/s">;
export type Degrees = Branded<number, "deg">;
export type KgPerKg = Branded<number, "kg/kg">;
export type WPerM2 = Branded<number, "W/m2">;
export type JPerKg = Branded<number, "J/kg">;

export const K = (v: number): Kelvin => v as Kelvin;
export const Pa = (v: number): Pascal => v as Pascal;
export const m = (v: number): Metres => v as Metres;
export const mps = (v: number): MPerS => v as MPerS;
export const deg = (v: number): Degrees => v as Degrees;
export const kgkg = (v: number): KgPerKg => v as KgPerKg;
export const wm2 = (v: number): WPerM2 => v as WPerM2;
export const jkg = (v: number): JPerKg => v as JPerKg;
