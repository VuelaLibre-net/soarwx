/**
 * CAPE as risk, never as virtue.
 *
 * DrJack is explicit: CAPE measures stability affecting convective cloud
 * formation **above** the boundary layer, not within it, and "is not a measure
 * of thermal strength".
 *
 * Here CAPE contributes strictly to storm potential and overdevelopment risk.
 */

export type CapeBand = "none" | "weak" | "moderate" | "strong" | "extreme";

export interface CapeRisk {
  readonly band: CapeBand;
  readonly stormPotential: boolean;
  /** Sufficient convective inhibition exists to cap deep convection. */
  readonly inhibited: boolean;
  readonly capeJkg: number | null;
  readonly convectiveInhibitionJkg: number | null;
}

/**
 * CAPE classification bands and associated thunderstorm potential.
 *
 * @source Glendening (DrJack), RASP BLIPMAP: 0 none · 300-1000 weak ·
 *         1000-2500 moderate · 2500-5300 strong · >5300 extreme.
 */
export const CAPE_BANDS_JKG = {
  weak: 300,
  moderate: 1000,
  strong: 2500,
  extreme: 5300,
} as const;

/**
 * Convective inhibition threshold considered sufficient to cap deep convection.
 * Absolute value is evaluated to accommodate varying model sign conventions.
 */
export const INHIBITING_CIN_JKG = 50;

/**
 * Classifies CAPE as **convective risk**, taking capping inhibition into account.
 *
 * @source Glendening (DrJack), RASP BLIPMAP, CAPE bands.
 */
export function capeRisk(
  capeJkg: number | null,
  convectiveInhibitionJkg: number | null = null,
): CapeRisk {
  const band = classify(capeJkg);
  const inhibited =
    convectiveInhibitionJkg !== null &&
    Math.abs(convectiveInhibitionJkg) >= INHIBITING_CIN_JKG;

  return {
    band,
    stormPotential: band !== "none" && band !== "weak" && !inhibited,
    inhibited,
    capeJkg,
    convectiveInhibitionJkg,
  };
}

function classify(capeJkg: number | null): CapeBand {
  if (capeJkg === null || capeJkg < CAPE_BANDS_JKG.weak) return "none";
  if (capeJkg < CAPE_BANDS_JKG.moderate) return "weak";
  if (capeJkg < CAPE_BANDS_JKG.strong) return "moderate";
  if (capeJkg < CAPE_BANDS_JKG.extreme) return "strong";
  return "extreme";
}
