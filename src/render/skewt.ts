/**
 * Skew-T log-P atmospheric sounding chart rendering.
 *
 * Visualizes temperature, dewpoint, dry adiabats, parcel trajectories, and wind profile panels.
 */

import { Pa } from "../units/branded.js";
import type { Kelvin, Metres } from "../units/branded.js";
import { celsiusToK, kToCelsius, paToHPa } from "../units/convert.js";
import { temperatureFromPotential } from "../thermo/potential.js";
import { dryAdiabaticLift } from "../thermo/parcel.js";
import type { Sounding } from "../sounding/types.js";
import { MIN_FONT_SIZE_PX, resolvePalette } from "./theme.js";
import type { RenderOptions } from "./theme.js";
import { document, element, legend, polyline, round, text } from "./svg.js";
import { cumulusGlyph, windArrow } from "./glyphs.js";

const MARGIN = { top: 30, right: 12, bottom: 40, left: 44 } as const;

/** Width of wind panel and its gap from main sounding chart. */
const WIND_PANEL_WIDTH_PX = 76;
const WIND_PANEL_GAP_PX = 10;

/**
 * Wind speed shading thresholds in m/s.
 *
 * First threshold is 30 km/h (8.33 m/s) where thermal drift becomes significant.
 * Second threshold is Allen (2006) convective cutoff (12.87 m/s) where thermals break down.
 */
export const WIND_SHADE_THRESHOLDS_MS = { brisk: 8.33, cutoff: 12.87 } as const;

/** Minimum vertical spacing between wind arrows in pixels. */
const WIND_ARROW_MIN_GAP_PX = 34;

/** Wind arrow length in pixels. */
const WIND_ARROW_LENGTH_PX = 22;

/** Temperature axis padding in degrees Celsius. */
const TEMP_PADDING_C = 8;

/** Altitude reference for isobaric pressure level labels. */
export type HeightReference = "agl" | "msl";

export interface SkewTOptions extends RenderOptions {
  /** Temperature axis range bounds in Kelvin. */
  readonly minTempK?: Kelvin;
  readonly maxTempK?: Kelvin;
  readonly topHpa?: number;
  /** Initial surface parcel temperature in Kelvin. */
  readonly parcelFromK?: Kelvin;
  /** Lifting condensation level (cloud base) in metres MSL. */
  readonly lclMslM?: Metres;
  /** Usable thermal ceiling in metres MSL. */
  readonly ceilingMslM?: Metres;
  /** Altitude reference for isobaric pressure level labels. Defaults to "agl". */
  readonly heightReference?: HeightReference;
  /** Enable wind profile panel on the right. Defaults to true. */
  readonly wind?: boolean;
  /** Unit for wind panel labels. Defaults to "kmh". */
  readonly windUnit?: WindUnit;
  /** Cloud top altitude in metres MSL for cloud layer shading. */
  readonly cloudTopMslM?: Metres;
}

export type WindUnit = "kmh" | "kt" | "ms";

const WIND_UNITS: Readonly<
  Record<WindUnit, { readonly label: string; readonly from: (ms: number) => number }>
> = {
  kmh: { label: "km/h", from: (ms) => ms * 3.6 },
  kt: { label: "kt", from: (ms) => ms / (1852 / 3600) },
  ms: { label: "m/s", from: (ms) => ms },
};

/**
 * Renders a Skew-T log-P thermodynamic diagram from an atmospheric sounding.
 *
 * @source Standard oblique thermodynamic chart; Stull, Practical Meteorology, ch. 5.
 */
export function renderSkewT(sounding: Sounding, options: SkewTOptions = {}): string {
  const palette = resolvePalette(options.palette);
  const widthPx = options.widthPx ?? 520;
  const heightPx = options.heightPx ?? 520;
  const showWind = options.wind ?? true;
  const windWidth = showWind ? WIND_PANEL_WIDTH_PX + WIND_PANEL_GAP_PX : 0;
  const plotWidth = widthPx - MARGIN.left - MARGIN.right - windWidth;
  const plotHeight = heightPx - MARGIN.top - MARGIN.bottom;

  const levels = sounding.levels;
  const bottomHpa = paToHPa(levels[0]?.pressurePa ?? Pa(101325));
  const topHpa =
    options.topHpa ??
    Math.max(300, paToHPa(levels[levels.length - 1]?.pressurePa ?? Pa(50000)));

  const observed = levels.flatMap((level) => [
    kToCelsius(level.tempK),
    kToCelsius(level.dewpointK),
  ]);
  const minTempC =
    options.minTempK === undefined
      ? Math.floor((Math.min(...observed) - TEMP_PADDING_C) / 5) * 5
      : kToCelsius(options.minTempK);
  const maxTempC =
    options.maxTempK === undefined
      ? Math.ceil((Math.max(...observed) + TEMP_PADDING_C) / 5) * 5
      : kToCelsius(options.maxTempK);

  /** Skew shift: horizontal displacement of an isotherm from bottom to top. */
  const skewPx = plotWidth * 0.45;

  const yOf = (hpa: number): number => {
    const span = Math.log(bottomHpa) - Math.log(topHpa);
    return (
      MARGIN.top +
      plotHeight -
      ((Math.log(bottomHpa) - Math.log(hpa)) / span) * plotHeight
    );
  };
  const xOf = (tempC: number, hpa: number): number => {
    const base = ((tempC - minTempC) / (maxTempC - minTempC)) * plotWidth;
    const lift = (MARGIN.top + plotHeight - yOf(hpa)) / plotHeight;
    return MARGIN.left + base + lift * skewPx;
  };

  const clip = (x: number): number =>
    Math.min(Math.max(x, MARGIN.left), MARGIN.left + plotWidth);

  const parts: string[] = [];

  // Oblique isotherms.
  for (let tempC = minTempC; tempC <= maxTempC; tempC += 10) {
    parts.push(
      polyline(
        [
          [clip(xOf(tempC, bottomHpa)), yOf(bottomHpa)],
          [clip(xOf(tempC, topHpa)), yOf(topHpa)],
        ],
        { stroke: palette.grid, "stroke-width": 0.5 },
      ),
    );
  }

  // Dry adiabats.
  for (let thetaC = -20; thetaC <= 80; thetaC += 10) {
    const points: [number, number][] = [];
    for (let hpa = bottomHpa; hpa >= topHpa; hpa -= 25) {
      const tempC = kToCelsius(
        temperatureFromPotential(celsiusToK(thetaC), Pa(hpa * 100)),
      );
      points.push([xOf(tempC, hpa), yOf(hpa)]);
    }
    const inside = points.filter(
      ([x]) => x >= MARGIN.left - 40 && x <= MARGIN.left + plotWidth + 40,
    );
    if (inside.length > 1) {
      parts.push(
        polyline(
          inside.map(([x, y]) => [clip(x), y] as const),
          {
            stroke: palette.grid,
            "stroke-width": 0.5,
            "stroke-dasharray": "2 3",
            opacity: 0.7,
          },
        ),
      );
    }
  }

  // Axes.
  const heightReference = options.heightReference ?? "agl";
  const elevationMslM = sounding.site.elevationMslM;

  for (const hpa of [1000, 900, 850, 800, 700, 600, 500, 400, 300]) {
    if (hpa > bottomHpa || hpa < topHpa) continue;
    const y = yOf(hpa);
    parts.push(
      polyline(
        [
          [MARGIN.left, y],
          [MARGIN.left + plotWidth, y],
        ],
        { stroke: palette.grid, "stroke-width": 0.5 },
      ),
      text(String(hpa), {
        x: MARGIN.left - 6,
        y: y - 1,
        fill: palette.label,
        "font-size": MIN_FONT_SIZE_PX,
        "text-anchor": "end",
      }),
    );

    const heightMslM = heightAtPressure(sounding, hpa);
    if (heightMslM === null) continue;
    const value = heightReference === "agl" ? heightMslM - elevationMslM : heightMslM;
    if (value < -50) continue;
    parts.push(
      text(String(Math.round(Math.max(0, value) / 10) * 10), {
        x: MARGIN.left - 6,
        y: y + 9,
        fill: palette.label,
        "font-size": MIN_FONT_SIZE_PX,
        "text-anchor": "end",
        opacity: 0.75,
      }),
    );
  }

  parts.push(
    text("hPa", {
      x: MARGIN.left - 6,
      y: MARGIN.top + plotHeight + 12,
      fill: palette.label,
      "font-size": MIN_FONT_SIZE_PX,
      "text-anchor": "end",
    }),
    text(heightReference === "agl" ? "m AGL" : "m MSL", {
      x: MARGIN.left - 6,
      y: MARGIN.top + plotHeight + 23,
      fill: palette.label,
      "font-size": MIN_FONT_SIZE_PX,
      "text-anchor": "end",
      opacity: 0.75,
    }),
  );
  const tempStep = maxTempC - minTempC > 60 ? 10 : 5;
  for (let tempC = minTempC; tempC <= maxTempC; tempC += tempStep) {
    const x = xOf(tempC, bottomHpa);
    if (x < MARGIN.left || x > MARGIN.left + plotWidth) continue;
    parts.push(
      text(`${String(tempC)}°`, {
        x,
        y: MARGIN.top + plotHeight + 14,
        fill: palette.label,
        "font-size": MIN_FONT_SIZE_PX,
        "text-anchor": "middle",
      }),
    );
  }

  const environment = levels.map(
    (level) =>
      [
        xOf(kToCelsius(level.tempK), paToHPa(level.pressurePa)),
        yOf(paToHPa(level.pressurePa)),
      ] as const,
  );
  const dewpoint = levels.map(
    (level) =>
      [
        xOf(kToCelsius(level.dewpointK), paToHPa(level.pressurePa)),
        yOf(paToHPa(level.pressurePa)),
      ] as const,
  );

  parts.push(
    polyline(dewpoint, { stroke: palette.dewpoint, "stroke-width": 2 }),
    polyline(environment, { stroke: palette.temperature, "stroke-width": 2 }),
  );

  const parcelFromK = options.parcelFromK;
  if (parcelFromK !== undefined) {
    const surfacePressure = levels[0]?.pressurePa ?? Pa(101325);
    const parcel = levels.map((level) => {
      const tempC = kToCelsius(
        dryAdiabaticLift(parcelFromK, surfacePressure, level.pressurePa),
      );
      return [
        xOf(tempC, paToHPa(level.pressurePa)),
        yOf(paToHPa(level.pressurePa)),
      ] as const;
    });
    parts.push(
      polyline(parcel, {
        stroke: palette.parcel,
        "stroke-width": 1.5,
        "stroke-dasharray": "5 3",
      }),
    );
  }

  // Cloud layer shading and base glyph.
  const cloudBaseHpa =
    options.lclMslM === undefined ? null : pressureAtHeight(sounding, options.lclMslM);
  if (cloudBaseHpa !== null && options.lclMslM !== undefined) {
    const baseY = yOf(cloudBaseHpa);
    const topHpaOfCloud =
      options.cloudTopMslM === undefined
        ? null
        : pressureAtHeight(sounding, options.cloudTopMslM);
    if (topHpaOfCloud !== null) {
      const topY = yOf(topHpaOfCloud);
      parts.push(
        element("rect", {
          x: MARGIN.left,
          y: round(Math.min(topY, baseY)),
          width: round(plotWidth),
          height: round(Math.abs(baseY - topY)),
          fill: palette.cloud,
          opacity: 0.14,
        }),
      );
    }
    parts.push(
      polyline(
        [
          [MARGIN.left, baseY],
          [MARGIN.left + plotWidth, baseY],
        ],
        { stroke: palette.cloud, "stroke-width": 1, "stroke-dasharray": "4 4" },
      ),
      cumulusGlyph(MARGIN.left + plotWidth - 20, baseY - 8, 26, palette.cloud),
      text(
        String(
          Math.round(
            (heightReference === "agl"
              ? options.lclMslM - elevationMslM
              : options.lclMslM) / 10,
          ) * 10,
        ),
        {
          x: MARGIN.left + plotWidth - 20,
          y: baseY + 12,
          fill: palette.cloud,
          "font-size": MIN_FONT_SIZE_PX,
          "text-anchor": "middle",
        },
      ),
    );
  }

  if (options.ceilingMslM !== undefined) {
    const hpa = pressureAtHeight(sounding, options.ceilingMslM);
    if (hpa !== null) {
      const y = yOf(hpa);
      parts.push(
        polyline(
          [
            [MARGIN.left, y],
            [MARGIN.left + plotWidth, y],
          ],
          { stroke: palette.ceiling, "stroke-width": 1, "stroke-dasharray": "4 4" },
        ),
        text(
          `usable ceiling ${String(Math.round(options.ceilingMslM - elevationMslM))} m AGL`,
          {
            x: MARGIN.left + 4,
            y: y - 3,
            fill: palette.ceiling,
            "font-size": MIN_FONT_SIZE_PX,
          },
        ),
      );
    }
  }

  if (showWind) {
    parts.push(
      renderWindPanel({
        sounding,
        left: MARGIN.left + plotWidth + WIND_PANEL_GAP_PX,
        top: MARGIN.top,
        width: WIND_PANEL_WIDTH_PX,
        height: plotHeight,
        yOf,
        palette,
        unit: WIND_UNITS[options.windUnit ?? "kmh"],
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
        { label: "temperature", colour: palette.temperature },
        { label: "dewpoint", colour: palette.dewpoint },
        ...(options.parcelFromK === undefined
          ? []
          : [{ label: "parcel", colour: palette.parcel, dashed: true }]),
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
      title: options.title ?? "Skew-T Sounding",
      desc:
        options.desc ??
        `Temperature and dewpoint vs pressure at ${sounding.site.name ?? "the site"}.`,
      ...(options.className === undefined ? {} : { className: options.className }),
    },
    parts.join(""),
  );
}

/**
 * Computes geopotential height at specified pressure level by log-linear interpolation.
 */
function heightAtPressure(sounding: Sounding, hpa: number): number | null {
  const target = hpa * 100;
  const levels = sounding.levels;
  for (let i = 1; i < levels.length; i++) {
    const lower = levels[i - 1];
    const upper = levels[i];
    if (!lower || !upper) continue;
    if (target <= lower.pressurePa && target >= upper.pressurePa) {
      const span = Math.log(upper.pressurePa / lower.pressurePa);
      const f = span === 0 ? 0 : Math.log(target / lower.pressurePa) / span;
      return (
        lower.geopotentialMslM + f * (upper.geopotentialMslM - lower.geopotentialMslM)
      );
    }
  }
  return null;
}

/** Computes approximate atmospheric pressure at altitude by log-linear interpolation. */
function pressureAtHeight(sounding: Sounding, mslM: Metres): number | null {
  const levels = sounding.levels;
  for (let i = 1; i < levels.length; i++) {
    const lower = levels[i - 1];
    const upper = levels[i];
    if (!lower || !upper) continue;
    if (mslM >= lower.geopotentialMslM && mslM <= upper.geopotentialMslM) {
      const f =
        (mslM - lower.geopotentialMslM) /
        (upper.geopotentialMslM - lower.geopotentialMslM);
      return paToHPa(
        Pa(lower.pressurePa * Math.pow(upper.pressurePa / lower.pressurePa, f)),
      );
    }
  }
  return null;
}

interface WindPanelInput {
  readonly sounding: Sounding;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly yOf: (hpa: number) => number;
  readonly palette: ReturnType<typeof resolvePalette>;
  readonly unit: { readonly label: string; readonly from: (ms: number) => number };
}

/**
 * Wind speed profile and direction arrow panel.
 *
 * Aligns vertically with sounding isobaric pressure levels.
 *
 * @source flyXC sounding format; shading thresholds defined in WIND_SHADE_THRESHOLDS_MS.
 */
function renderWindPanel(input: WindPanelInput): string {
  const { sounding, left, top, width, height, yOf, palette, unit } = input;
  const levels = sounding.levels;
  const maxObserved = Math.max(...levels.map((level) => level.windSpeedMs), 5);

  const stepDisplay = niceStep(unit.from(Math.max(maxObserved * 1.15, 15.5)));
  const stepMs = stepDisplay / (unit.from(1) || 1);
  const maxMs = Math.ceil(Math.max(maxObserved * 1.15, 15.5) / stepMs) * stepMs;
  const xOf = (ms: number): number => left + (ms / maxMs) * width;

  const parts: string[] = [];

  for (const [from, opacity] of [
    [WIND_SHADE_THRESHOLDS_MS.brisk, 0.1],
    [WIND_SHADE_THRESHOLDS_MS.cutoff, 0.18],
  ] as const) {
    if (from >= maxMs) continue;
    parts.push(
      element("rect", {
        x: round(xOf(from)),
        y: round(top),
        width: round(left + width - xOf(from)),
        height: round(height),
        fill: palette.temperature,
        opacity,
      }),
    );
  }

  for (let ms = stepMs; ms < maxMs - 1e-9; ms += stepMs) {
    const x = xOf(ms);
    parts.push(
      polyline(
        [
          [x, top],
          [x, top + height],
        ],
        { stroke: palette.grid, "stroke-width": 0.5 },
      ),
      element(
        "text",
        {
          x: round(x - 2),
          y: round(top + 4),
          fill: palette.label,
          "font-size": MIN_FONT_SIZE_PX,
          "text-anchor": "start",
          transform: `rotate(90 ${round(x - 2)} ${round(top + 4)})`,
        },
        String(Math.round(unit.from(ms))),
      ),
    );
  }

  parts.push(
    text(unit.label, {
      x: round(left + width),
      y: round(top - 6),
      fill: palette.label,
      "font-size": MIN_FONT_SIZE_PX,
      "text-anchor": "end",
    }),
  );

  const profile = levels.map(
    (level) => [xOf(level.windSpeedMs), yOf(paToHPa(level.pressurePa))] as const,
  );
  parts.push(polyline(profile, { stroke: palette.wind, "stroke-width": 2 }));

  const half = WIND_ARROW_LENGTH_PX / 2;
  let lastY = Number.NEGATIVE_INFINITY;
  for (const level of levels) {
    if (level.windSpeedMs < 0.5) continue;
    const y = yOf(paToHPa(level.pressurePa));
    if (y < top + half || y > top + height - half) continue;
    if (Math.abs(y - lastY) < WIND_ARROW_MIN_GAP_PX) continue;
    lastY = y;
    parts.push(
      windArrow(
        left + width * 0.62,
        y,
        (level.windFromDeg + 180) % 360,
        WIND_ARROW_LENGTH_PX,
        palette.accent,
      ),
    );
  }

  parts.push(
    element("rect", {
      x: round(left),
      y: round(top),
      width: round(width),
      height: round(height),
      fill: "none",
      stroke: palette.axis,
      "stroke-width": 1,
    }),
  );

  return parts.join("");
}

/** Computes readable grid step increment (1, 2, 5, 10, 20, 50...). */
function niceStep(range: number): number {
  const rough = range / 6;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  for (const factor of [1, 2, 5]) {
    if (rough <= factor * magnitude) return factor * magnitude;
  }
  return 10 * magnitude;
}
