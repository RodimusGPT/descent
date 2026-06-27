/**
 * memory.ts — the arithmetic behind prefill/decode and the KV cache (spec 9.4).
 *
 * Decoding an autoregressive transformer splits into two regimes:
 *   PREFILL  — the whole prompt is processed in one parallel pass (compute-bound).
 *   DECODE   — one new token is produced per step (memory-bound), reading a growing
 *              KV cache instead of recomputing attention over all prior tokens.
 *
 * These pure functions quantify the two payoffs the PrefillDecode visual teaches:
 *   1. The KV cache trades memory for work: O(n) decode instead of O(n^2) recompute.
 *   2. Grouped-query attention (GQA) shrinks that cache by sharing KV heads.
 */

/** Inputs to the KV-cache size formula. */
export interface KvCacheParams {
  /** Number of transformer layers. */
  nLayers: number;
  /** Number of key/value heads (fewer than query heads under GQA/MQA). */
  nKvHeads: number;
  /** Dimension of each attention head. */
  headDim: number;
  /** Sequence length (context tokens) the cache must hold. */
  seqLen: number;
  /** Bytes per stored element (2 for fp16/bf16, 1 for fp8/int8). */
  bytesPerElem: number;
}

/**
 * Bytes held by the KV cache for `seqLen` tokens.
 *
 *   2 * nLayers * nKvHeads * headDim * seqLen * bytesPerElem
 *
 * The leading 2 accounts for storing both Keys and Values. Lowering `nKvHeads`
 * (the GQA/MQA lever) scales the whole thing down linearly.
 */
export function kvCacheBytes({
  nLayers,
  nKvHeads,
  headDim,
  seqLen,
  bytesPerElem,
}: KvCacheParams): number {
  return 2 * nLayers * nKvHeads * headDim * seqLen * bytesPerElem;
}

/** Bytes occupied by the model weights: `params * bytesPerParam`. */
export function weightBytes(params: number, bytesPerParam: number): number {
  return params * bytesPerParam;
}

/** A small, realistic model configuration for the KV-cache readout. */
export interface ModelPreset {
  /** Display name. */
  name: string;
  /** Short note on what the preset illustrates. */
  note: string;
  nLayers: number;
  /** Query heads (attention width). */
  nHeads: number;
  /** Key/value heads — equals nHeads for MHA, fewer for GQA/MQA. */
  nKvHeads: number;
  headDim: number;
  /** Total parameter count. */
  params: number;
  /** Bytes per weight at the preset's native precision. */
  bytesPerParam: number;
}

/**
 * A handful of presets. The first two are the same ~7B-ish shape differing ONLY
 * in nKvHeads (32 MHA vs 8 GQA) so the cache readout visibly shrinks 4x; the
 * third is an MQA extreme; the fourth a smaller model for contrast.
 */
export const MODEL_PRESETS: readonly ModelPreset[] = [
  {
    name: '7B · MHA',
    note: '32 query heads, 32 KV heads — full multi-head attention',
    nLayers: 32,
    nHeads: 32,
    nKvHeads: 32,
    headDim: 128,
    params: 7_000_000_000,
    bytesPerParam: 2,
  },
  {
    name: '7B · GQA',
    note: 'same shape, 8 KV head groups — 4x smaller cache',
    nLayers: 32,
    nHeads: 32,
    nKvHeads: 8,
    headDim: 128,
    params: 7_000_000_000,
    bytesPerParam: 2,
  },
  {
    name: '7B · MQA',
    note: 'a single shared KV head — 32x smaller cache',
    nLayers: 32,
    nHeads: 32,
    nKvHeads: 1,
    headDim: 128,
    params: 7_000_000_000,
    bytesPerParam: 2,
  },
  {
    name: '1.5B · GQA',
    note: 'a small model: less cache, fewer layers',
    nLayers: 28,
    nHeads: 12,
    nKvHeads: 2,
    headDim: 128,
    params: 1_500_000_000,
    bytesPerParam: 2,
  },
];

/**
 * Token-processings needed to decode `n` new tokens.
 *
 *   cached   → n            (one fresh token per step; prior keys/values reused)
 *   uncached → n*(n+1)/2    (every step reprocesses all tokens emitted so far)
 *
 * The uncached path is the O(n^2) waste the KV cache exists to remove; the cached
 * path is O(n). Their ratio approaches (n+1)/2.
 */
export function recomputeWork(n: number, cached: boolean): number {
  if (n <= 0) return 0;
  return cached ? n : (n * (n + 1)) / 2;
}
