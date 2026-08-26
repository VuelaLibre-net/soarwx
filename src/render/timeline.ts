/**
 * Daily soaring timeline rendering: convective layer evolution across hours.
 *
 * Implements continuous area chart visualization for thermal ceiling, thermal top, and cloud base.
 */

import type { SoaringDay, SoaringHour } from "../report/types.js";
import { MIN_FONT_SIZE_PX, resolvePalette } from "./theme.js";
import type { RenderOptions } from "./theme.js";
import { windArrow } from "./glyphs.js";
import { document, element, legend, polyline, round, text } from "./svg.js";

const MARGIN = { top: 46, right: 12, bottom: 42, left: 46 } as const;

/** Height of upper wind strip in pixels. */
const WIND_STRIP_PX = 18;

/** Height of bottom score index strip in pixels. */
const LEVEL_STRIP_PX = 8;

/** Soaring window background fill opacity. */
export const WINDOW_FILL_OPACITY = 0.22;

/** Score level bar opacity mapping. */
export const LEVEL_OPACITY: Readonly<Record<1 | 2 | 3 | 4 | 5, number>> = {
  1: 0.15,
  2: 0.3,
  3: 0.5,
  4: 0.75,
  5: 1,
};

/** Usable thermal layer fill opacity. */
const USABLE_FILL_OPACITY = 0.45;

/** Residual convective layer fill opacity. */
const RESIDUAL_FILL_OPACITY = 0.16;

type Point = readonly [number, number];

/**
 * Monotone cubic interpolation commands preserving local extrema.
 */
function smoothCurveCommands(points: readonly Point[]): string {
  if (points.length < 2) return "";

  const slopes: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    if (current && next) {
      slopes.push((next[1] - current[1]) / (next[0] - current[0]));
    }
  }

  const tangents: number[] = [];
  for (let i = 0; i < slopes.length; i++) {
    const slope = slopes[i] ?? 0;
    if (i === 0 || i === slopes.length - 1) {
      tangents.push(slope);
      continue;
    }

    const previous = slopes[i - 1] ?? 0;
    if (previous * slope <= 0) {
      tangents.push(0);
      continue;
    }

    const prevPt = points[i - 1];
    const currPt = points[i];
    const nextPt = points[i + 1];
    const previousWidth = currPt && prevPt ? currPt[0] - prevPt[0] : 0;
    const nextWidth = nextPt && currPt ? nextPt[0] - currPt[0] : 0;
    const previousWeight = 2 * nextWidth + previousWidth;
    const nextWeight = nextWidth + 2 * previousWidth;
    tangents.push(
      (previousWeight + nextWeight) / (previousWeight / previous + nextWeight / slope),
    );
  }

  const commands: string[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    if (!current || !next) continue;
    const [x, y] = current;
    const [nextX, nextY] = next;
    const width = nextX - x;
    const tCurrent = tangents[i] ?? 0;
    const tNext = tangents[i + 1] ?? 0;
    commands.push(
      `C ${round(x + width / 3)} ${round(y + (tCurrent * width) / 3)} ${round(nextX - width / 3)} ${round(nextY - (tNext * width) / 3)} ${round(nextX)} ${round(nextY)}`,
    );
  }

  return commands.join(" ");
}

function smoothLine(
  points: readonly Point[],
  attrs: Readonly<Record<string, string | number>>,
): string {
  const first = points[0];
  if (!first) return "";
  const [x, y] = first;
  return element("path", {
    ...attrs,
    fill: "none",
    d: `M ${round(x)} ${round(y)} ${smoothCurveCommands(points)}`,
  });
}

function smoothArea(
  upper: readonly Point[],
  lower: readonly Point[],
  attrs: Readonly<Record<string, string | number>>,
): string {
  const start = upper[0];
  const reversedLower = [...lower].reverse();
  const end = reversedLower[0];
  if (!start || !end) return "";
  const [startX, startY] = start;
  const [endX, endY] = end;
  return element("path", {
    ...attrs,
    d: `M ${round(startX)} ${round(startY)} ${smoothCurveCommands(upper)} L ${round(endX)} ${round(endY)} ${smoothCurveCommands(reversedLower)} Z`,
  });
}

function smoothAreaToBaseline(
  points: readonly Point[],
  baseline: number,
  attrs: Readonly<Record<string, string | number>>,
): string {
  if (points.length < 2) return "";
  const start = points[0];
  const end = points[points.length - 1];
  if (!start || !end) return "";
  const [startX, startY] = start;
  const [endX] = end;
  return element("path", {
    ...attrs,
    d: `M ${round(startX)} ${round(startY)} ${smoothCurveCommands(points)} L ${round(endX)} ${round(baseline)} L ${round(startX)} ${round(baseline)} Z`,
  });
}

export interface TimelineOptions extends RenderOptions {
  /** Local hour range filter bounds. */
  readonly fromLocalHours?: number;
  readonly toLocalHours?: number;
  /** Enable wind direction strip above chart. Defaults to true. */
  readonly wind?: boolean;
}

/** Returns cumulus base altitude if present (null on blue thermal days). */
function cumulusBaseOf(hour: SoaringHour): number | null {
  return hour.cloud.blue ? null : hour.cloud.baseAglM;
}

/**
 * Renders daily soaring timeline visualization.
 *
 * @source Requirement R-14.2 from docs/REQUIREMENTS.md.
 */
export function renderDayTimeline(
  day: SoaringDay,
  options: TimelineOptions = {},
): string {
  const palette = resolvePalette(options.palette);
  const widthPx = options.widthPx ?? 640;
  const heightPx = options.heightPx ?? 260;
  const showWind = options.wind ?? true;

  const marginTop = MARGIN.top + (showWind ? WIND_STRIP_PX : 0);
  const plotWidth = widthPx - MARGIN.left - MARGIN.right;
  const plotHeight = heightPx - marginTop - MARGIN.bottom;
  const plotBottom = marginTop + plotHeight;

  const fromLocalHours = options.fromLocalHours ?? 6;
  const toLocalHours = options.toLocalHours ?? 21;
  const hours = day.hours.filter((hour) => {
    const local = Number(hour.timeUtc.slice(11, 13));
    return local >= fromLocalHours && local <= toLocalHours;
  });

  const maxHeight = Math.max(
    3000,
    ...hours.map((hour) => hour.thermal.thermalTopAglM),
    ...hours.map((hour) => cumulusBaseOf(hour) ?? 0),
  );

  const slot = hours.length > 0 ? plotWidth / hours.length : plotWidth;
  const xOf = (index: number): number => MARGIN.left + (index + 0.5) * slot;
  const yOf = (aglM: number): number => plotBottom - (aglM / maxHeight) * plotHeight;

  const parts: string[] = [];

  // Altitude grid lines.
  const step = maxHeight > 2500 ? 1000 : 500;
  for (let z = 0; z <= maxHeight; z += step) {
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

  // Soaring windows background.
  for (const window of day.windows) {
    const start = hours.findIndex((hour) => hour.timeUtc === window.startUtc);
    const end = hours.findIndex((hour) => hour.timeUtc === window.endUtc);
    if (start < 0 || end < 0) continue;
    const left = MARGIN.left + start * slot;
    const width = (end - start + 1) * slot;
    parts.push(
      element("rect", {
        x: round(left),
        y: round(marginTop),
        width: round(width),
        height: round(plotHeight),
        fill: palette.window,
        opacity: WINDOW_FILL_OPACITY,
      }),
      polyline(
        [
          [left, marginTop],
          [left + width, marginTop],
        ],
        { stroke: palette.window, "stroke-width": 2 },
      ),
    );
  }

  if (hours.length > 0) {
    const ceilingPoints = hours.map(
      (hour, index) => [xOf(index), yOf(hour.ceiling.aglM)] as const,
    );
    const topPoints = hours.map(
      (hour, index) => [xOf(index), yOf(hour.thermal.thermalTopAglM)] as const,
    );

    const ceilingRuns: Point[][] = [];
    let ceilingRun: Point[] = [];
    hours.forEach((hour, index) => {
      const pt = ceilingPoints[index];
      if (pt && hour.ceiling.aglM > 0) ceilingRun.push(pt);
      else if (ceilingRun.length > 0) {
        ceilingRuns.push(ceilingRun);
        ceilingRun = [];
      }
    });
    if (ceilingRun.length > 0) ceilingRuns.push(ceilingRun);

    parts.push(
      smoothArea(topPoints, ceilingPoints, {
        fill: palette.ceiling,
        opacity: RESIDUAL_FILL_OPACITY,
        stroke: "none",
      }),
      smoothLine(topPoints, {
        stroke: palette.core,
        "stroke-width": 1.5,
        "stroke-linecap": "round",
      }),
    );

    for (const run of ceilingRuns) {
      parts.push(
        smoothAreaToBaseline(run, plotBottom, {
          fill: palette.ceiling,
          opacity: USABLE_FILL_OPACITY,
          stroke: "none",
        }),
      );

      const first = run[0];
      if (run.length === 1 && first) {
        const [x, y] = first;
        parts.push(
          element("circle", { cx: round(x), cy: round(y), r: 2, fill: palette.ceiling }),
        );
      } else {
        parts.push(
          smoothLine(run, {
            stroke: palette.ceiling,
            "stroke-width": 2,
            "stroke-linecap": "round",
          }),
        );
      }
    }

    // Cloud base line.
    let run: (readonly [number, number])[] = [];
    const flushRun = (): void => {
      if (run.length > 1) {
        parts.push(
          polyline([...run], {
            stroke: palette.cloud,
            "stroke-width": 1.5,
            "stroke-dasharray": "4 3",
            "stroke-linejoin": "round",
          }),
        );
      }
      run = [];
    };
    hours.forEach((hour, index) => {
      const base = cumulusBaseOf(hour);
      if (base === null) flushRun();
      else run.push([xOf(index), yOf(base)]);
    });
    flushRun();
  }

  // Upper wind direction strip.
  if (showWind && hours.length > 0) {
    const y = MARGIN.top + WIND_STRIP_PX / 2;
    parts.push(
      text("wind", {
        x: MARGIN.left - 6,
        y: y + 3,
        fill: palette.label,
        "font-size": MIN_FONT_SIZE_PX,
        "text-anchor": "end",
      }),
    );
    hours.forEach((hour, index) => {
      if (hour.thermal.thermalTopAglM <= 0) return;
      parts.push(
        windArrow(
          xOf(index),
          y,
          (hour.wind.blTop.fromDeg + 180) % 360,
          Math.min(WIND_STRIP_PX, slot * 0.7),
          palette.wind,
        ),
      );
    });
  }

  // Hourly score strip.
  hours.forEach((hour, index) => {
    parts.push(
      element("rect", {
        x: round(MARGIN.left + index * slot + 0.5),
        y: round(plotBottom + 4),
        width: round(Math.max(1, slot - 1)),
        height: LEVEL_STRIP_PX,
        fill: palette.accent,
        opacity: LEVEL_OPACITY[hour.score.level],
      }),
    );

    const local = Number(hour.timeUtc.slice(11, 13));
    if (local % 3 === 0) {
      parts.push(
        text(String(local), {
          x: round(xOf(index)),
          y: plotBottom + LEVEL_STRIP_PX + 18,
          fill: palette.label,
          "font-size": MIN_FONT_SIZE_PX,
          "text-anchor": "middle",
        }),
      );
    }
  });

  // Best soaring hour vertical line.
  const bestIndex = hours.findIndex((hour) => hour.timeUtc === day.best?.timeUtc);
  if (bestIndex >= 0) {
    parts.push(
      polyline(
        [
          [xOf(bestIndex), marginTop],
          [xOf(bestIndex), plotBottom],
        ],
        { stroke: palette.accent, "stroke-width": 1.5, "stroke-dasharray": "3 3" },
      ),
    );
  }

  const hasCumulus = hours.some((hour) => cumulusBaseOf(hour) !== null);

  parts.push(
    element("rect", {
      x: MARGIN.left,
      y: round(marginTop),
      width: round(plotWidth),
      height: round(plotHeight),
      fill: "none",
      stroke: palette.axis,
      "stroke-width": 1,
    }),
    legend(
      [
        { label: "usable ceiling (m AGL)", colour: palette.ceiling },
        { label: "thermal top", colour: palette.core },
        ...(hasCumulus
          ? [{ label: "cumulus base", colour: palette.cloud, dashed: true }]
          : []),
      ],
      MARGIN.left,
      12,
      MIN_FONT_SIZE_PX,
      palette.label,
    ),
    legend(
      [
        { label: "soaring window", colour: palette.window },
        { label: "best hour", colour: palette.accent, dashed: true },
        { label: "hourly score", colour: palette.accent },
      ],
      MARGIN.left,
      28,
      MIN_FONT_SIZE_PX,
      palette.label,
    ),
  );

  const maxCeiling = Math.max(0, ...hours.map((hour) => hour.ceiling.aglM));

  return document(
    {
      widthPx,
      heightPx,
      title: options.title ?? "Day timeline",
      desc:
        options.desc ??
        `Hourly convective layer at ${day.site.name ?? "the site"} on ${day.dateLocal}. Peak usable ceiling ${round(maxCeiling, 0)} m AGL, peak thermal top ${round(maxHeight, 0)} m.`,
      ...(options.className === undefined ? {} : { className: options.className }),
    },
    parts.join(""),
  );
}
