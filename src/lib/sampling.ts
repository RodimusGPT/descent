/**
 * sampling.ts — turning final logits into a sampled next token (spec 10.1).
 *
 * Pure, deterministic helpers backing the SamplingPlayground interactive. The
 * model's final projection produces one logit per vocabulary entry; softmax (with
 * a temperature knob) turns those into a probability distribution, and top-k /
 * top-p truncation reshape that distribution before we draw a token from it.
 *
 * Everything here is ILLUSTRATIVE — a tiny hand-picked candidate vocabulary, not a
 * real tokenizer — but the math (softmax/temperature/top-k/top-p/inverse-CDF
 * sampling) mirrors exactly what a decoder does at each step.
 */

import { softmaxWithTemperature } from '@/lib/nn';

/** One candidate next-token with a base (pre-temperature) logit. */
export interface Candidate {
  token: string;
  logit: number;
}

/**
 * A fixed, small candidate vocabulary for the prompt "The cat sat on the ___".
 * Logits are illustrative and ordered so `mat` is the most likely completion.
 */
export const PROMPT = 'The cat sat on the ___';

export const VOCAB: readonly Candidate[] = [
  { token: 'mat', logit: 4.2 },
  { token: 'floor', logit: 3.6 },
  { token: 'sofa', logit: 3.1 },
  { token: 'rug', logit: 2.7 },
  { token: 'couch', logit: 2.4 },
  { token: 'chair', logit: 2.0 },
  { token: 'bed', logit: 1.6 },
  { token: 'lap', logit: 1.3 },
  { token: 'table', logit: 0.9 },
  { token: 'windowsill', logit: 0.4 },
  { token: 'grass', logit: 0.1 },
  { token: 'roof', logit: -0.4 },
] as const;

/** Base logit vector for the default vocabulary. */
export const BASE_LOGITS: number[] = VOCAB.map((c) => c.logit);

export interface SamplingOptions {
  /** Softmax temperature. Lower → sharper, higher → flatter. */
  temperature: number;
  /** Keep only the k highest-probability entries (1..n). */
  topK: number;
  /** Nucleus threshold in [0,1]: keep the smallest set whose cumulative prob ≥ p. */
  topP: number;
}

export interface SamplingResult {
  /** Post-truncation, renormalized probabilities (sum to 1 over kept entries). */
  probs: number[];
  /** kept[i] is true iff entry i survived top-k AND the top-p nucleus. */
  kept: boolean[];
}

/**
 * Apply the decoding pipeline to a logit vector:
 *   1. p = softmax(logits / T)
 *   2. top-k: keep only the k highest-probability entries
 *   3. top-p: among those, keep the smallest set (sorted desc) whose cumulative
 *      probability ≥ p
 *   4. zero the rest and renormalize the survivors to sum to 1
 *
 * `kept` marks the survivors. Ties are broken by ascending index for stability.
 */
export function applySampling(logits: number[], opts: SamplingOptions): SamplingResult {
  const n = logits.length;
  if (n === 0) return { probs: [], kept: [] };

  const p = softmaxWithTemperature(logits, opts.temperature);

  // Indices sorted by probability, descending; ties broken by index ascending.
  const order = p.map((_, i) => i).sort((a, b) => p[b] - p[a] || a - b);

  // Top-k: the k highest-probability indices survive this stage.
  const k = Math.max(1, Math.min(Math.floor(opts.topK), n));
  const topKIndices = order.slice(0, k);

  // Top-p / nucleus: walk the (already sorted) survivors accumulating mass; stop
  // at the minimal prefix whose cumulative probability reaches the threshold.
  const threshold = opts.topP;
  const kept = new Array<boolean>(n).fill(false);
  let cum = 0;
  for (const i of topKIndices) {
    kept[i] = true;
    cum += p[i];
    if (cum >= threshold) break;
  }

  // Renormalize the kept mass back to a proper distribution.
  let sum = 0;
  for (let i = 0; i < n; i++) if (kept[i]) sum += p[i];
  const probs = p.map((pi, i) => (kept[i] && sum > 0 ? pi / sum : 0));

  return { probs, kept };
}

/**
 * Inverse-CDF sample: draw one index from `probs` using a single uniform draw in
 * [0,1). `rng` is injectable so tests are deterministic; the component passes
 * Math.random. Returns the last positive-probability index as a safe fallback.
 */
export function sampleIndex(probs: number[], rng: () => number): number {
  const r = rng();
  let cum = 0;
  for (let i = 0; i < probs.length; i++) {
    cum += probs[i];
    if (r < cum) return i;
  }
  for (let i = probs.length - 1; i >= 0; i--) {
    if (probs[i] > 0) return i;
  }
  return probs.length - 1;
}
