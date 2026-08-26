/**
 * Constantes físicas. Todas en SI.
 *
 * Los valores están fijados para coincidir con las fuentes que se citan en los
 * módulos que los usan: cambiar uno cambia el número que ve el piloto, así que
 * es un cambio mayor de versión (ver CHANGELOG.md).
 */

import { K, Pa } from "./branded.js";
import type { Kelvin, Pascal } from "./branded.js";

/** Aceleración de la gravedad estándar, m/s². ISO 80000-3. */
export const G = 9.80665;

/** Constante específica del aire seco, J/(kg·K). */
export const RD = 287.05;

/** Constante específica del vapor de agua, J/(kg·K). */
export const RV = 461.5;

/**
 * Calor específico del aire seco a presión constante, J/(kg·K).
 * Valor de Allen (2006), para que `w*` sea reproducible contra su artículo.
 */
export const CP = 1004.67;

/** Calor latente de vaporización a 0 °C, J/kg. */
export const LV0 = 2.501e6;

/** Pendiente de la dependencia térmica del calor latente, J/(kg·K). */
export const LV_SLOPE = 2370;

/** Calor específico del vapor de agua a presión constante, J/(kg·K). */
export const CPV = 1879;

/** Cociente de constantes de gas, Rd/Rv. Adimensional. */
export const EPS = RD / RV;

/** Exponente de Poisson, Rd/cp. Adimensional. */
export const KAPPA = RD / CP;

/** Gradiente adiabático seco, K/m. Γd = g/cp ≈ 9.761 K/km. */
export const GAMMA_D = G / CP;

/** Presión de referencia para la temperatura potencial, Pa. */
export const P0: Pascal = Pa(100000);

/** Cero de la escala Celsius, en kelvin. */
export const T0_CELSIUS: Kelvin = K(273.15);
