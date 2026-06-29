/**
 * accelerators.ts — the current inference-accelerator landscape.
 *
 * Two numbers decide almost everything about running a model on a given chip:
 *   - memory CAPACITY (GB): does the model + its KV cache fit at all?
 *   - memory BANDWIDTH (TB/s): how fast can it decode? Decode is memory-bound, so
 *     tokens/sec ≈ bandwidth ÷ bytes-read-per-token — the site's core law (Part 4).
 *
 * This is the field as of ~mid-2026. Numbers are ILLUSTRATIVE, drawn from public
 * vendor specs (nvidia.com, AMD Instinct briefs, Google "Ironwood" blog, Apple) —
 * not benchmarks. Refresh the landscape by editing this one file.
 */

export type AcceleratorKind = 'datacenter' | 'consumer' | 'local' | 'specialized';

/** An HBM/unified-memory accelerator, plottable on the capacity × bandwidth plane. */
export interface Accelerator {
  /** Display name. */
  name: string;
  /** Maker. */
  vendor: string;
  /** Memory capacity in GB (HBM or unified). */
  memGB: number;
  /** Memory bandwidth in TB/s — the decode-throughput ceiling. */
  bandwidthTBs: number;
  /** Class of hardware. */
  kind: AcceleratorKind;
  /** One-line note. */
  note: string;
}

/**
 * The HBM / unified-memory field, ~mid-2026. Capacity decides what FITS;
 * bandwidth decides how FAST it decodes. Ordered by bandwidth so the plane reads
 * sensibly.
 */
export const ACCELERATORS: readonly Accelerator[] = [
  {
    name: 'M3 Ultra',
    vendor: 'Apple',
    memGB: 256,
    bandwidthTBs: 0.8,
    kind: 'local',
    note: 'vast unified memory, slow — runs huge models locally',
  },
  {
    name: 'RTX 5090',
    vendor: 'NVIDIA',
    memGB: 32,
    bandwidthTBs: 1.8,
    kind: 'consumer',
    note: 'top consumer card',
  },
  {
    name: 'H100',
    vendor: 'NVIDIA',
    memGB: 80,
    bandwidthTBs: 3.35,
    kind: 'datacenter',
    note: 'the workhorse baseline',
  },
  {
    name: 'H200',
    vendor: 'NVIDIA',
    memGB: 141,
    bandwidthTBs: 4.8,
    kind: 'datacenter',
    note: 'Hopper + bigger, faster HBM3e',
  },
  {
    name: 'Trainium3',
    vendor: 'AWS',
    memGB: 144,
    bandwidthTBs: 4.9,
    kind: 'datacenter',
    note: '3nm; Anthropic-scale clusters',
  },
  {
    name: 'MI300X',
    vendor: 'AMD',
    memGB: 192,
    bandwidthTBs: 5.3,
    kind: 'datacenter',
    note: 'big HBM early',
  },
  {
    name: 'TPU v7',
    vendor: 'Google',
    memGB: 192,
    bandwidthTBs: 7.4,
    kind: 'datacenter',
    note: 'first inference-first TPU (Ironwood)',
  },
  {
    name: 'B200',
    vendor: 'NVIDIA',
    memGB: 192,
    bandwidthTBs: 8.0,
    kind: 'datacenter',
    note: 'Blackwell; native FP4',
  },
  {
    name: 'MI355X',
    vendor: 'AMD',
    memGB: 288,
    bandwidthTBs: 8.0,
    kind: 'datacenter',
    note: 'CDNA4; MXFP4/6',
  },
  {
    name: 'B300',
    vendor: 'NVIDIA',
    memGB: 288,
    bandwidthTBs: 8.0,
    kind: 'datacenter',
    note: 'Blackwell Ultra; reasoning-scale',
  },
] as const;

/**
 * The SRAM / wafer-scale OUTLIERS — a different bet entirely: tiny on-chip memory
 * (no HBM), but enormous on-chip bandwidth, giving blistering single-stream speed.
 * They don't belong on the capacity × bandwidth plane (their "memory" is a few
 * hundred MB of SRAM spread across many chips), so they're called out separately.
 */
export const SRAM_OUTLIERS: readonly { name: string; vendor: string; note: string }[] = [
  { name: 'Groq LPU', vendor: 'Groq', note: 'SRAM-only, deterministic dataflow — lowest latency' },
  {
    name: 'Cerebras WSE-3',
    vendor: 'Cerebras',
    note: 'wafer-scale SRAM — thousands of tok/s on big models',
  },
] as const;

/** Bytes read per decoded token: activeParamsB (billions) × bytes-per-parameter. */
export function bytesPerToken(activeParamsB: number, bytesPerParam: number): number {
  return activeParamsB * 1e9 * bytesPerParam;
}

/**
 * Decode-throughput ceiling (tokens/sec), memory-bound:
 *   tokPerSec ≈ bandwidth(bytes/s) ÷ bytesPerToken
 * Higher bandwidth → more tokens/sec; more bytes per token → fewer. Returns 0 for
 * a non-positive byte cost.
 */
export function decodeTokPerSec(bandwidthTBs: number, bytesPerTokenValue: number): number {
  if (bytesPerTokenValue <= 0) return 0;
  return (bandwidthTBs * 1e12) / bytesPerTokenValue;
}

/** Does a model of `weightGB` (+ headroom) fit in a chip's `memGB`? */
export function fitsInMemory(weightGB: number, memGB: number): boolean {
  return weightGB <= memGB;
}

/** A decode-precision option: bytes per weight sets both footprint and bytes/token. */
export interface DecodePrecision {
  key: string;
  label: string;
  bytesPerParam: number;
}

/** The precisions a decode workload is commonly run at, coarsest last. */
export const DECODE_PRECISIONS: readonly DecodePrecision[] = [
  { key: 'fp16', label: 'FP16', bytesPerParam: 2 },
  { key: 'fp8', label: 'FP8', bytesPerParam: 1 },
  { key: 'fp4', label: 'FP4', bytesPerParam: 0.5 },
] as const;

/** One accelerator's decode result for a given workload. */
export interface ChipThroughput {
  accel: Accelerator;
  /** Memory-bound decode ceiling in tokens/sec. */
  tokPerSec: number;
  /** Whether the model's weights fit this chip's memory. */
  fits: boolean;
}

/**
 * Decode throughput (tokens/sec) for EVERY accelerator on one workload, sorted
 * fastest-first. A model with `paramsB` total / `activeParamsB` read per token at
 * `bytesPerParam`:
 *   - weighs   paramsB × bytesPerParam GB        (decimal GB; sets `fits`)
 *   - reads    activeParamsB × bytesPerParam GB   per token
 *   - decodes  bandwidth ÷ bytes-per-token        tokens/sec
 * MoE models (activeParamsB ≪ paramsB) decode fast yet still need capacity for the
 * full weights — which is exactly what `fits` surfaces.
 */
export function throughputAcrossChips(
  paramsB: number,
  activeParamsB: number,
  bytesPerParam: number,
): ChipThroughput[] {
  const weightGB = paramsB * bytesPerParam;
  const bpt = bytesPerToken(activeParamsB, bytesPerParam);
  return ACCELERATORS.map((accel) => ({
    accel,
    tokPerSec: decodeTokPerSec(accel.bandwidthTBs, bpt),
    fits: fitsInMemory(weightGB, accel.memGB),
  })).sort((a, b) => b.tokPerSec - a.tokPerSec);
}
