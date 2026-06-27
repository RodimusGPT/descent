import { describe, expect, it } from 'vitest';
import {
  HIGHLIGHT,
  HIGHLIGHT_VALUE,
  MATRIX_SIZE,
  SAMPLE_MATRIX,
  ZOOM_LEVELS,
  highlightBits,
  makeSampleMatrix,
  matrixExtent,
  normalize,
} from '../src/lib/zoom';

describe('ZOOM_LEVELS', () => {
  it('has four levels ordered model → layer → matrix → weight', () => {
    expect(ZOOM_LEVELS.map((l) => l.id)).toEqual(['model', 'layer', 'matrix', 'weight']);
  });

  it('gives every level a label and an explanatory note', () => {
    for (const level of ZOOM_LEVELS) {
      expect(level.label.length).toBeGreaterThan(0);
      expect(level.note.length).toBeGreaterThan(0);
    }
  });
});

describe('SAMPLE_MATRIX', () => {
  it('is rectangular with consistent row lengths', () => {
    expect(SAMPLE_MATRIX).toHaveLength(MATRIX_SIZE);
    for (const row of SAMPLE_MATRIX) {
      expect(row).toHaveLength(MATRIX_SIZE);
    }
  });

  it('contains finite numbers', () => {
    for (const row of SAMPLE_MATRIX) {
      for (const v of row) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe('HIGHLIGHT', () => {
  it('is within the matrix bounds', () => {
    expect(HIGHLIGHT.row).toBeGreaterThanOrEqual(0);
    expect(HIGHLIGHT.row).toBeLessThan(SAMPLE_MATRIX.length);
    expect(HIGHLIGHT.col).toBeGreaterThanOrEqual(0);
    expect(HIGHLIGHT.col).toBeLessThan(SAMPLE_MATRIX[0].length);
  });

  it('exposes the highlighted value matching matrix[row][col]', () => {
    expect(HIGHLIGHT_VALUE).toBe(SAMPLE_MATRIX[HIGHLIGHT.row][HIGHLIGHT.col]);
  });
});

describe('makeSampleMatrix determinism', () => {
  it('same seed → identical matrix', () => {
    expect(makeSampleMatrix(8, 8, 42)).toEqual(makeSampleMatrix(8, 8, 42));
  });

  it('different seeds → different matrices', () => {
    expect(makeSampleMatrix(8, 8, 1)).not.toEqual(makeSampleMatrix(8, 8, 2));
  });

  it('honors requested dimensions', () => {
    const m = makeSampleMatrix(3, 5, 7);
    expect(m).toHaveLength(3);
    for (const row of m) expect(row).toHaveLength(5);
  });
});

describe('highlightBits', () => {
  it('decodes the highlighted weight into sign/exponent/mantissa for FP16', () => {
    const { bits, sign, exponent, mantissa } = highlightBits();
    expect(bits).toHaveLength(16);
    expect(sign).toHaveLength(1);
    expect(exponent).toHaveLength(5);
    expect(mantissa).toHaveLength(10);
    expect([...sign, ...exponent, ...mantissa]).toEqual(bits);
  });

  it('encodes a negative value with a set sign bit', () => {
    expect(highlightBits(-0.05).sign[0]).toBe(1);
    expect(highlightBits(0.05).sign[0]).toBe(0);
  });
});

describe('matrixExtent / normalize', () => {
  it('brackets every value within [min, max]', () => {
    const { min, max } = matrixExtent();
    for (const row of SAMPLE_MATRIX) {
      for (const v of row) {
        expect(v).toBeGreaterThanOrEqual(min);
        expect(v).toBeLessThanOrEqual(max);
      }
    }
  });

  it('normalizes endpoints to 0 and 1', () => {
    expect(normalize(2, 2, 6)).toBe(0);
    expect(normalize(6, 2, 6)).toBe(1);
    expect(normalize(4, 2, 6)).toBeCloseTo(0.5);
  });

  it('returns 0.5 for a degenerate range', () => {
    expect(normalize(3, 3, 3)).toBe(0.5);
  });
});
