import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COLOR,
  PALETTE,
  clamp01,
  hexToRgb,
  lerpColor,
  partAccent,
  rgbToHex,
  weightToColor,
  withAlpha,
} from '../src/lib/encoding';

describe('clamp01', () => {
  it('clamps to the unit interval', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.42)).toBe(0.42);
    expect(clamp01(1)).toBe(1);
    expect(clamp01(2)).toBe(1);
  });
  it('treats NaN as 0', () => {
    expect(clamp01(Number.NaN)).toBe(0);
  });
});

describe('hex <-> rgb round trip', () => {
  it('parses 6-digit hex', () => {
    expect(hexToRgb('#ff8800')).toEqual([255, 136, 0]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]);
  });
  it('expands 3-digit shorthand', () => {
    expect(hexToRgb('#f80')).toEqual([255, 136, 0]);
  });
  it('serializes back losslessly', () => {
    for (const hex of Object.values(PALETTE)) {
      const [r, g, b] = hexToRgb(hex);
      expect(rgbToHex(r, g, b)).toBe(hex);
    }
  });
});

describe('lerpColor', () => {
  it('returns the endpoints at t=0 and t=1', () => {
    expect(lerpColor('#000000', '#ffffff', 0)).toBe('#000000');
    expect(lerpColor('#000000', '#ffffff', 1)).toBe('#ffffff');
  });
  it('returns the midpoint at t=0.5', () => {
    expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
  it('clamps t out of range', () => {
    expect(lerpColor('#000000', '#ffffff', -5)).toBe('#000000');
    expect(lerpColor('#000000', '#ffffff', 5)).toBe('#ffffff');
  });
});

describe('withAlpha', () => {
  it('appends a two-digit alpha channel', () => {
    expect(withAlpha('#112233', 1)).toBe('#112233ff');
    expect(withAlpha('#112233', 0)).toBe('#11223300');
    expect(withAlpha('#112233', 0.5)).toBe('#11223380');
  });
});

describe('weightToColor', () => {
  it('maps 0 to inert and 1 to the hottest color', () => {
    expect(weightToColor(0)).toBe(PALETTE.inert);
    expect(weightToColor(1)).toBe(PALETTE.activeHot);
  });
  it('passes through amber at the midpoint', () => {
    expect(weightToColor(0.5)).toBe(PALETTE.active);
  });
  it('clamps out-of-range weights', () => {
    expect(weightToColor(-3)).toBe(PALETTE.inert);
    expect(weightToColor(3)).toBe(PALETTE.activeHot);
  });
  it('warms monotonically (red channel never decreases as weight rises)', () => {
    let prevR = -1;
    for (let w = 0; w <= 1.0001; w += 0.1) {
      const [r] = hexToRgb(weightToColor(w));
      expect(r).toBeGreaterThanOrEqual(prevR);
      prevR = r;
    }
  });
});

describe('partAccent', () => {
  it('maps kinds to the documented accents', () => {
    expect(partAccent('model')).toBe(PALETTE.modelAccent);
    expect(partAccent('hardware')).toBe(PALETTE.hwAccent);
    expect(partAccent('neutral')).toBe(PALETTE.active);
  });
});

describe('COLOR semantic names resolve to palette values', () => {
  it('exposes the expected encoding colors', () => {
    expect(COLOR.active).toBe(PALETTE.active);
    expect(COLOR.inert).toBe(PALETTE.inert);
    expect(COLOR.modelAccent).toBe(PALETTE.modelAccent);
    expect(COLOR.hwAccent).toBe(PALETTE.hwAccent);
  });
});

describe('I3 — encoding.ts mirrors tokens.css exactly', () => {
  // Maps PALETTE keys to their CSS custom property names.
  const MIRROR: Record<keyof typeof PALETTE, string> = {
    bg: '--color-bg',
    surface: '--color-surface',
    surfaceRaised: '--color-surface-raised',
    border: '--color-border',
    ink: '--color-ink',
    muted: '--color-muted',
    faint: '--color-faint',
    active: '--color-active',
    activeHot: '--color-active-hot',
    inert: '--color-inert',
    modelAccent: '--color-model-accent',
    hwAccent: '--color-hw-accent',
  };

  const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

  function readVar(name: string): string | null {
    const m = css.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`));
    return m ? m[1].toLowerCase() : null;
  }

  it('every palette color has a matching token in tokens.css', () => {
    for (const [key, cssVar] of Object.entries(MIRROR)) {
      const cssValue = readVar(cssVar);
      const tsValue = PALETTE[key as keyof typeof PALETTE].toLowerCase();
      expect(cssValue, `tokens.css missing ${cssVar}`).not.toBeNull();
      expect(cssValue, `${cssVar} should equal PALETTE.${key}`).toBe(tsValue);
    }
  });
});
