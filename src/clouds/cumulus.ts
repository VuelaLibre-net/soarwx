/**
 * Cumulus: día azul y espesor.
 */

import { m } from "../units/branded.js";
import type { Metres } from "../units/branded.js";

/**
 * Día azul: la condensación queda por encima del techo térmico, así que las
 * térmicas no llegan a marcarse con nubes.
 *
 * @source Definición operativa habitual en vuelo a vela; Glendening (DrJack),
 *         «Cu Cloudbase».
 */
export function isBlueDay(cloudBaseAglM: Metres, thermalTopAglM: Metres): boolean {
  return cloudBaseAglM >= thermalTopAglM;
}

/**
 * Espesor del cumulus: cuánto se desarrolla la nube por encima de su base.
 *
 * @source Indicador clásico de desarrollo convectivo.
 */
export function cumulusDepth(cloudBaseAglM: Metres, thermalTopAglM: Metres): Metres {
  return m(Math.max(0, thermalTopAglM - cloudBaseAglM));
}
