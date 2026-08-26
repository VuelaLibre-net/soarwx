/**
 * Diagrama oblicuo (skew-T log-P).
 *
 * Ejes: presión en escala logarítmica hacia arriba, temperatura inclinada. Se
 * dibujan las isotermas oblicuas, la familia de adiabáticas secas —que es lo
 * que permite leer de un vistazo si la capa está mezclada—, el perfil del
 * entorno, el punto de rocío y la parcela.
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

/** Anchura de la columna de viento, y su separación del diagrama. */
const WIND_PANEL_WIDTH_PX = 76;
const WIND_PANEL_GAP_PX = 10;

/**
 * Umbrales de viento que se sombrean en la columna, en m/s.
 *
 * El primero son 30 km/h, a partir de los cuales la deriva empieza a molestar.
 * El segundo es el corte de Allen (2006), que la propia librería usa para
 * anular `w*`: por encima, las térmicas dejan de ser explotables.
 */
export const WIND_SHADE_THRESHOLDS_MS = { brisk: 8.33, cutoff: 12.87 } as const;

/**
 * Separación vertical mínima entre flechas de rumbo, en píxeles.
 *
 * Repartirlas por índice de nivel las amontona: los niveles de altura sobre el
 * terreno están todos en los primeros 200 m, así que cinco de ellos caen en
 * unos pocos píxeles junto al suelo.
 */
const WIND_ARROW_MIN_GAP_PX = 34;

/** Longitud de la flecha de rumbo, en píxeles. */
const WIND_ARROW_LENGTH_PX = 22;

/** Holgura a cada lado del rango de temperatura observado, en grados. */
const TEMP_PADDING_C = 8;

/** Referencia de las alturas rotuladas junto a la presión. */
export type HeightReference = "agl" | "msl";

export interface SkewTOptions extends RenderOptions {
  /**
   * Rango de temperatura del eje. En kelvin, como todo lo demás: las etiquetas
   * se rotulan en grados Celsius, pero el contrato no cambia de unidades por
   * tratarse de presentación.
   */
  readonly minTempK?: Kelvin;
  readonly maxTempK?: Kelvin;
  readonly topHpa?: number;
  /** Parcela a dibujar. Si falta, no se dibuja. */
  readonly parcelFromK?: Kelvin;
  /** Base de nubes, en altura sobre el nivel del mar. */
  readonly lclMslM?: Metres;
  /**
   * Techo **utilizable**, no el tope de la parcela. Es el número que el piloto
   * lee en el resumen, y marcar otra cosa con la misma palabra confunde: la
   * parcela puede seguir flotando mil metros por encima de donde la térmica
   * ya no compensa la caída del planeador.
   */
  readonly ceilingMslM?: Metres;
  /**
   * Referencia de las alturas que acompañan a cada nivel de presión.
   *
   * Por defecto **sobre el terreno**, que es la referencia en la que se dan el
   * techo utilizable y la base de nubes: mezclar referencias en la misma
   * pantalla es cómo se acaba comparando dos números que no son comparables.
   */
  readonly heightReference?: HeightReference;
  /** Columna de viento a la derecha, con velocidad y rumbos. Activada por defecto. */
  readonly wind?: boolean;
  /** Unidad de los rótulos de viento. Interna sigue siendo m/s. */
  readonly windUnit?: WindUnit;
  /** Techo de la nube, para sombrear la capa desde la base. */
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
 * Skew-T log-P de un sondeo.
 *
 * @source Diagrama oblicuo estándar; Stull, Practical Meteorology, cap. 5.
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
  // Rango ajustado a lo que hay en el sondeo, en vez de fijo.
  //
  // No recupera tanto espacio como parece: el hueco del cuadrante inferior
  // izquierdo es **inherente al diagrama oblicuo**, porque las isotermas se
  // inclinan a la derecha con la altura y el punto de rocío en niveles altos
  // tira del extremo frío. Medido en Fuentemilanos, el sondeo abarca de −27 a
  // +38 °C: el rango ya estaba casi ajustado.
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

  /** Inclinación: cuánto se desplaza una isoterma de abajo arriba del gráfico. */
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

  // Isotermas oblicuas.
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

  // Adiabáticas secas: leerlas es lo que dice si la capa está mezclada.
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

  // Ejes.
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

    // Altura equivalente, tomada de la columna geopotencial **del propio
    // sondeo**, no de la atmósfera estándar: en un día caliente la diferencia
    // entre ambas llega a los cientos de metros, y la que le sirve al piloto
    // es la de ese día.
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

  // Bajo la columna, en dos líneas: arriba chocaba con la etiqueta del nivel
  // más alto, que cae justo en el borde del gráfico.
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

  // Capa de nube: banda sombreada de la base al techo, y el glifo en la base.
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
          `techo utilizable ${String(Math.round(options.ceilingMslM - elevationMslM))} m AGL`,
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
        { label: "temperatura", colour: palette.temperature },
        { label: "rocío", colour: palette.dewpoint },
        ...(options.parcelFromK === undefined
          ? []
          : [{ label: "parcela", colour: palette.parcel, dashed: true }]),
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
      title: options.title ?? "Sondeo oblicuo",
      desc:
        options.desc ??
        `Temperatura y punto de rocío frente a presión en ${sounding.site.name ?? "el emplazamiento"}.`,
      ...(options.className === undefined ? {} : { className: options.className }),
    },
    parts.join(""),
  );
}

/**
 * Altura geopotencial a una presión dada, interpolando la columna del sondeo.
 *
 * Devuelve `null` fuera del rango del sondeo: es preferible no rotular una
 * altura a rotular una extrapolada.
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

/** Presión aproximada a una altura, interpolando la columna del sondeo. */
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
 * Columna de viento: velocidad frente a la altura y rumbos por flechas.
 *
 * Comparte el eje vertical con el diagrama, que es lo que la hace útil: el
 * viento se lee a la misma altura que la temperatura y la base de nubes, sin
 * cambiar de gráfico ni de escala.
 *
 * @source Formato de flyXC Soundings; umbrales de sombreado en
 *         WIND_SHADE_THRESHOLDS_MS.
 */
function renderWindPanel(input: WindPanelInput): string {
  const { sounding, left, top, width, height, yOf, palette, unit } = input;
  const levels = sounding.levels;
  const maxObserved = Math.max(...levels.map((level) => level.windSpeedMs), 5);

  // La escala se elige **en la unidad que se rotula**, no en m/s: pasos de
  // 2.5 m/s convertidos a km/h dan 9, 18, 27… que no son cifras que nadie lea.
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

  // La unidad va **fuera** del cuadro, horizontal: dentro y rotada competía
  // con la rejilla y con la curva.
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

  // Flechas repartidas por distancia vertical, no por índice de nivel, y
  // contenidas dentro del cuadro: media flecha asomando por el borde superior
  // se lee como un error de dibujo.
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

/**
 * Paso de rejilla legible: 1, 2, 5, 10, 20, 50… según el rango.
 *
 * Se apunta a unas seis divisiones. Con cuatro, un rango de 60 km/h sale con
 * pasos de 20 y solo dos líneas interiores, que es demasiado poco para leer
 * una velocidad de un vistazo.
 */
function niceStep(range: number): number {
  const rough = range / 6;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  for (const factor of [1, 2, 5]) {
    if (rough <= factor * magnitude) return factor * magnitude;
  }
  return 10 * magnitude;
}
