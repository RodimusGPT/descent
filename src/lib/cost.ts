/**
 * cost.ts — the economics of serving a token (Part 5 synthesis).
 *
 * Self-hosting, cost per token is just the GPU's price per hour ÷ the tokens it
 * produces in that hour. The lever is BATCHING. A single decode stream is
 * memory-bound — the weights are dragged off memory once per step no matter how
 * many sequences ride along — so one GPU-hour buys few tokens. Pack many sequences
 * into the batch and that one weight read serves them all: aggregate throughput
 * climbs ~linearly and cost per token falls ~1/batch, until the batch is large
 * enough that the math itself saturates the cores — the roofline's compute roof —
 * where throughput (and cost) plateau. (Real batch is also capped by KV-cache
 * memory.)
 *
 * The model is grounded, not fudged: per step, time = max(memory time, compute
 * time), exactly the roofline. Numbers are BEST-CASE (100% utilization) and the
 * $/hour are ILLUSTRATIVE knobs (~2026) — real serving runs lower, so real prices
 * run higher. The SHAPE — batching is the lever — is the lesson.
 */

const SECONDS_PER_HOUR = 3600;
/** Bytes per weight at the serving precision these estimates assume (FP8). */
export const SERVING_BYTES_PER_PARAM = 1;
/** A matmul does ~2 FLOPs (a multiply + an add) per parameter, per token. */
const FLOPS_PER_PARAM_PER_TOKEN = 2;

/** A GPU priced for rent: $/hour, bandwidth, and peak compute. */
export interface GpuCost {
  name: string;
  /** Illustrative rental price, US$/hour. */
  costPerHour: number;
  /** Memory bandwidth, TB/s — sets the memory-bound (single-stream) rate. */
  bandwidthTBs: number;
  /** Peak dense FP8 compute, PFLOP/s — sets the compute roof. */
  peakPflopsFp8: number;
}

/** A spread of rentable accelerators (illustrative $/hr, ~2026). */
export const GPU_COSTS: readonly GpuCost[] = [
  { name: 'RTX 5090', costPerHour: 0.5, bandwidthTBs: 1.8, peakPflopsFp8: 1.6 },
  { name: 'H100', costPerHour: 2.5, bandwidthTBs: 3.35, peakPflopsFp8: 2.0 },
  { name: 'H200', costPerHour: 3.0, bandwidthTBs: 4.8, peakPflopsFp8: 2.0 },
  { name: 'B200', costPerHour: 5.0, bandwidthTBs: 8.0, peakPflopsFp8: 4.5 },
] as const;

/** Batch sizes the cost curve is sampled at — straddling the compute roof. */
export const BATCH_STEPS = [1, 8, 64, 256, 1024] as const;

/**
 * Aggregate decode throughput (tokens/sec) at a batch size, from the roofline:
 *   memory time  = active-weight bytes ÷ bandwidth      (per step, batch-independent)
 *   compute time = batch × FLOPs/token ÷ peak FLOP/s    (per step, grows with batch)
 *   step time    = max(memory, compute)
 *   throughput   = batch ÷ step time
 * Linear in batch while memory-bound; flat once compute-bound (the roof).
 */
export function decodeThroughputBatched(
  activeParamsB: number,
  gpu: GpuCost,
  batch: number,
): number {
  if (activeParamsB <= 0 || batch <= 0) return 0;
  const activeBytes = activeParamsB * 1e9 * SERVING_BYTES_PER_PARAM;
  const memTime = activeBytes / (gpu.bandwidthTBs * 1e12);
  const flopsPerToken = FLOPS_PER_PARAM_PER_TOKEN * activeParamsB * 1e9;
  const computeTime = (batch * flopsPerToken) / (gpu.peakPflopsFp8 * 1e15);
  const stepTime = Math.max(memTime, computeTime);
  return stepTime > 0 ? batch / stepTime : 0;
}

/** Cost per MILLION tokens: ($/hour) ÷ (tokens/hour) × 1e6. */
export function costPerMtok(costPerHour: number, tokPerSec: number): number {
  const tokensPerHour = tokPerSec * SECONDS_PER_HOUR;
  if (tokensPerHour <= 0) return Number.POSITIVE_INFINITY;
  return (costPerHour / tokensPerHour) * 1e6;
}

/** Convenience: cost per million tokens for a model on a GPU at a batch size. */
export function costAtBatch(activeParamsB: number, gpu: GpuCost, batch: number): number {
  return costPerMtok(gpu.costPerHour, decodeThroughputBatched(activeParamsB, gpu, batch));
}
