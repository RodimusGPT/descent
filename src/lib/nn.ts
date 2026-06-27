/**
 * nn.ts — shared numeric primitives for the neural-net visualizations.
 *
 * Single source for the small bits of linear algebra / probability several Part 1
 * interactives lean on (softmax for attention scores, router logits, and sampling;
 * cosine similarity for the embedding space). Pure and unit-tested so every visual
 * is built on the same correct base.
 */

/** Numerically stable softmax over a vector of logits. Returns a probability vector summing to 1. */
export function softmax(logits: number[]): number[] {
  if (logits.length === 0) return [];
  const max = Math.max(...logits);
  const exps = logits.map((x) => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return sum === 0 ? logits.map(() => 1 / logits.length) : exps.map((e) => e / sum);
}

/**
 * Softmax with a temperature. T → 0 sharpens toward the argmax (greedy); larger T
 * flattens toward uniform. T is floored to a tiny positive value to avoid div-by-zero.
 */
export function softmaxWithTemperature(logits: number[], temperature: number): number[] {
  const t = Math.max(1e-6, temperature);
  return softmax(logits.map((x) => x / t));
}

/** Index of the largest element (first on ties). Returns -1 for an empty array. */
export function argmax(xs: number[]): number {
  if (xs.length === 0) return -1;
  let best = 0;
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] > xs[best]) best = i;
  }
  return best;
}

/** Dot product of two equal-length vectors. */
export function dot(a: number[], b: number[]): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

/** Euclidean magnitude of a vector. */
export function magnitude(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

/** Cosine similarity in [-1, 1]; 0 when either vector is the zero vector. */
export function cosineSimilarity(a: number[], b: number[]): number {
  const denom = magnitude(a) * magnitude(b);
  return denom === 0 ? 0 : dot(a, b) / denom;
}

/** Scaled dot-product attention scores for one query against keys: (q·kᵢ)/√d. */
export function scaledScores(query: number[], keys: number[][]): number[] {
  const d = Math.max(1, query.length);
  return keys.map((k) => dot(query, k) / Math.sqrt(d));
}
