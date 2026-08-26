/**
 * SVG rendering primitives.
 *
 * Lightweight, zero-dependency string builders generating responsive, accessible SVG elements.
 */

export type Attrs = Readonly<Record<string, string | number | undefined>>;

/** Escapes XML special characters in string values. */
export function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Rounds numerical values to minimize floating point noise in SVG output. */
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

/** Constructs an XML element string with escaped attributes. */
export function element(tag: string, attrs: Attrs, children = ""): string {
  return children === ""
    ? `<${tag}${attrsToString(attrs)}/>`
    : `<${tag}${attrsToString(attrs)}>${children}</${tag}>`;
}

/** Constructs an SVG `<text>` element with escaped text content. */
export function text(content: string, attrs: Attrs): string {
  return element("text", attrs, escapeText(content));
}

/** Constructs an SVG `<polyline>` element from projected 2D coordinate pairs. */
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

/** Constructs an SVG `<polygon>` element from projected 2D coordinate pairs. */
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
 * Single-line chart legend.
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
  /** Internal viewBox coordinate width in pixels. */
  readonly widthPx: number;
  readonly heightPx: number;
  readonly title: string;
  readonly desc: string;
  readonly className?: string;
}

/**
 * Wraps SVG markup in responsive and accessible root document container.
 *
 * Utilizes `viewBox` without fixed pixel dimensions to enable fluid responsive scaling.
 * Links `<title>` and `<desc>` metadata via `aria-labelledby`.
 *
 * @source Requirements R-14.4 and R-14.5 from docs/REQUIREMENTS.md.
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
