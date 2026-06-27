/**
 * roofline.ts — the roofline model (spec 10.4).
 *
 * A kernel's performance on an accelerator is capped by whichever of two roofs
 * it hits first:
 *
 *   memory roof  → arithmeticIntensity * bandwidth   (a sloped line: more bytes
 *                   moved per FLOP buys more attainable FLOP/s, up to the ceiling)
 *   compute roof → peakFlops                          (a flat ceiling: the chip's
 *                   raw arithmetic throughput)
 *
 * They meet at the RIDGE POINT, an arithmetic intensity of `peak / bandwidth`.
 * Left of the ridge a kernel is MEMORY-BOUND (starved for bytes); right of it
 * it is COMPUTE-BOUND (saturating the ALUs).
 *
 * The teaching payoff:
 *   - PREFILL processes many prompt tokens per weight load → high intensity →
 *     compute-bound (right of the ridge).
 *   - DECODE at batch 1 reuses each loaded weight for a single token → intensity
 *     ~1 FLOP/byte → deep in the memory-bound region.
 *   - Raising the BATCH SIZE amortises each weight load over more tokens, so the
 *     decode operating point slides right along the memory roof toward — and past
 *     — the ridge, turning a memory-bound workload compute-bound.
 *
 * Every number here is ILLUSTRATIVE teaching arithmetic, not a vendor spec.
 */

/** Arithmetic intensity: FLOPs of work per byte of memory traffic. */
export function arithmeticIntensity(flops: number, bytes: number): number {
  return flops / bytes;
}

/**
 * Attainable throughput (FLOP/s) at a given arithmetic intensity — the lower of
 * the two roofs: the sloped memory roof `ai * bandwidth` and the flat compute
 * roof `peakFlops`.
 */
export function attainableFlops(
  ai: number,
  peakFlops: number,
  bandwidthBytesPerSec: number,
): number {
  return Math.min(peakFlops, ai * bandwidthBytesPerSec);
}

/**
 * The ridge-point arithmetic intensity where the two roofs meet:
 * `peakFlops / bandwidth`. Below it, memory-bound; at or above it, compute-bound.
 */
export function ridgeIntensity(peakFlops: number, bandwidthBytesPerSec: number): number {
  return peakFlops / bandwidthBytesPerSec;
}

/** True when the operating point sits left of the ridge (memory-bound). */
export function isMemoryBound(ai: number, ridge: number): boolean {
  return ai < ridge;
}

/** A modeled accelerator: a flat compute roof and a sloped memory roof. */
export interface Hardware {
  /** Display name. */
  name: string;
  /** Peak dense throughput in FLOP/s (the compute ceiling). */
  peakFlops: number;
  /** Memory bandwidth in bytes/s (the slope of the memory roof). */
  bandwidthBytesPerSec: number;
}

/**
 * A representative high-end accelerator: ~1 PFLOP/s of dense FP16 over ~3.35 TB/s
 * of HBM. Its ridge point sits at peak/bw ≈ 299 FLOPs/byte — the classic result
 * that decode needs a batch of a few hundred to stop being memory-bound.
 */
export const HARDWARE: Hardware = {
  name: 'HBM accelerator',
  peakFlops: 1.0e15,
  bandwidthBytesPerSec: 3.35e12,
};

/**
 * Arithmetic intensity contributed by one token per weight load. A decode step
 * reads each weight once (2 bytes at FP16) and does one multiply-add (2 FLOPs)
 * with it per token, so the per-token intensity is ~1 FLOP/byte.
 */
export const DECODE_INTENSITY_PER_TOKEN = 1;

/**
 * Decode arithmetic intensity as a function of batch size.
 *
 * The dominant memory traffic in decode is loading the weights; that load is
 * shared across every sequence in the batch, while the FLOPs scale with the
 * batch. So intensity ≈ `batch * perTokenIntensity` — strictly increasing in the
 * batch size. At batch 1 it is ~1 FLOP/byte (deep in the memory-bound region);
 * as the batch approaches the ridge (~299 here) the point crosses to
 * compute-bound.
 */
export function decodeIntensity(
  batch: number,
  perTokenIntensity: number = DECODE_INTENSITY_PER_TOKEN,
): number {
  return Math.max(0, batch) * perTokenIntensity;
}

/**
 * Tokens processed per weight load during prefill: the whole prompt streams
 * through each weight in one pass, so prefill intensity ≈ prompt length. This
 * representative prompt lands prefill far right of the ridge (compute-bound).
 */
export const PREFILL_TOKENS = 2048;

/**
 * Prefill arithmetic intensity: a long prompt amortises each weight load over
 * `tokens` tokens, giving an intensity of ~`tokens` FLOPs/byte — high, hence
 * compute-bound.
 */
export function prefillIntensity(
  tokens: number = PREFILL_TOKENS,
  perTokenIntensity: number = DECODE_INTENSITY_PER_TOKEN,
): number {
  return Math.max(0, tokens) * perTokenIntensity;
}
