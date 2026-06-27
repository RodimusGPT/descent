/**
 * speculative.ts — the arithmetic of speculative decoding (spec 10.3).
 *
 * A small DRAFT model proposes k tokens; the big TARGET verifies all k in ONE
 * forward pass. Rejection sampling keeps every accepted token while preserving
 * the target's exact distribution; the first rejected token is resampled from a
 * corrected target distribution, and a fully-accepted run earns a free BONUS
 * token. This trades the target's spare decode-time compute for fewer serial
 * target passes — the win depends entirely on the per-token acceptance rate and
 * on the draft being much cheaper than the target.
 *
 * Pure and unit-tested so the visualization is built on a correct base.
 */

/**
 * Expected number of tokens produced per target verification pass, INCLUDING the
 * bonus token, for a draft of length `k` and per-token acceptance probability
 * `alpha`. Derivation: with i.i.d. acceptance, the expected accepted prefix length
 * is sum_{i=1..k} alpha^i, and a fully-accepted run (prob alpha^k) yields one more
 * bonus token, giving the closed form sum_{i=0..k} alpha^i.
 *
 *   alpha = 1 → k + 1   (everything accepted, plus the bonus)
 *   alpha = 0 → 1       (nothing accepted, but the resample/bonus still yields one)
 */
export function expectedAcceptedTokens(k: number, alpha: number): number {
  if (alpha >= 1) return k + 1;
  return (1 - alpha ** (k + 1)) / (1 - alpha);
}

/**
 * End-to-end speedup over plain autoregressive decoding (which produces exactly
 * 1 token per target pass). One speculative round costs 1 target pass plus `k`
 * draft passes, each draft pass costing `draftCostRatio` of a target pass — so the
 * round costs `1 + k * draftCostRatio` target-equivalents and produces
 * `expectedAcceptedTokens(k, alpha)` tokens.
 *
 * Can fall BELOW 1 when the draft is too expensive (high draftCostRatio) or the
 * acceptance rate is too low — speculation is not free.
 */
export function speedup(k: number, alpha: number, draftCostRatio: number): number {
  return expectedAcceptedTokens(k, alpha) / (1 + k * draftCostRatio);
}

/** A tiny deterministic PRNG (mulberry32) so the viz simulation is reproducible. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Per-token outcome of a single speculative round. */
export interface RoundToken {
  /** Position in the draft (0-based); the bonus token has index === k. */
  index: number;
  /** True for an accepted draft token. */
  accepted: boolean;
  /** True for the single first-rejected token, which the target resamples. */
  rejected: boolean;
  /** True for the free bonus token appended after a fully-accepted run. */
  bonus: boolean;
}

/** Result of simulating one speculative round. */
export interface RoundResult {
  /** One entry per emitted/considered token, in order. */
  tokens: RoundToken[];
  /** Number of draft tokens accepted (the accepted prefix length, 0..k). */
  acceptedCount: number;
  /** Total tokens committed this round (accepted prefix + 1 resample/bonus). */
  produced: number;
}

/**
 * Deterministically simulate ONE speculative round given a seeded rng. Walks the
 * `k` draft tokens, accepting each with probability `alpha`; the first rejection
 * stops the run and is resampled by the target. If the whole draft is accepted, a
 * bonus token is appended. The committed token count is always
 * `min(firstReject, k) + 1`, matching `expectedAcceptedTokens` in expectation.
 */
export function simulateRound(k: number, alpha: number, rng: () => number): RoundResult {
  const tokens: RoundToken[] = [];
  let acceptedCount = 0;
  let rejectedAt = -1;

  for (let i = 0; i < k; i++) {
    if (rng() < alpha) {
      tokens.push({ index: i, accepted: true, rejected: false, bonus: false });
      acceptedCount++;
    } else {
      rejectedAt = i;
      break;
    }
  }

  if (rejectedAt >= 0) {
    // First rejected draft token → target resamples one corrected token here.
    tokens.push({ index: rejectedAt, accepted: false, rejected: true, bonus: false });
  } else {
    // Whole draft accepted → free bonus token from the target's verification pass.
    tokens.push({ index: k, accepted: false, rejected: false, bonus: true });
  }

  return { tokens, acceptedCount, produced: acceptedCount + 1 };
}
