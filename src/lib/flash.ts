/**
 * flash.ts — the memory-traffic arithmetic behind FlashAttention (spec 10.4).
 *
 * Attention is memory-bound, not compute-bound: the cost that matters is bytes
 * moved between the GPU's small-but-fast on-chip SRAM and its large-but-slow HBM.
 *
 *   NAIVE attention computes S = QKᵀ (an n×n matrix), WRITES it to HBM, reads it
 *   back to softmax, writes the probabilities, reads them again to multiply by V.
 *   That round-trip of the n×n matrix is O(n²) HBM traffic — it dominates everything.
 *
 *   FLASHATTENTION fuses QK → softmax → ·V into a single kernel and TILES the
 *   computation through SRAM, keeping a running max + running sum (an "online"
 *   softmax) so it never has to materialize the n×n matrix in HBM. The only HBM
 *   traffic left is reading Q, K, V and writing the output O — all O(n·d).
 *
 * These pure functions quantify that gap; the FlashAttention visual animates it.
 */

/** Per-element overhead of the streaming softmax statistics (running max + sum). */
const STAT_TERMS = 2;

/**
 * HBM bytes moved by NAIVE attention for sequence length `n`, head dim `d`,
 * at `bytes` per element.
 *
 * The dominant term is the n×n scores matrix making a full round-trip through
 * HBM: written after QKᵀ and read back for the softmax/·V (≈ `2·n²`). The
 * remaining O(n·d) covers reading Q, K, V and writing O. The n² term dominates
 * for any realistic n, so naive traffic grows quadratically with sequence length.
 */
export function naiveHbmBytes(n: number, d: number, bytes: number): number {
  if (n <= 0 || d <= 0 || bytes <= 0) return 0;
  const scoresRoundTrip = 2 * n * n; // write S, read S back
  const qkvo = 4 * n * d; // read Q, K, V + write O
  return (scoresRoundTrip + qkvo) * bytes;
}

/**
 * HBM bytes moved by FLASHATTENTION for sequence length `n`, head dim `d`,
 * at `bytes` per element.
 *
 * The n×n matrix is never materialized — it lives only in SRAM, tile by tile —
 * so HBM traffic is just reading Q, K, V, writing O (`4·n·d`) plus the O(n)
 * running max/sum statistics. The whole thing is O(n·d): linear in sequence
 * length, so quadrupling n only quadruples traffic.
 */
export function flashHbmBytes(n: number, d: number, bytes: number): number {
  if (n <= 0 || d <= 0 || bytes <= 0) return 0;
  const qkvo = 4 * n * d; // read Q, K, V + write O
  const stats = STAT_TERMS * n; // streaming max + sum, O(n)
  return (qkvo + stats) * bytes;
}

/** How many times more HBM traffic naive attention moves versus FlashAttention. */
export function trafficRatio(n: number, d: number, bytes: number): number {
  const flash = flashHbmBytes(n, d, bytes);
  if (flash === 0) return 0;
  return naiveHbmBytes(n, d, bytes) / flash;
}

/** One step of the streaming ("online") softmax: state after seeing a value. */
export interface OnlineSoftmaxStep {
  /** The value just consumed. */
  value: number;
  /** Running maximum over all values seen so far (the softmax shift). */
  runningMax: number;
  /** Running denominator Σ exp(xᵢ − runningMax), rescaled as the max grows. */
  runningSum: number;
}

/**
 * Streaming softmax statistics, one step per value. Demonstrates the core trick:
 * when a new value exceeds the running max, the accumulated sum is rescaled by
 * exp(oldMax − newMax) so the denominator stays correct WITHOUT a second pass
 * over the data — exactly how FlashAttention combines tiles.
 */
export function onlineSoftmaxSteps(values: number[]): OnlineSoftmaxStep[] {
  const steps: OnlineSoftmaxStep[] = [];
  let m = Number.NEGATIVE_INFINITY;
  let l = 0;
  for (const x of values) {
    const mNew = Math.max(m, x);
    // rescale the old sum to the new max, then add the new term
    l = (m === Number.NEGATIVE_INFINITY ? 0 : l * Math.exp(m - mNew)) + Math.exp(x - mNew);
    m = mNew;
    steps.push({ value: x, runningMax: m, runningSum: l });
  }
  return steps;
}

/**
 * Final softmax probabilities computed via the streaming update. Numerically
 * identical to a plain (two-pass) softmax — that equivalence is what lets
 * FlashAttention tile attention without ever storing the full scores matrix.
 */
export function onlineSoftmax(values: number[]): number[] {
  if (values.length === 0) return [];
  const steps = onlineSoftmaxSteps(values);
  const last = steps[steps.length - 1];
  const { runningMax: m, runningSum: l } = last;
  if (l === 0) return values.map(() => 1 / values.length);
  return values.map((x) => Math.exp(x - m) / l);
}

/** Compact human-readable byte size (KB / MB / GB, base-1024). */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  const digits = v >= 100 || u === 0 ? 0 : 1;
  return `${v.toFixed(digits)} ${units[u]}`;
}
