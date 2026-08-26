/**
 * Physical constants. All in SI units.
 *
 * Values are pinned to match cited sources in the modules that use them:
 * changing a constant changes pilot-facing output, which constitutes a
 * major version change (see CHANGELOG.md).
 */

import { K, Pa } from "./branded.js";
import type { Kelvin, Pascal } from "./branded.js";

/** Standard gravitational acceleration, m/s². ISO 80000-3. */
export const G = 9.80665;

/** Specific gas constant for dry air, J/(kg·K). */
export const RD = 287.05;

/** Specific gas constant for water vapour, J/(kg·K). */
export const RV = 461.5;

/**
 * Specific heat of dry air at constant pressure, J/(kg·K).
 * Value from Allen (2006), making `w*` reproducible against his paper.
 */
export const CP = 1004.67;

/** Latent heat of vaporisation at 0 °C, J/kg. */
export const LV0 = 2.501e6;

/** Temperature dependence slope of latent heat of vaporisation, J/(kg·K). */
export const LV_SLOPE = 2370;

/** Specific heat of water vapour at constant pressure, J/(kg·K). */
export const CPV = 1879;

/** Ratio of gas constants, Rd/Rv. Dimensionless. */
export const EPS = RD / RV;

/** Poisson constant, Rd/cp. Dimensionless. */
export const KAPPA = RD / CP;

/** Dry adiabatic lapse rate, K/m. Γd = g/cp ≈ 9.761 K/km. */
export const GAMMA_D = G / CP;

/** Reference pressure for potential temperature, Pa. */
export const P0: Pascal = Pa(100000);

/** Zero Celsius in kelvin. */
export const T0_CELSIUS: Kelvin = K(273.15);
