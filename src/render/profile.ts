/**
 * Updraft profile rendering.
 *
 * Visualizes mean thermal updraft velocity, core peak climb, and net variometer sink.
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
 * Renders vertical updraft profile for specified convective velocity scale (w*) and boundary layer depth.
 *
 * @source Allen (2006), AIAA 2006-1510, equations 11-15.
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
  const minClimb = Math.floor(Math.min(0, -Math.max(sink, threshold)) * 2) / 2;

  const xOf = (climbMs: number): number =>
    MARGIN.left + ((climbMs - minClimb) / (maxClimb - minClimb)) * plotWidth;
  const yOf = (aglM: number): number =>
    MARGIN.top + plotHeight - (aglM / Math.max(ziAglM, 1)) * plotHeight;

  const parts: string[] = [];

  // Altitude grid lines.
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

  // Zero-climb reference axis.
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

  // hcrit threshold marker.
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
    [options.marks?.thermalTopAglM, "top", palette.ceiling],
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
        { label: "core", colour: palette.core },
        { label: "variometer", colour: palette.accent },
        { label: "mean", colour: palette.climb, dashed: true },
        { label: "hcrit threshold", colour: palette.accent, dashed: true },
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
      title: options.title ?? "Updraft profile",
      desc:
        options.desc ??
        `Mean updraft, core climb, and variometer reading vs height, up to ${round(ziAglM, 0)} m AGL. Vertical line marks the hcrit threshold.`,
      ...(options.className === undefined ? {} : { className: options.className }),
    },
    parts.join(""),
  );
}
