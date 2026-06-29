/**
 * budget.ts — does the model fit in VRAM? (spec 10.2)
 *
 * Pure, deterministic helpers backing the MemoryBudget interactive. The mental
 * model is a single arithmetic chain:
 *
 *   total memory = weights + KV cache
 *   weights      = params * bytes/param              (precision picks bytes/param)
 *   KV cache     = grows linearly with context length (and batch)
 *
 * compared against a fixed VRAM capacity. A handy field rule of thumb: a model
 * with N billion parameters needs roughly `N * 0.6` GB once quantized to ~4-bit
 * (Q4) — see `q4RuleGB`.
 *
 * Every number is ILLUSTRATIVE teaching arithmetic (decimal GB = bytes / 1e9),
 * not a vendor spec.
 */

import { kvCacheBytes } from '@/lib/memory';
import { type PrecisionKey, modelSizeBytes } from '@/lib/quant';

/** A GPU / accelerator the model is measured against. */
export interface GpuPreset {
  /** Display name. */
  name: string;
  /** Usable VRAM (or unified memory) in GB. */
  vramGB: number;
  /** Short note on the class of hardware. */
  note: string;
}

/**
 * A spread of real-ish accelerators: a consumer card, a couple of bigger
 * consumer/prosumer cards, a datacenter card, and a large unified-memory box.
 * Ordered from least to most memory so the selector reads as a ladder.
 */
export const GPU_PRESETS: readonly GpuPreset[] = [
  { name: 'RTX 5060 Ti', vramGB: 16, note: 'entry consumer GPU' },
  { name: 'RTX 5090', vramGB: 32, note: 'high-end consumer GPU' },
  { name: 'H100', vramGB: 80, note: 'datacenter accelerator' },
  { name: 'B200', vramGB: 192, note: 'Blackwell flagship' },
  { name: 'M3 Ultra (unified)', vramGB: 256, note: 'vast unified memory' },
] as const;

/** A model size the user can pick: a parameter count plus a label. */
export interface ModelShape {
  /** Display label, e.g. "7B". */
  label: string;
  /** Total parameter count. */
  params: number;
  /** Transformer depth — feeds the KV-cache formula. */
  nLayers: number;
  /** Key/value heads (GQA-shrunk in these presets). */
  nKvHeads: number;
  /** Dimension of each attention head. */
  headDim: number;
}

/**
 * Model-size presets spanning toy → frontier. Shapes (layers / KV heads /
 * head dim) are representative GQA configurations so the KV cache scales
 * believably with the parameter count.
 */
export const MODEL_SHAPES: readonly ModelShape[] = [
  { label: '1.5B', params: 1.5e9, nLayers: 28, nKvHeads: 2, headDim: 128 },
  { label: '7B', params: 7e9, nLayers: 32, nKvHeads: 8, headDim: 128 },
  { label: '13B', params: 13e9, nLayers: 40, nKvHeads: 8, headDim: 128 },
  { label: '70B', params: 70e9, nLayers: 80, nKvHeads: 8, headDim: 128 },
] as const;

/** Weight memory in GB: `params * bytes/param`, expressed in decimal GB. */
export function weightGB(params: number, precisionKey: PrecisionKey): number {
  return modelSizeBytes(params, precisionKey) / 1e9;
}

/**
 * KV-cache memory in GB for a given context length and batch size.
 *
 *   kvCacheBytes(...) / 1e9 * batch
 *
 * Grows linearly with `seqLen` and `batch`; the model shape (layers / KV heads /
 * head dim) sets the per-token cost.
 */
export function kvCacheGB(
  shape: Pick<ModelShape, 'nLayers' | 'nKvHeads' | 'headDim'>,
  seqLen: number,
  bytesPerElem: number,
  batch = 1,
): number {
  const bytes = kvCacheBytes({
    nLayers: shape.nLayers,
    nKvHeads: shape.nKvHeads,
    headDim: shape.headDim,
    seqLen,
    bytesPerElem,
  });
  return (bytes / 1e9) * batch;
}

/** Total memory in GB: weights plus KV cache. */
export function totalGB(
  shape: ModelShape,
  precisionKey: PrecisionKey,
  seqLen: number,
  bytesPerElem: number,
  batch = 1,
): number {
  return weightGB(shape.params, precisionKey) + kvCacheGB(shape, seqLen, bytesPerElem, batch);
}

/** Does `total` GB fit within `vram` GB? */
export function fits(total: number, vramGB: number): boolean {
  return total <= vramGB;
}

/**
 * The field rule of thumb: an N-billion-parameter model needs roughly `N * 0.6`
 * GB once quantized to ~4 bits (Q4). `paramsB` is in BILLIONS (e.g. 7 → 4.2 GB).
 */
export function q4RuleGB(paramsB: number): number {
  return paramsB * 0.6;
}
