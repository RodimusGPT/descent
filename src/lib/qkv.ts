/**
 * qkv.ts — the fixed example + math behind the QKVMultiHead interactive (spec 10.1).
 *
 * One short sentence is embedded once (a tiny d_model = 4 space). Each attention
 * head owns its own learned projections Wq / Wk / Wv; projecting every token
 * embedding through them yields that head's per-token Query, Key and Value
 * vectors. Attention for a chosen query is then the standard pipeline:
 *
 *   scores  = (Q · Kᵀ) / √d        ← scaledScores
 *   weights = softmax(scores)       ← a probability distribution over keys
 *   output  = Σ weightsᵢ · Vᵢ       ← the weighted sum of values
 *
 * Three heads carry DISTINCT projections so they impose distinct attention
 * patterns (content / positional / broad). Everything here is pure and small
 * enough to read by eye, and is unit-tested in test/qkv.test.ts. We reuse the
 * shared primitives in nn.ts (scaledScores, softmax, dot) rather than re-rolling
 * the linear algebra.
 */

import { dot, scaledScores, softmax } from '@/lib/nn';

/** Head dimension d for this toy example (also the embedding width d_model). */
export const HEAD_DIM = 4;

export interface TokenDatum {
  text: string;
  id: number;
}

/** The sentence the reader follows through the projections. */
export const TOKENS: TokenDatum[] = [
  { text: 'she', id: 0 },
  { text: 'poured', id: 1 },
  { text: 'the', id: 2 },
  { text: 'tea', id: 3 },
];

/**
 * Fixed per-token embeddings (rows aligned with TOKENS), d_model = HEAD_DIM = 4.
 * Chosen so the tokens are reasonably spread in the space — distinct dot products
 * give the heads something to discriminate.
 */
export const EMBEDDINGS: number[][] = [
  [2, 0, 1, 0], // she
  [0, 2, 0, 1], // poured
  [1, 0, 2, 0], // the
  [0, 1, 0, 2], // tea
];

/** A d_model × d projection matrix (rows = input dim, cols = output dim). */
export type Projection = number[][];

const IDENTITY: Projection = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
];

/** Cyclic shift of the feature dimensions — re-aims each key onto a neighbour. */
const SHIFT: Projection = [
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
  [1, 0, 0, 0],
];

/** Near-uniform mixer with a mild diagonal — collapses keys toward each other. */
const BLUR: Projection = [
  [0.7, 0.5, 0.5, 0.5],
  [0.5, 0.7, 0.5, 0.5],
  [0.5, 0.5, 0.7, 0.5],
  [0.5, 0.5, 0.5, 0.7],
];

/** Project a vector through a d_model × d matrix: out[j] = Σᵢ vec[i]·M[i][j]. */
export function project(vec: number[], matrix: Projection): number[] {
  const d = matrix[0]?.length ?? 0;
  const out = new Array<number>(d).fill(0);
  for (let i = 0; i < vec.length; i++) {
    const row = matrix[i];
    if (!row) continue;
    for (let j = 0; j < d; j++) out[j] += vec[i] * row[j];
  }
  return out;
}

export interface HeadProjections {
  name: string;
  description: string;
  Wq: Projection;
  Wk: Projection;
  Wv: Projection;
}

/** The three heads, each with its own projections → its own attention pattern. */
export const HEAD_DEFS: HeadProjections[] = [
  {
    name: 'Content',
    description: 'Q = K projection — each query attends to tokens like itself.',
    Wq: IDENTITY,
    Wk: IDENTITY,
    Wv: IDENTITY,
  },
  {
    name: 'Positional',
    description: 'The key projection shifts features — attention lands on a neighbour.',
    Wq: IDENTITY,
    Wk: SHIFT,
    Wv: IDENTITY,
  },
  {
    name: 'Broad',
    description: 'A blurring key projection spreads attention across every token.',
    Wq: IDENTITY,
    Wk: BLUR,
    Wv: IDENTITY,
  },
];

export interface Head {
  name: string;
  description: string;
  /** Per-token query vectors (rows aligned with TOKENS). */
  Q: number[][];
  /** Per-token key vectors. */
  K: number[][];
  /** Per-token value vectors. */
  V: number[][];
}

/** Build a concrete head: project every token embedding through Wq / Wk / Wv. */
export function buildHead(def: HeadProjections, embeddings: number[][] = EMBEDDINGS): Head {
  return {
    name: def.name,
    description: def.description,
    Q: embeddings.map((e) => project(e, def.Wq)),
    K: embeddings.map((e) => project(e, def.Wk)),
    V: embeddings.map((e) => project(e, def.Wv)),
  };
}

/** The fixed example's heads, with Q/K/V already projected and ready to render. */
export const HEADS: Head[] = HEAD_DEFS.map((d) => buildHead(d));

export interface AttentionResult {
  /** Scaled dot-product scores (q·kᵢ)/√d, one per key. */
  scores: number[];
  /** softmax(scores) — a probability distribution over the keys, sums to 1. */
  weights: number[];
  /** Σ weightsᵢ · valuesᵢ — the attention output, length === value dim. */
  output: number[];
}

/**
 * One head's scaled dot-product attention for a single query against all keys,
 * returning the intermediate scores, the softmax weights, and the value-weighted
 * output. Reuses scaledScores + softmax + dot from nn.ts.
 */
export function headAttention(
  query: number[],
  keys: number[][],
  values: number[][],
): AttentionResult {
  const scores = scaledScores(query, keys);
  const weights = softmax(scores);
  const dim = values[0]?.length ?? 0;
  const output = new Array<number>(dim).fill(0);
  for (let i = 0; i < values.length; i++) {
    const w = weights[i] ?? 0;
    const v = values[i];
    for (let j = 0; j < dim; j++) output[j] += w * v[j];
  }
  return { scores, weights, output };
}

/**
 * Grouped-query attention map: assign each of `nQueryHeads` query heads to one of
 * `nKvGroups` key/value groups, in contiguous equal-sized blocks. Query heads in
 * the same group SHARE a single K/V projection, so the KV cache stores only
 * `nKvGroups` sets of keys/values instead of one per query head — the saving that
 * pays off in Part 3.
 *
 *   gqaGrouping(8, 2) → [0,0,0,0, 1,1,1,1]   (GQA, 4 heads per group)
 *   gqaGrouping(8, 8) → [0,1,2,3,4,5,6,7]    (full multi-head attention)
 *   gqaGrouping(8, 1) → [0,0,0,0,0,0,0,0]    (multi-query attention, one shared K/V)
 */
export function gqaGrouping(nQueryHeads: number, nKvGroups: number): number[] {
  const heads = Math.max(0, Math.floor(nQueryHeads));
  const groups = Math.max(1, Math.floor(nKvGroups));
  const perGroup = Math.ceil(heads / groups);
  const out = new Array<number>(heads);
  for (let h = 0; h < heads; h++) {
    out[h] = Math.min(groups - 1, Math.floor(h / perGroup));
  }
  return out;
}

/** Convenience: the dot product of a query and a single key (pre-scaling). */
export function rawScore(query: number[], key: number[]): number {
  return dot(query, key);
}
