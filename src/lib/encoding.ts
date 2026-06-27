/**
 * encoding.ts — the single source of truth for meaning → color (Invariant I3).
 *
 * Every color used anywhere in the site originates here or in its CSS mirror
 * (src/styles/tokens.css). No other file may contain a raw hex literal; the
 * `encoding-guard` check enforces this. The two files MUST stay in sync — the
 * values below are asserted against the CSS in test/encoding.test.ts.
 *
 * Encoding grammar (consistent site-wide):
 *   active / high-attention / energy → warm  (amber → coral)
 *   inert  / low / dormant           → cool  (slate)
 *   "model" sections                 → purple accent
 *   "hardware" sections              → teal accent
 */

/** Canonical palette. Mirrors the `--color-*` custom properties in tokens.css. */
export const PALETTE = {
  bg: '#0a0e1a',
  surface: '#111726',
  surfaceRaised: '#1a2236',
  border: '#26304a',
  ink: '#e6ecf5',
  muted: '#9aa7bd',
  faint: '#8c97ac',
  /** warm — most energetic state */
  active: '#f5a524',
  activeHot: '#fb6f5a',
  /** cool — dormant state */
  inert: '#4a5874',
  /** section accents */
  modelAccent: '#a978f0',
  hwAccent: '#2dd4bf',
} as const;

/** Semantic encoding colors, the names components should reach for. */
export const COLOR = {
  active: PALETTE.active,
  activeHot: PALETTE.activeHot,
  inert: PALETTE.inert,
  modelAccent: PALETTE.modelAccent,
  hwAccent: PALETTE.hwAccent,
  ink: PALETTE.ink,
  muted: PALETTE.muted,
  faint: PALETTE.faint,
  border: PALETTE.border,
  bg: PALETTE.bg,
  surface: PALETTE.surface,
  surfaceRaised: PALETTE.surfaceRaised,
} as const;

/**
 * Non-semantic CATEGORICAL identity colors — for distinguishing arbitrary items
 * (embedding clusters, batch sequences) WITHOUT borrowing the meaningful hues.
 * Deliberately avoids inert slate (= "off/idle") and the part accents purple/teal,
 * so the warm/cool grammar and model/hardware accents keep their meaning.
 */
export const CATEGORICAL: readonly string[] = [
  PALETTE.active, // amber
  '#5b9bd5', // blue
  '#e07ab0', // pink
  '#5fb98e', // green
  PALETTE.activeHot, // coral
];

/** Each part of the descent is tinted model / hardware / neutral. */
export type PartKind = 'model' | 'hardware' | 'neutral';

/** Accent color for a part, by kind. */
export function partAccent(kind: PartKind): string {
  switch (kind) {
    case 'model':
      return PALETTE.modelAccent;
    case 'hardware':
      return PALETTE.hwAccent;
    default:
      return PALETTE.active;
  }
}

/** Typographic scale (rem), referenced by TS-driven SVG/layout sizing. */
export const TYPE = {
  xs: 0.75,
  sm: 0.875,
  base: 1,
  lg: 1.125,
  xl: 1.25,
  '2xl': 1.5,
  '3xl': 1.875,
  '4xl': 2.5,
} as const;

/** Clamp a number to the unit interval [0, 1]. */
export function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/** Parse a `#rgb` or `#rrggbb` hex string into an [r, g, b] triple (0–255). */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  const n = Number.parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Serialize an [r, g, b] triple back to a `#rrggbb` string. */
export function rgbToHex(r: number, g: number, b: number): string {
  const to2 = (v: number) =>
    Math.round(clamp01(v / 255) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/** Append an alpha channel to a `#rrggbb` color, producing `#rrggbbaa`. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  const a = Math.round(clamp01(alpha) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${rgbToHex(r, g, b)}${a}`;
}

/** Linearly interpolate between two hex colors. `t` is clamped to [0, 1]. */
export function lerpColor(a: string, b: string, t: number): string {
  const tt = clamp01(t);
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * tt, ag + (bg - ag) * tt, ab + (bb - ab) * tt);
}

/**
 * Map an attention/energy weight in [0, 1] to a color along the encoding ramp:
 * inert slate (0) → amber (0.5) → hot coral (1). The two-segment ramp keeps the
 * warm half visually distinct from the cool half, so "high" reads unmistakably hot.
 */
export function weightToColor(weight: number): string {
  const t = clamp01(weight);
  if (t <= 0.5) {
    return lerpColor(PALETTE.inert, PALETTE.active, t / 0.5);
  }
  return lerpColor(PALETTE.active, PALETTE.activeHot, (t - 0.5) / 0.5);
}
