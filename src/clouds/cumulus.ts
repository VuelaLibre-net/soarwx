/**
 * Cumulus cloud metrics: blue thermal day and cloud vertical depth.
 */

import { m } from "../units/branded.js";
import type { Metres } from "../units/branded.js";

/**
 * Blue thermal day: convective condensation level sits above thermal ceiling,
 * so convective thermals do not trigger cloud formation.
 *
 * @source Standard soaring operational definition; Glendening (DrJack), "Cu Cloudbase".
 */
export function isBlueDay(cloudBaseAglM: Metres, thermalTopAglM: Metres): boolean {
  return cloudBaseAglM >= thermalTopAglM;
}

/**
 * Cumulus cloud vertical depth: extent of convective cloud development above cloudbase.
 *
 * @source Standard convective development indicator.
 */
export function cumulusDepth(cloudBaseAglM: Metres, thermalTopAglM: Metres): Metres {
  return m(Math.max(0, thermalTopAglM - cloudBaseAglM));
}
