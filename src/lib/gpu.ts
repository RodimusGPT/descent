/**
 * gpu.ts — the shape of an inference accelerator and its memory hierarchy (spec 10.4).
 *
 * A GPU is many streaming multiprocessors (SMs), each packed with tensor cores,
 * fed by a steep memory hierarchy. The whole art of fast inference is keeping
 * those cores fed: HBM is vast but comparatively slow (~TB/s); on-chip SRAM is
 * tiny but ~10-30x faster; registers faster still. The higher (faster) the tier,
 * the smaller it is — that trade is the lesson the GpuFloorplan visual teaches.
 */

/** A representative datacenter GPU (H100-class numbers, rounded for teaching). */
export interface GpuSpec {
  /** Display name. */
  name: string;
  /** Streaming multiprocessors on the die. */
  sms: number;
  /** Tensor cores per SM (the dense-matmul units). */
  tensorCoresPerSm: number;
  /** High-bandwidth memory capacity, gigabytes. */
  hbmGB: number;
  /** HBM bandwidth in terabytes/second — the baseline every tier is measured against. */
  hbmBandwidthTBs: number;
  /** L2 cache, megabytes (shared across all SMs). */
  l2MB: number;
  /** Shared memory / SRAM available per SM, kilobytes. */
  smemKBPerSm: number;
}

/** The representative part the floorplan is drawn from. */
export const GPU_SPEC: GpuSpec = {
  name: 'H100 SXM',
  sms: 132,
  tensorCoresPerSm: 4,
  hbmGB: 80,
  hbmBandwidthTBs: 3.35,
  l2MB: 50,
  smemKBPerSm: 228,
};

/** Total tensor cores across the die. */
export function totalTensorCores(spec: GpuSpec = GPU_SPEC): number {
  return spec.sms * spec.tensorCoresPerSm;
}

/** One level of the on-chip memory hierarchy. */
export interface MemoryTier {
  /** Full tier name, e.g. "SRAM / shared". */
  name: string;
  /** Capacity of the tier, in bytes. */
  bytes: number;
  /**
   * Bandwidth relative to HBM. HBM is the 1x baseline; bigger means faster.
   * SRAM sits ~10-30x above HBM, registers higher still.
   */
  relSpeed: number;
  /** Approximate absolute bandwidth, terabytes/second (relSpeed x the HBM baseline). */
  bandwidthTBs: number;
  /** One-line teaching note about the size/speed trade. */
  blurb: string;
}

/**
 * The memory hierarchy, ordered from the BIGGEST/SLOWEST tier (HBM) up to the
 * SMALLEST/FASTEST (registers). Size strictly DECREASES and relative speed
 * strictly INCREASES as you climb — that monotonic inversion is the whole point.
 */
export const MEMORY_TIERS: readonly MemoryTier[] = [
  {
    name: 'HBM',
    bytes: GPU_SPEC.hbmGB * 1e9,
    relSpeed: 1,
    bandwidthTBs: GPU_SPEC.hbmBandwidthTBs,
    blurb: 'Vast off-chip pool — where the weights and KV cache live. GBs, but the slow road.',
  },
  {
    name: 'L2 cache',
    bytes: GPU_SPEC.l2MB * 1e6,
    relSpeed: 4,
    bandwidthTBs: Math.round(GPU_SPEC.hbmBandwidthTBs * 4 * 100) / 100,
    blurb: 'On-die cache shared by every SM. A few MB, several times HBM bandwidth.',
  },
  {
    name: 'SRAM / shared',
    bytes: GPU_SPEC.smemKBPerSm * 1e3,
    relSpeed: 20,
    bandwidthTBs: Math.round(GPU_SPEC.hbmBandwidthTBs * 20 * 100) / 100,
    blurb: '~10-30x faster than HBM, but KBs not GBs. FlashAttention lives here.',
  },
  {
    name: 'registers',
    bytes: 1e3,
    relSpeed: 100,
    bandwidthTBs: Math.round(GPU_SPEC.hbmBandwidthTBs * 100 * 100) / 100,
    blurb: 'The operands the math actually runs on. Fastest, smallest — the tip.',
  },
] as const;

/** The base of the pyramid: biggest, slowest tier. */
export function slowestTier(tiers: readonly MemoryTier[] = MEMORY_TIERS): MemoryTier {
  return tiers[0];
}

/** The tip of the pyramid: smallest, fastest tier. */
export function fastestTier(tiers: readonly MemoryTier[] = MEMORY_TIERS): MemoryTier {
  return tiers[tiers.length - 1];
}

/** Look a tier up by name. */
export function tierByName(
  name: string,
  tiers: readonly MemoryTier[] = MEMORY_TIERS,
): MemoryTier | undefined {
  return tiers.find((t) => t.name === name);
}

/**
 * Tiers ordered fastest-first (descending relative speed) — i.e. the climb from
 * the pyramid tip down to its base, the reverse of MEMORY_TIERS' storage order.
 */
export function tiersBySpeed(tiers: readonly MemoryTier[] = MEMORY_TIERS): MemoryTier[] {
  return [...tiers].sort((a, b) => b.relSpeed - a.relSpeed);
}

/**
 * Whether on-chip SRAM is dramatically faster than HBM (the "~10x faster" claim).
 * Defaults to checking for at least a 10x relative-speed gap.
 */
export function sramFasterThanHbm(
  factor = 10,
  tiers: readonly MemoryTier[] = MEMORY_TIERS,
): boolean {
  const hbm = tierByName('HBM', tiers);
  const sram = tierByName('SRAM / shared', tiers);
  if (!hbm || !sram) return false;
  return sram.relSpeed >= factor * hbm.relSpeed;
}
