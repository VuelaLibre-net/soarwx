/**
 * Timeline diaria: la capa convectiva a lo largo del día.
 *
 * Es un gráfico de áreas, no de barras. Una barra por hora dice a qué altura
 * llega cada hora por separado; lo que un piloto necesita ver es la **forma**
 * del día —cuándo arranca, dónde está la meseta, con qué pendiente muere—, y
 * eso lo dibuja una envolvente continua. Es también como lo publican RASP y
 * Skysight, que es con lo que se va a contrastar.
 *
 * Tres superficies apiladas, de abajo arriba:
 *
 * 1. El techo utilizable, relleno sólido: la banda en la que el planeador
 *    sube de verdad.
 * 2. De ahí al tope de térmica, relleno tenue: ahí todavía sube aire, pero ya
 *    no compensa la caída en espiral. Verlas separadas es lo que evita leer un
 *    número como si fuera el otro.
 * 3. La base de los cumulus, con su línea, cuando el día no es azul.
 *
 * Encima, una tira de flechas con el viento en el tope de la térmica, que es
 * el que decide la deriva mientras se sube. Debajo, el índice hora a hora, que
 * es la información que llevaban las barras y que si no se perdería.
 */

import type { SoaringDay, SoaringHour } from "../report/types.js";
import { MIN_FONT_SIZE_PX, resolvePalette } from "./theme.js";
import type { RenderOptions } from "./theme.js";
import { windArrow } from "./glyphs.js";
import { document, element, legend, polyline, round, text } from "./svg.js";

const MARGIN = { top: 46, right: 12, bottom: 42, left: 46 } as const;

/** Alto de la tira de flechas, sobre el área de dibujo. */
const WIND_STRIP_PX = 18;

/** Alto de la tira del índice, bajo el área de dibujo. */
const LEVEL_STRIP_PX = 8;

/** Opacidad del fondo de una ventana volable. Por debajo de esto no se ve. */
export const WINDOW_FILL_OPACITY = 0.22;

/** Opacidad de la banda del índice: a más nivel, más sólida. */
export const LEVEL_OPACITY: Readonly<Record<1 | 2 | 3 | 4 | 5, number>> = {
  1: 0.15,
  2: 0.3,
  3: 0.5,
  4: 0.75,
  5: 1,
};

/** Relleno de la banda utilizable. Sólido, es la que se lee primero. */
const USABLE_FILL_OPACITY = 0.45;

/** Relleno de la banda que sube pero no compensa. Tenue a propósito. */
const RESIDUAL_FILL_OPACITY = 0.16;

type Point = readonly [number, number];

/**
 * Curva cúbica monotónica que pasa por todos los puntos sin rebasar máximos ni
 * mínimos locales. Así una hora con poco techo no inventa altura al suavizar.
 */
function smoothCurveCommands(points: readonly Point[]): string {
  if (points.length < 2) return "";

  const slopes = points.slice(0, -1).map(([x, y], index) => {
    const [nextX, nextY] = points[index + 1]!;
    return (nextY - y) / (nextX - x);
  });
  const tangents = slopes.map((slope, index) => {
    if (index === 0 || index === slopes.length - 1) return slope;

    const previous = slopes[index - 1]!;
    if (previous * slope <= 0) return 0;

    const previousWidth = points[index]![0] - points[index - 1]![0];
    const nextWidth = points[index + 1]![0] - points[index]![0];
    const previousWeight = 2 * nextWidth + previousWidth;
    const nextWeight = nextWidth + 2 * previousWidth;
    return (
      (previousWeight + nextWeight) / (previousWeight / previous + nextWeight / slope)
    );
  });

  return points
    .slice(0, -1)
    .map(([x, y], index) => {
      const [nextX, nextY] = points[index + 1]!;
      const width = nextX - x;
      return `C ${round(x + width / 3)} ${round(y + ((tangents[index] ?? 0) * width) / 3)} ${round(nextX - width / 3)} ${round(nextY - ((tangents[index + 1] ?? 0) * width) / 3)} ${round(nextX)} ${round(nextY)}`;
    })
    .join(" ");
}

function smoothLine(
  points: readonly Point[],
  attrs: Readonly<Record<string, string | number>>,
): string {
  if (points.length === 0) return "";
  const [x, y] = points[0]!;
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
  if (upper.length === 0 || lower.length === 0) return "";
  const [startX, startY] = upper[0]!;
  const reversedLower = [...lower].reverse();
  const [endX, endY] = reversedLower[0]!;
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
  const [startX, startY] = points[0]!;
  const [endX] = points[points.length - 1]!;
  return element("path", {
    ...attrs,
    d: `M ${round(startX)} ${round(startY)} ${smoothCurveCommands(points)} L ${round(endX)} ${round(baseline)} L ${round(startX)} ${round(baseline)} Z`,
  });
}

export interface TimelineOptions extends RenderOptions {
  /** Solo se dibujan las horas dentro de esta franja local. */
  readonly fromLocalHours?: number;
  readonly toLocalHours?: number;
  /**
   * Tira de flechas con el viento en el tope de la térmica. Activada por
   * defecto: sin ella el gráfico dice a qué altura se sube y calla hacia dónde
   * lleva la subida.
   */
  readonly wind?: boolean;
}

/** Base de cumulus solo cuando la hay: en día azul no se dibuja nada. */
function cumulusBaseOf(hour: SoaringHour): number | null {
  return hour.cloud.blue ? null : hour.cloud.baseAglM;
}

/**
 * Evolución de la capa convectiva a lo largo del día.
 *
 * @source R-14.2 de docs/REQUIREMENTS.md.
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

  // La escala la manda el tope de térmica y no el techo: si la mandara el
  // techo, la banda residual saldría siempre recortada por arriba.
  const maxHeight = Math.max(
    3000,
    ...hours.map((hour) => hour.thermal.thermalTopAglM),
    ...hours.map((hour) => cumulusBaseOf(hour) ?? 0),
  );

  const slot = hours.length > 0 ? plotWidth / hours.length : plotWidth;
  /** Centro de la hora: la medida es del instante, no del intervalo. */
  const xOf = (index: number): number => MARGIN.left + (index + 0.5) * slot;
  const yOf = (aglM: number): number => plotBottom - (aglM / maxHeight) * plotHeight;

  const parts: string[] = [];

  // Rejilla de alturas.
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

  // Ventanas volables, de fondo.
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
      // Un borde superior: el relleno solo, sobre fondo oscuro, no se ve.
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

    // Un cero no es un techo al nivel del suelo: significa que no existe una
    // capa utilizable. Se parte en tramos para que línea y relleno no caigan al
    // eje entre horas sin vuelo.
    const ceilingRuns: Point[][] = [];
    let ceilingRun: Point[] = [];
    hours.forEach((hour, index) => {
      if (hour.ceiling.aglM > 0) ceilingRun.push(ceilingPoints[index]!);
      else if (ceilingRun.length > 0) {
        ceilingRuns.push(ceilingRun);
        ceilingRun = [];
      }
    });
    if (ceilingRun.length > 0) ceilingRuns.push(ceilingRun);

    // Banda residual primero, para que la utilizable se dibuje encima y su
    // borde común quede nítido. Si el techo es cero, esta franja conserva el
    // tope térmico hasta el eje: aún puede haber ascendencia, pero no vuelo.
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

      if (run.length === 1) {
        const [x, y] = run[0]!;
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

    // Base de cumulus: solo el tramo con nube, y partido si el día alterna.
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

  // Tira de viento en el tope de la térmica.
  if (showWind && hours.length > 0) {
    const y = MARGIN.top + WIND_STRIP_PX / 2;
    parts.push(
      // Solo «viento»: el margen izquierdo son 46 px y «viento en tope» se
      // salía del lienzo por la izquierda. De qué viento se trata lo dice el
      // pie de figura, que es donde hay sitio para decirlo entero.
      text("viento", {
        x: MARGIN.left - 6,
        y: y + 3,
        fill: palette.label,
        "font-size": MIN_FONT_SIZE_PX,
        "text-anchor": "end",
      }),
    );
    hours.forEach((hour, index) => {
      // Sin térmica no hay tope, y una flecha ahí apuntaría a un viento que no
      // sopla en ninguna altura que se vaya a volar.
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

  // Índice hora a hora, bajo el eje: es lo que decían las barras.
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

  // Mejor momento.
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
    // En dos filas: las cinco entradas en una sola se salen por la derecha del
    // lienzo de 640, y una leyenda cortada es peor que no tenerla.
    legend(
      [
        { label: "techo utilizable (m AGL)", colour: palette.ceiling },
        { label: "tope de térmica", colour: palette.core },
        ...(hasCumulus
          ? [{ label: "base de cumulus", colour: palette.cloud, dashed: true }]
          : []),
      ],
      MARGIN.left,
      12,
      MIN_FONT_SIZE_PX,
      palette.label,
    ),
    legend(
      [
        { label: "ventana volable", colour: palette.window },
        { label: "mejor momento", colour: palette.accent, dashed: true },
        { label: "índice de la hora", colour: palette.accent },
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
      title: options.title ?? "Evolución del día",
      desc:
        options.desc ??
        `Capa convectiva por horas en ${day.site.name ?? "el emplazamiento"} el ${day.dateLocal}. Techo utilizable máximo ${round(maxCeiling, 0)} m sobre el terreno, tope de térmica máximo ${round(maxHeight, 0)} m.`,
      ...(options.className === undefined ? {} : { className: options.className }),
    },
    parts.join(""),
  );
}
