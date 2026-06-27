/**
 * blockscale.ts — illustrative MXFP4 / NVFP4 block-scaling model (spec 10.2 / 9.3).
 *
 * Pure, deterministic helpers backing the BlockScaling interactive. Low-bit
 * formats like MXFP4/NVFP4 do not store one global scale for an entire tensor.
 * Instead they cut the tensor into fixed-size BLOCKS (32 values for MXFP4) and
 * give each block its OWN shared scale. A block's scale tracks the LOCAL
 * magnitude, so when magnitudes vary wildly across a tensor — some regions huge,
 * some tiny — a per-block scale wastes far fewer of its few precious levels than
 * a single per-tensor scale, and quantization error drops.
 *
 * Every number here is an ILLUSTRATIVE teaching device, not a benchmark.
 */

/** Real MXFP4 shares one scale across this many values. */
export const BLOCK_SIZE = 32;

/**
 * mulberry32 — a tiny, fast, deterministic 32-bit PRNG. Same seed always yields
 * the same sequence, so generated distributions are reproducible across runs
 * (NO Math.random anywhere in this module).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Number of symmetric quantization steps either side of zero for `bits`. */
function maxQuantLevel(bits: number): number {
  // Symmetric signed quantization: values map to integers in [-q, q].
  return 2 ** (bits - 1) - 1;
}

/**
 * Quantize a slice of `values` symmetrically around zero using a single shared
 * `scale`. Each value snaps to scale × round(v / scale), clamped to ±q·scale.
 * Returns the snapped values. A zero scale (all-zero block) is an identity.
 */
function quantizeWithScale(values: number[], scale: number, bits: number): number[] {
  const q = maxQuantLevel(bits);
  if (scale === 0 || q === 0) return values.map(() => 0);
  return values.map((v) => {
    let idx = Math.round(v / scale);
    if (idx > q) idx = q;
    if (idx < -q) idx = -q;
    return idx * scale;
  });
}

/** The shared scale for a slice: its largest magnitude spread over the levels. */
function scaleFor(values: number[], bits: number): number {
  const q = maxQuantLevel(bits);
  let maxAbs = 0;
  for (const v of values) {
    const a = Math.abs(v);
    if (a > maxAbs) maxAbs = a;
  }
  return q === 0 ? 0 : maxAbs / q;
}

/** Mean absolute error between two equal-length arrays. */
function meanAbs(a: number[], b: number[]): number {
  if (a.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/** How many blocks of `blockSize` cover `n` values. */
export function blockCount(n: number, blockSize: number): number {
  if (blockSize <= 0) return 0;
  return Math.ceil(n / blockSize);
}

/**
 * Quantize every value against ONE global scale derived from the whole tensor's
 * largest magnitude. A single far-out value forces a coarse scale everywhere, so
 * small values in quiet regions get crushed toward zero.
 */
export function quantizePerTensor(
  values: number[],
  bits: number,
): { scale: number; quantized: number[]; error: number } {
  if (values.length === 0) return { scale: 0, quantized: [], error: 0 };
  const scale = scaleFor(values, bits);
  const quantized = quantizeWithScale(values, scale, bits);
  return { scale, quantized, error: meanAbs(values, quantized) };
}

/**
 * Quantize in fixed-size blocks, each with its OWN local scale. Quiet blocks get
 * a fine scale, loud blocks a coarse one, so error tracks local magnitude and is
 * lower than per-tensor whenever magnitudes vary across the tensor.
 */
export function quantizePerBlock(
  values: number[],
  blockSize: number,
  bits: number,
): { scales: number[]; quantized: number[]; error: number } {
  if (values.length === 0) return { scales: [], quantized: [], error: 0 };
  const scales: number[] = [];
  const quantized: number[] = new Array(values.length);
  for (let start = 0; start < values.length; start += blockSize) {
    const block = values.slice(start, start + blockSize);
    const scale = scaleFor(block, bits);
    scales.push(scale);
    const qBlock = quantizeWithScale(block, scale, bits);
    for (let j = 0; j < qBlock.length; j++) quantized[start + j] = qBlock[j];
  }
  return { scales, quantized, error: meanAbs(values, quantized) };
}

/**
 * Deterministically generate a tensor whose magnitude VARIES sharply from block
 * to block: each block draws a per-block magnitude (some near tiny, some large),
 * then fills with roughly-normal noise at that magnitude. This is exactly the
 * regime where one global scale is wasteful and block scaling shines.
 */
export function generateVaryingSample(blocks = 4, blockSize = 8, seed = 0x5eed1234): number[] {
  const rand = mulberry32(seed);
  const out: number[] = [];
  for (let b = 0; b < blocks; b++) {
    // Per-block magnitude swings across a wide range (~0.02 .. ~2.0).
    const magnitude = 0.02 + rand() ** 3 * 2.0;
    for (let i = 0; i < blockSize; i++) {
      // Box–Muller standard normal, scaled by the block magnitude.
      const u1 = Math.max(rand(), 1e-12);
      const u2 = rand();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      out.push(z * magnitude);
    }
  }
  return out;
}
