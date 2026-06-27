/**
 * zoom.ts — data backing the ZoomToWeight interactive (spec 10.2).
 *
 * The opening "it is all just numbers" visual. A model is, concretely, billions
 * of numbers arranged in matrices; running it is mostly matrix multiplication.
 * This module supplies the four zoom levels (model → layer → matrix → weight)
 * and a small, deterministic SAMPLE_MATRIX of plausible weight values so the
 * reader can drill all the way down to a single float and see its bit pattern.
 *
 * Everything here is ILLUSTRATIVE and deterministic (a seeded PRNG, NO
 * Math.random) so the same seed always yields the same matrix.
 */

import { FORMATS, type FloatFormat, classifyBits, valueToBits } from '@/lib/float';

/** One step of the zoom, ordered from the whole model down to one weight. */
export interface ZoomLevel {
  id: 'model' | 'layer' | 'matrix' | 'weight';
  label: string;
  /** A short explanatory note shown alongside the level. */
  note: string;
}

/** The four zoom levels, ordered outermost → innermost. */
export const ZOOM_LEVELS: readonly ZoomLevel[] = [
  {
    id: 'model',
    label: 'Model',
    note: 'A model is a tall stack of layers — billions of numbers in total, nothing more.',
  },
  {
    id: 'layer',
    label: 'Layer',
    note: 'Each layer is a handful of weight matrices: the Q, K, V projections and the feed-forward block.',
  },
  {
    id: 'matrix',
    label: 'Matrix',
    note: 'A matrix is a grid of numbers. Running the model is mostly multiplying these grids together.',
  },
  {
    id: 'weight',
    label: 'Weight',
    note: 'Zoom all the way in and you reach a single weight: one floating-point number, stored as bits.',
  },
] as const;

/**
 * mulberry32 — a tiny, deterministic 32-bit PRNG. Same seed always yields the
 * same sequence, so SAMPLE_MATRIX is reproducible across runs (NO Math.random).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically build an `rows × cols` matrix of plausible weight values
 * drawn ~N(0, sd) via a Box–Muller transform on the seeded PRNG. Same
 * `(rows, cols, seed, sd)` always produces an identical matrix.
 */
export function makeSampleMatrix(rows = 8, cols = 8, seed = 0x5eed_1234, sd = 0.05): number[][] {
  const rand = mulberry32(seed);
  const out: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: number[] = new Array(cols);
    for (let c = 0; c < cols; c++) {
      const u1 = Math.max(rand(), 1e-12);
      const u2 = rand();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      row[c] = z * sd;
    }
    out.push(row);
  }
  return out;
}

/** Side length of the sample matrix. */
export const MATRIX_SIZE = 8;

/** A deterministic 8×8 matrix of plausible weight values (~N(0, 0.05)). */
export const SAMPLE_MATRIX: number[][] = makeSampleMatrix(MATRIX_SIZE, MATRIX_SIZE);

/** The single cell we zoom down to at the deepest level. */
export const HIGHLIGHT: { row: number; col: number } = { row: 3, col: 5 };

/** Value of the highlighted weight: `SAMPLE_MATRIX[HIGHLIGHT.row][HIGHLIGHT.col]`. */
export const HIGHLIGHT_VALUE: number = SAMPLE_MATRIX[HIGHLIGHT.row][HIGHLIGHT.col];

/** The weight matrices that live inside a single transformer layer. */
export const LAYER_MATRICES: readonly { key: string; label: string }[] = [
  { key: 'Q', label: 'Q' },
  { key: 'K', label: 'K' },
  { key: 'V', label: 'V' },
  { key: 'FFN', label: 'FFN' },
] as const;

/** Number of layer blocks to draw in the stack at the "model" level. */
export const LAYER_COUNT = 12;

/**
 * Decode the highlighted weight's bit pattern in the given format (FP16 by
 * default). Returns the sign / exponent / mantissa bit groups plus the value
 * class, ready to render at the deepest zoom level.
 */
export function highlightBits(
  value: number = HIGHLIGHT_VALUE,
  format: FloatFormat = FORMATS.fp16,
): {
  bits: number[];
  sign: number[];
  exponent: number[];
  mantissa: number[];
  valueClass: ReturnType<typeof classifyBits>;
} {
  const bits = valueToBits(value, format);
  const { sign, exponent, mantissa } = format.fields;
  return {
    bits,
    sign: bits.slice(sign.start, sign.end + 1),
    exponent: bits.slice(exponent.start, exponent.end + 1),
    mantissa: bits.slice(mantissa.start, mantissa.end + 1),
    valueClass: classifyBits(bits, format),
  };
}

/** Min / max over the sample matrix, for normalizing values into [0, 1] colors. */
export function matrixExtent(matrix: number[][] = SAMPLE_MATRIX): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const row of matrix) {
    for (const v of row) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return { min, max };
}

/** Normalize a value to [0, 1] across `[min, max]` (0.5 when the range is degenerate). */
export function normalize(value: number, min: number, max: number): number {
  const range = max - min;
  if (range === 0) return 0.5;
  const t = (value - min) / range;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
