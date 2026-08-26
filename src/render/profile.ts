/**
 * Perfil de ascendencias.
 *
 * Tres curvas: la media sobre la sección de la térmica, la del núcleo y la
 * lectura esperada de variómetro —el núcleo menos el régimen de caída—. Ver las
 * tres juntas deja claro por qué `hcrit` cae donde cae, y por qué medir el
 * techo contra la media declararía involable un día normal.
 */

import type { MPerS, Metres } from "../units/branded.js";
import type { AircraftProfile } from "../aircraft/profiles.js";
import { updraftProfile } from "../convection/updraft.js";
import { MIN_FONT_SIZE_PX, resolvePalette } from "./theme.js";
import type { RenderOptions } from "./theme.js";
import { document, element, legend, polyline, round, text } from "./svg.js";

const MARGIN = { top: 30, right: 16, bottom: 32, left: 48 } as const;

export interface ProfileMarks {
  readonly hcritAglM?: Metres;
  readonly cloudBaseAglM?: Metres;
  readonly thermalTopAglM?: Metres;
}

export interface UpdraftProfileOptions extends RenderOptions {
  readonly marks?: ProfileMarks;
  readonly maxClimbMs?: MPerS;
}

/**
 * Perfil vertical de ascendencia para un `w*` y una capa dados.
 *
 * @source Allen (2006), AIAA 2006-1510, ec. 11-15.
 */
export function renderUpdraftProfile(
  wStarMs: MPerS,
  ziAglM: Metres,
  profile: AircraftProfile,
  options: UpdraftProfileOptions = {},
): string {
  const palette = resolvePalette(options.palette);
  const widthPx = options.widthPx ?? 520;
  const heightPx = options.heightPx ?? 520;
  const plotWidth = widthPx - MARGIN.left - MARGIN.right;
  const plotHeight = heightPx - MARGIN.top - MARGIN.bottom;

  const points = updraftProfile(wStarMs, ziAglM);
  const peak = Math.max(...points.map((p) => p.peakMs), 0.5);
  const maxClimb = options.maxClimbMs ?? Math.ceil(peak * 1.1);
  const sink: number = profile.circlingSinkMs;
  const threshold: number = profile.hcritThresholdMs;
  // El eje se dimensiona con el mayor de los dos para que cambiar de perfil no
  // reencuadre el dibujo: dos veleros distintos han de poder compararse a ojo.
  const minClimb = Math.floor(Math.min(0, -Math.max(sink, threshold)) * 2) / 2;

  const xOf = (climbMs: number): number =>
    MARGIN.left + ((climbMs - minClimb) / (maxClimb - minClimb)) * plotWidth;
  const yOf = (aglM: number): number =>
    MARGIN.top + plotHeight - (aglM / Math.max(ziAglM, 1)) * plotHeight;

  const parts: string[] = [];

  // Rejilla de alturas.
  const step = ziAglM > 2500 ? 1000 : 500;
  for (let z = 0; z <= ziAglM; z += step) {
    const y = yOf(z);
    parts.push(
      polyline(
        [
          [MARGIN.left, y],
          [MARGIN.left + plotWidth, y],
        ],
        { stroke: palette.grid, "stroke-width": 0.5 },
      ),
      text(String(z), {
        x: MARGIN.left - 6,
        y: y + 3,
        fill: palette.label,
        "font-size": MIN_FONT_SIZE_PX,
        "text-anchor": "end",
      }),
    );
  }

  // Cero de ascendencia.
  parts.push(
    polyline(
      [
        [xOf(0), MARGIN.top],
        [xOf(0), MARGIN.top + plotHeight],
      ],
      { stroke: palette.axis, "stroke-width": 1 },
    ),
  );

  for (let climb = Math.ceil(minClimb); climb <= maxClimb; climb += 1) {
    const x = xOf(climb);
    if (x < MARGIN.left || x > MARGIN.left + plotWidth) continue;
    parts.push(
      text(String(climb), {
        x,
        y: MARGIN.top + plotHeight + 14,
        fill: palette.label,
        "font-size": MIN_FONT_SIZE_PX,
        "text-anchor": "middle",
      }),
    );
  }

  // Umbral de hcrit. Cruza la curva de núcleo justo a la altura de la marca
  // `hcrit`, y eso es lo que explica por qué la marca cae donde cae: no es
  // donde el variómetro llega a cero, que con un velero real es más arriba.
  if (threshold > minClimb && threshold < maxClimb) {
    const x = xOf(threshold);
    parts.push(
      polyline(
        [
          [x, MARGIN.top],
          [x, MARGIN.top + plotHeight],
        ],
        { stroke: palette.accent, "stroke-width": 1, "stroke-dasharray": "2 3" },
      ),
    );
  }

  const mean = points.map((p) => [xOf(p.meanMs), yOf(p.zAglM)] as const);
  const core = points.map((p) => [xOf(p.peakMs), yOf(p.zAglM)] as const);
  const vario = points.map(
    (p) => [xOf(p.peakMs - profile.circlingSinkMs), yOf(p.zAglM)] as const,
  );

  // Las curvas se recortan al área de dibujo: la de variómetro puede salir de
  // la rejilla por arriba cuando el régimen de caída supera la ascendencia
  // residual en el tope de la capa.
  const clipId = "plot-clip";
  parts.push(
    element(
      "clipPath",
      { id: clipId },
      element("rect", {
        x: MARGIN.left,
        y: MARGIN.top,
        width: round(plotWidth),
        height: round(plotHeight),
      }),
    ),
  );

  const curves = [
    polyline(mean, {
      stroke: palette.climb,
      "stroke-width": 1,
      "stroke-dasharray": "3 3",
      opacity: 0.7,
    }),
    polyline(core, { stroke: palette.core, "stroke-width": 2 }),
    polyline(vario, { stroke: palette.accent, "stroke-width": 2 }),
  ].join("");
  parts.push(element("g", { "clip-path": `url(#${clipId})` }, curves));

  const marks: [Metres | undefined, string, string][] = [
    [options.marks?.hcritAglM, "hcrit", palette.accent],
    [options.marks?.cloudBaseAglM, "base", palette.cloud],
    [options.marks?.thermalTopAglM, "techo", palette.ceiling],
  ];
  for (const [aglM, label, colour] of marks) {
    if (aglM === undefined) continue;
    const y = yOf(aglM);
    parts.push(
      polyline(
        [
          [MARGIN.left, y],
          [MARGIN.left + plotWidth, y],
        ],
        { stroke: colour, "stroke-width": 1, "stroke-dasharray": "4 4" },
      ),
      text(`${label} ${String(Math.round(aglM))} m AGL`, {
        x: MARGIN.left + plotWidth - 2,
        y: y - 3,
        fill: colour,
        "font-size": MIN_FONT_SIZE_PX,
        "text-anchor": "end",
      }),
    );
  }

  parts.push(
    element("rect", {
      x: MARGIN.left,
      y: MARGIN.top,
      width: round(plotWidth),
      height: round(plotHeight),
      fill: "none",
      stroke: palette.axis,
      "stroke-width": 1,
    }),
    legend(
      [
        { label: "núcleo", colour: palette.core },
        { label: "variómetro", colour: palette.accent },
        { label: "media", colour: palette.climb, dashed: true },
        { label: "umbral hcrit", colour: palette.accent, dashed: true },
      ],
      MARGIN.left,
      14,
      MIN_FONT_SIZE_PX,
      palette.label,
    ),
  );

  return document(
    {
      widthPx,
      heightPx,
      title: options.title ?? "Perfil de ascendencias",
      desc:
        options.desc ??
        `Ascendencia media, de núcleo y lectura de variómetro frente a la altura, hasta ${round(ziAglM, 0)} m sobre el terreno. La vertical marca el umbral con el que se fija hcrit.`,
      ...(options.className === undefined ? {} : { className: options.className }),
    },
    parts.join(""),
  );
}
