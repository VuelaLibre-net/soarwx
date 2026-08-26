/**
 * Primitivas mínimas de SVG.
 *
 * Cadenas, sin framework y sin dependencias: el consumidor decide si las
 * inserta en Astro, en React o en un fichero. `vuelalibre.net` no usa ninguna
 * librería de gráficos —su mapa de España son 414 líneas de SVG inline con cero
 * JavaScript— y esto encaja con eso.
 */

export type Attrs = Readonly<Record<string, string | number | undefined>>;

/** Escapa texto para que no pueda romper el documento. */
export function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Redondea para no arrastrar ruido de coma flotante en el documento. */
export function round(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "0";
  const factor = Math.pow(10, decimals);
  return String(Math.round(value * factor) / factor);
}

function attrsToString(attrs: Attrs): string {
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ` ${key}="${escapeText(String(value))}"`)
    .join("");
}

/** Elemento SVG con sus atributos escapados. Devuelve cadena, no nodo. */
export function element(tag: string, attrs: Attrs, children = ""): string {
  return children === ""
    ? `<${tag}${attrsToString(attrs)}/>`
    : `<${tag}${attrsToString(attrs)}>${children}</${tag}>`;
}

/** Elemento `<text>` con el contenido escapado. */
export function text(content: string, attrs: Attrs): string {
  return element("text", attrs, escapeText(content));
}

/** Polilínea a partir de puntos ya proyectados a coordenadas del lienzo. */
export function polyline(
  points: readonly (readonly [number, number])[],
  attrs: Attrs,
): string {
  return element("polyline", {
    ...attrs,
    fill: attrs["fill"] ?? "none",
    points: points.map(([x, y]) => `${round(x)},${round(y)}`).join(" "),
  });
}

/**
 * Polígono cerrado a partir de puntos ya proyectados. Para las superficies
 * rellenas de un gráfico de áreas, donde una polilínea dejaría el contorno
 * abierto y el relleno se cerraría por donde le pareciera al motor de dibujo.
 */
export function polygon(
  points: readonly (readonly [number, number])[],
  attrs: Attrs,
): string {
  return element("polygon", {
    ...attrs,
    points: points.map(([x, y]) => `${round(x)},${round(y)}`).join(" "),
  });
}

export interface LegendEntry {
  readonly label: string;
  readonly colour: string;
  readonly dashed?: boolean;
}

/**
 * Leyenda en una fila.
 *
 * Sin ella, tres curvas del mismo gráfico son tres curvas de colores: el pie de
 * figura puede describirlas, pero no dice cuál es cuál.
 */
export function legend(
  entries: readonly LegendEntry[],
  x: number,
  y: number,
  fontSizePx: number,
  labelColour: string,
): string {
  let cursor = x;
  const parts: string[] = [];
  for (const entry of entries) {
    parts.push(
      element("line", {
        x1: round(cursor),
        y1: round(y),
        x2: round(cursor + 14),
        y2: round(y),
        stroke: entry.colour,
        "stroke-width": 2,
        ...(entry.dashed === true ? { "stroke-dasharray": "3 3" } : {}),
      }),
      text(entry.label, {
        x: round(cursor + 18),
        y: round(y + fontSizePx / 3),
        fill: labelColour,
        "font-size": fontSizePx,
      }),
    );
    cursor += 18 + entry.label.length * fontSizePx * 0.56 + 14;
  }
  return parts.join("");
}

export interface DocumentOptions {
  /** Ancho del lienzo interno. El SVG es responsive: no lleva ancho en píxeles. */
  readonly widthPx: number;
  readonly heightPx: number;
  readonly title: string;
  readonly desc: string;
  readonly className?: string;
}

/**
 * Documento SVG responsive y accesible.
 *
 * Lleva `viewBox` y **no** lleva `width` ni `height` en píxeles, así que escala
 * con su contenedor. `<title>` y `<desc>` van siempre y se referencian desde
 * `aria-labelledby`.
 *
 * @source R-14.4 y R-14.5 de docs/REQUIREMENTS.md.
 */
export function document(options: DocumentOptions, body: string): string {
  const titleId = "t";
  const descId = "d";
  return element(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: `0 0 ${round(options.widthPx)} ${round(options.heightPx)}`,
      role: "img",
      "aria-labelledby": `${titleId} ${descId}`,
      preserveAspectRatio: "xMidYMid meet",
      class: options.className,
    },
    element("title", { id: titleId }, escapeText(options.title)) +
      element("desc", { id: descId }, escapeText(options.desc)) +
      body,
  );
}
