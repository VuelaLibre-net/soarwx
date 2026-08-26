/**
 * Saturation vapor pressure over liquid water, Goff-Gratch (1946).
 *
 * Independent reference to validate Bolton equation 10 (test T-02).
 * Test helper only.
 */

const TS = 373.16;

/** Returns saturation vapor pressure in Pascals. */
export function goffGratchPa(tempK: number): number {
  const r = TS / tempK;
  const log10es =
    -7.90298 * (r - 1) +
    5.02808 * Math.log10(r) -
    1.3816e-7 * (Math.pow(10, 11.344 * (1 - tempK / TS)) - 1) +
    8.1328e-3 * (Math.pow(10, -3.49149 * (r - 1)) - 1) +
    Math.log10(1013.246);
  return Math.pow(10, log10es) * 100;
}
