/**
 * CAPE como riesgo, nunca como virtud.
 *
 * DrJack es explícito: la CAPE mide la estabilidad que afecta a la formación de
 * nubes convectivas **por encima** de la capa límite, no dentro, y «no es una
 * medida de la fuerza de las térmicas».
 *
 * El predecesor la puntuaba como factor positivo con banda ideal de 1000 a
 * 2500 J/kg y a la vez la vetaba por encima de 2500: el mismo valor de
 * 2400 J/kg sacaba nota máxima en un factor y estaba a 100 J/kg de un veto.
 * Aquí **no existe ninguna función que convierta la CAPE en puntuación**.
 */

export type CapeBand = "none" | "weak" | "moderate" | "strong" | "extreme";

export interface CapeRisk {
  readonly band: CapeBand;
  readonly stormPotential: boolean;
  /** Hay inhibición suficiente para tapar la convección profunda. */
  readonly inhibited: boolean;
  readonly capeJkg: number | null;
  readonly convectiveInhibitionJkg: number | null;
}

/**
 * Bandas de CAPE y probabilidad de tormenta asociada.
 *
 * @source Glendening (DrJack), RASP BLIPMAP: 0 nula · 300-1000 débil ·
 *         1000-2500 moderada · 2500-5300 fuerte.
 */
export const CAPE_BANDS_JKG = {
  weak: 300,
  moderate: 1000,
  strong: 2500,
  extreme: 5300,
} as const;

/**
 * Inhibición convectiva a partir de la cual se considera que tapa. El signo se
 * ignora: distintos modelos la sirven positiva o negativa.
 */
export const INHIBITING_CIN_JKG = 50;

/**
 * Clasifica la CAPE como **riesgo**, con la inhibición que la tapa.
 *
 * Nunca entra en la puntuación como mérito: una CAPE alta anuncia convección
 * profunda, no térmicas fuertes.
 *
 * @source Glendening (DrJack), RASP BLIPMAP, bandas de CAPE.
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
