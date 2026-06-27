/**
 * quant.ts — illustrative model-weight quantization model (spec 9.3).
 *
 * Pure, deterministic helpers backing the QuantizationSlider interactive. Every
 * number here is an ILLUSTRATIVE teaching device, not a benchmark: we model
 * uniform quantization of a synthetic weight distribution to show the tradeoff
 * between precision (bits per parameter), on-disk size, and a rough quality
 * proxy. Real quantization (GPTQ/AWQ/etc.) is far more sophisticated.
 */

/** A precision level the user can quantize down to. */
export interface Precision {
  key: PrecisionKey;
  label: string;
  /** Effective bits per parameter. */
  bits: number;
  /** Bytes per parameter on disk. */
  bytesPerParam: number;
  /**
   * Number of distinct representable values. FP16 is treated as the
   * high-precision, near-lossless baseline (huge level count).
   */
  levels: number;
}

export type PrecisionKey = 'FP16' | 'INT8' | 'Q4' | 'Q2';

/** The four precision levels, ordered from most to least precise. */
export const PRECISIONS: readonly Precision[] = [
  { key: 'FP16', label: 'FP16', bits: 16, bytesPerParam: 2, levels: 65536 },
  { key: 'INT8', label: 'INT8', bits: 8, bytesPerParam: 1, levels: 256 },
  { key: 'Q4', label: 'Q4', bits: 4, bytesPerParam: 0.5, levels: 16 },
  { key: 'Q2', label: 'Q2', bits: 2, bytesPerParam: 0.25, levels: 4 },
] as const;

/** Look up a precision descriptor by key. */
export function precisionByKey(key: PrecisionKey): Precision {
  const p = PRECISIONS.find((x) => x.key === key);
  if (!p) throw new Error(`unknown precision key: ${key}`);
  return p;
}

/**
 * mulberry32 — a tiny, fast, deterministic 32-bit PRNG. Same seed always yields
 * the same sequence, so generated distributions are reproducible across runs
 * (NO Math.random anywhere in this module).
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
 * Deterministically generate a plausible, roughly-normal distribution of model
 * weights (mean ~0, sd ~`sd`). Uses a Box–Muller transform driven by the seeded
 * PRNG, so the same `(count, seed, sd)` always produces an identical array.
 */
export function generateWeights(count = 4096, seed = 0x9e3779b9, sd = 0.05): number[] {
  const rand = mulberry32(seed);
  const out = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    // Box–Muller: two uniforms → one standard normal sample.
    const u1 = Math.max(rand(), 1e-12);
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    out[i] = z * sd;
  }
  return out;
}

/**
 * Uniformly quantize `values` into the level count for `precisionKey` across the
 * observed [min, max] range. Returns the snapped `quantized` values plus the
 * `levels` (the representable value at each bucket boundary). FP16 is treated as
 * effectively lossless (identity).
 */
export function quantize(
  values: number[],
  precisionKey: PrecisionKey,
): { levels: number[]; quantized: number[] } {
  const p = precisionByKey(precisionKey);
  if (values.length === 0) return { levels: [], quantized: [] };

  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;

  // FP16 baseline (or a degenerate range): identity.
  if (precisionKey === 'FP16' || range === 0) {
    return { levels: [...new Set(values)].sort((a, b) => a - b), quantized: [...values] };
  }

  const nLevels = p.levels;
  const step = range / (nLevels - 1);
  const levels: number[] = new Array(nLevels);
  for (let i = 0; i < nLevels; i++) levels[i] = min + i * step;

  const quantized = values.map((v) => {
    const idx = Math.round((v - min) / step);
    const clamped = idx < 0 ? 0 : idx > nLevels - 1 ? nLevels - 1 : idx;
    return levels[clamped];
  });

  return { levels, quantized };
}

/** Count how many values fall into each of `binCount` equal-width bins. */
export function bucketHistogram(values: number[], binCount: number): number[] {
  const counts = new Array<number>(binCount).fill(0);
  if (values.length === 0 || binCount <= 0) return counts;

  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (range === 0) {
    counts[0] = values.length;
    return counts;
  }

  for (const v of values) {
    let idx = Math.floor(((v - min) / range) * binCount);
    if (idx < 0) idx = 0;
    if (idx > binCount - 1) idx = binCount - 1;
    counts[idx]++;
  }
  return counts;
}

/** Mean absolute quantization error for a precision level. */
export function meanAbsError(values: number[], precisionKey: PrecisionKey): number {
  if (values.length === 0) return 0;
  const { quantized } = quantize(values, precisionKey);
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += Math.abs(values[i] - quantized[i]);
  return sum / values.length;
}

/** Parameter-count presets the user can toggle between. */
export const PARAM_PRESETS = [
  { key: '7B', label: '7B', params: 7e9 },
  { key: '70B', label: '70B', params: 70e9 },
] as const;

/** On-disk size in bytes: params × bytesPerParam. */
export function modelSizeBytes(params: number, precisionKey: PrecisionKey): number {
  return params * precisionByKey(precisionKey).bytesPerParam;
}

/**
 * qualityProxy — a 0..100 ILLUSTRATIVE score (NOT a benchmark). Derived from the
 * mean absolute quantization error normalized by the distribution's spread, it
 * monotonically DECREASES as bits drop. Use only to convey the precision/quality
 * tradeoff in the interactive, never as a real quality estimate.
 */
export function qualityProxy(values: number[], precisionKey: PrecisionKey): number {
  if (values.length === 0) return 100;

  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const scale = max - min || 1;
  const err = meanAbsError(values, precisionKey);
  const score = 100 * (1 - err / scale);
  return score < 0 ? 0 : score > 100 ? 100 : score;
}
