/**
 * config.ts — the Part 5 capstone arithmetic (spec 10.5).
 *
 * Pick a model + a quantization + a GPU, then estimate two numbers that decide
 * whether the thing actually runs:
 *
 *   1. VRAM used = weights + KV cache        (the Part 2 memory math)
 *   2. tokens/sec ≈ bandwidth ÷ bytes-read-per-token  (the Part 4 roofline)
 *
 * Decode is MEMORY-BOUND: each new token streams the weights that participate
 * once through the accelerator, so throughput is bandwidth divided by the bytes
 * read per token. The twist this capstone makes visible: a Mixture-of-Experts
 * model reads only its ACTIVE parameters per token, so a 120B MoE with ~5B active
 * decodes far faster than a 70B dense model — even though it is bigger on disk.
 *
 * Every number is ILLUSTRATIVE teaching arithmetic (decimal GB = bytes / 1e9, no
 * efficiency fudge factors), not a vendor benchmark.
 */

import { kvCacheBytes } from '@/lib/memory';
import { type PrecisionKey, precisionByKey } from '@/lib/quant';

/** A GPU / accelerator: capacity (VRAM) and memory bandwidth (the decode lever). */
export interface GpuOption {
  /** Display name. */
  name: string;
  /** Usable VRAM (or unified memory) in GB. */
  vramGB: number;
  /** Memory bandwidth in TB/s — caps memory-bound decode throughput. */
  bandwidthTBs: number;
  /** Short note on the class of hardware. */
  note: string;
}

/**
 * A spread of real-ish accelerators: a consumer card (fast-ish, small), two
 * datacenter cards (more bandwidth), and a big unified-memory box (vast but
 * slow). Bandwidth is what decides tokens/sec; VRAM is what decides whether it
 * fits at all. Ordered from least to most VRAM so the selector reads as a ladder.
 */
export const GPU_OPTIONS: readonly GpuOption[] = [
  { name: 'RTX 5090', vramGB: 32, bandwidthTBs: 1.8, note: 'top consumer GPU' },
  { name: 'H100', vramGB: 80, bandwidthTBs: 3.35, note: 'datacenter workhorse' },
  { name: 'B200', vramGB: 192, bandwidthTBs: 8.0, note: 'Blackwell flagship — big and very fast' },
  {
    name: 'M3 Ultra (unified)',
    vramGB: 256,
    bandwidthTBs: 0.8,
    note: 'vast but slow unified memory',
  },
] as const;

/**
 * A model the user can select. `paramsB` is total parameters in BILLIONS;
 * `activeParamsB` is how many are READ per decoded token — equal to `paramsB`
 * for a dense model, but far smaller for a Mixture-of-Experts model.
 */
export interface ModelOption {
  /** Display name. */
  name: string;
  /** Total parameter count, in billions (sets on-disk / weight size). */
  paramsB: number;
  /** Active parameters per token, in billions (sets decode bytes/token). */
  activeParamsB: number;
  /** Short note on what the model illustrates. */
  note: string;
  /** Transformer depth — feeds the KV-cache formula. */
  nLayers: number;
  /** Key/value heads (GQA-shrunk in these presets). */
  nKvHeads: number;
  /** Dimension of each attention head. */
  headDim: number;
}

/**
 * Three shapes that make the capstone tradeoffs land: a small dense 7B, a large
 * dense 70B, and a 120B MoE whose ~5B active params let it decode like a small
 * model while weighing as much as a frontier one (so it needs lots of VRAM but
 * flies on bandwidth).
 */
export const MODEL_OPTIONS: readonly ModelOption[] = [
  {
    name: '7B dense',
    paramsB: 7,
    activeParamsB: 7,
    note: 'every parameter read per token',
    nLayers: 32,
    nKvHeads: 8,
    headDim: 128,
  },
  {
    name: '70B dense',
    paramsB: 70,
    activeParamsB: 70,
    note: 'big and read in full — slow decode',
    nLayers: 80,
    nKvHeads: 8,
    headDim: 128,
  },
  {
    name: '120B MoE (~5B active)',
    paramsB: 120,
    activeParamsB: 5,
    note: 'huge on disk, but only a few experts fire per token',
    nLayers: 60,
    nKvHeads: 8,
    headDim: 128,
  },
] as const;

/** KV cache is stored fp16 (2 bytes/elem) in these presets. */
const KV_BYTES_PER_ELEM = 2;

/** Breakdown of estimated VRAM usage, in decimal GB. */
export interface VramEstimate {
  /** Weight memory in GB. */
  weightGB: number;
  /** KV-cache memory in GB at the chosen context length and batch. */
  kvGB: number;
  /** Sum of the two. */
  totalGB: number;
}

/**
 * Estimate VRAM usage for a model at a precision, holding `contextLen` tokens
 * across `batch` concurrent sequences.
 *
 *   weightGB = paramsB·1e9 · bytesPerParam / 1e9   (= paramsB · bytesPerParam)
 *   kvGB     = kvCacheBytes(...) · batch / 1e9
 */
export function estimateVramGB(
  model: ModelOption,
  precisionKey: PrecisionKey,
  contextLen: number,
  batch = 1,
): VramEstimate {
  const bytesPerParam = precisionByKey(precisionKey).bytesPerParam;
  const weightGB = (model.paramsB * 1e9 * bytesPerParam) / 1e9;
  const kvBytes = kvCacheBytes({
    nLayers: model.nLayers,
    nKvHeads: model.nKvHeads,
    headDim: model.headDim,
    seqLen: contextLen,
    bytesPerElem: KV_BYTES_PER_ELEM,
  });
  const kvGB = (kvBytes * batch) / 1e9;
  return { weightGB, kvGB, totalGB: weightGB + kvGB };
}

/**
 * Estimate decode throughput in tokens/sec. Decode is memory-bound, so:
 *
 *   bytesPerToken = activeParamsB·1e9 · bytesPerParam   (only ACTIVE params read)
 *   tokPerSec     = bandwidth(bytes/s) / bytesPerToken
 *
 * Because only active parameters are streamed per token, an MoE with
 * activeParamsB ≪ paramsB decodes much faster than a dense model of its total
 * size. Lower precision (fewer bytes/param) raises throughput too.
 */
export function estimateTokensPerSec(
  model: ModelOption,
  precisionKey: PrecisionKey,
  gpu: GpuOption,
): number {
  const bytesPerParam = precisionByKey(precisionKey).bytesPerParam;
  const bytesPerToken = model.activeParamsB * 1e9 * bytesPerParam;
  if (bytesPerToken <= 0) return 0;
  return (gpu.bandwidthTBs * 1e12) / bytesPerToken;
}

/** Does `totalGB` fit within `vramGB`? (Boundary is inclusive.) */
export function fits(totalGB: number, vramGB: number): boolean {
  return totalGB <= vramGB;
}
