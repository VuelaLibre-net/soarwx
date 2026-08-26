/**
 * Palette configuration.
 *
 * Default colors resolve to CSS custom properties with hex fallbacks,
 * ensuring automatic light and dark theme adaptation.
 */

export type PaletteKey =
  | "axis"
  | "grid"
  | "label"
  | "temperature"
  | "dewpoint"
  | "parcel"
  | "climb"
  | "core"
  | "ceiling"
  | "cloud"
  | "wind"
  | "window"
  | "accent";

export type Palette = Readonly<Record<PaletteKey, string>>;

/**
 * Default color palette utilizing theme-aware CSS custom properties with fallbacks.
 */
export const DEFAULT_PALETTE: Palette = {
  axis: "var(--border, #8a8a8a)",
  grid: "var(--border, #d4d4d4)",
  label: "var(--muted-foreground, #5a5a5a)",
  temperature: "var(--chart-1, #d64545)",
  dewpoint: "var(--chart-2, #2f7d4f)",
  parcel: "var(--chart-3, #7a5cd6)",
  climb: "var(--chart-1, #d64545)",
  core: "var(--chart-4, #d68a2f)",
  ceiling: "var(--chart-2, #2f7d4f)",
  cloud: "var(--chart-5, #3f7fd6)",
  wind: "var(--chart-4, #7a3f8a)",
  window: "var(--chart-2, #2f7d4f)",
  accent: "var(--foreground, #1a1a1a)",
};

/** Minimum font size in pixels to ensure legibility across viewports. */
export const MIN_FONT_SIZE_PX = 10;

export interface RenderOptions {
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly palette?: Partial<Palette>;
  readonly title?: string;
  readonly desc?: string;
  readonly className?: string;
}

/** Merges user-defined palette overrides onto the default color palette. */
export function resolvePalette(overrides?: Partial<Palette>): Palette {
  return overrides === undefined ? DEFAULT_PALETTE : { ...DEFAULT_PALETTE, ...overrides };
}
