/**
 * Diagram glyph primitives.
 *
 * Lightweight vector shapes in local coordinate spaces.
 */

import { element, round } from "./svg.js";

/**
 * Cumulus cloud glyph drawn centered at (x, y) with specified width.
 *
 * Visual marker for cloud base directly on the sounding diagram.
 */
export function cumulusGlyph(
  x: number,
  y: number,
  widthPx: number,
  colour: string,
): string {
  const w = widthPx;
  const h = w * 0.55;
  const left = x - w / 2;
  const bottom = y + h / 2;
  const path = [
    `M ${round(left)} ${round(bottom)}`,
    `a ${round(h * 0.42)} ${round(h * 0.42)} 0 0 1 ${round(h * 0.1)} ${round(-h * 0.62)}`,
    `a ${round(h * 0.5)} ${round(h * 0.5)} 0 0 1 ${round(w * 0.34)} ${round(-h * 0.24)}`,
    `a ${round(h * 0.45)} ${round(h * 0.45)} 0 0 1 ${round(w * 0.42)} ${round(h * 0.3)}`,
    `a ${round(h * 0.4)} ${round(h * 0.4)} 0 0 1 ${round(w * 0.06)} ${round(h * 0.56)}`,
    "Z",
  ].join(" ");
  return element("path", {
    d: path,
    fill: "none",
    stroke: colour,
    "stroke-width": 1.5,
    "stroke-linejoin": "round",
  });
}

/**
 * Wind arrow pointing in flow direction (downwind vector).
 *
 * Follows aviation navigation chart conventions: arrow indicates direction of drift.
 */
export function windArrow(
  x: number,
  y: number,
  towardDeg: number,
  lengthPx: number,
  colour: string,
): string {
  const rad = (towardDeg * Math.PI) / 180;
  // Screen coords: x grows eastward, y grows southward.
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const tipX = x + (dx * lengthPx) / 2;
  const tipY = y + (dy * lengthPx) / 2;
  const tailX = x - (dx * lengthPx) / 2;
  const tailY = y - (dy * lengthPx) / 2;

  const head = lengthPx * 0.32;
  const spread = (25 * Math.PI) / 180;
  const barb = (sign: number): string => {
    const angle = rad + Math.PI + sign * spread;
    return `${round(tipX + Math.sin(angle) * head)} ${round(tipY - Math.cos(angle) * head)}`;
  };

  return element("path", {
    d: `M ${round(tailX)} ${round(tailY)} L ${round(tipX)} ${round(tipY)} M ${barb(1)} L ${round(tipX)} ${round(tipY)} L ${barb(-1)}`,
    fill: "none",
    stroke: colour,
    "stroke-width": 1.2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  });
}
