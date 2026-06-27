/**
 * gemm.ts — the arithmetic behind tiled matrix multiply (spec 10.4).
 *
 * Matrix multiply is the workhorse of a transformer: the Q/K/V projections, the
 * FFN, and the LM head are all GEMMs. On a GPU they run TILED on tensor cores,
 * which natively consume low-precision FP16/FP8/FP4. Each output tile is a small
 * dense matmul of a row-strip of A by a column-strip of B.
 *
 * The key lesson these pure functions teach is ARITHMETIC INTENSITY: a bigger
 * tile reuses every value it loads across more multiply-accumulates, so the ratio
 * of flops to bytes moved rises with tile size. That is why tensor cores want fat
 * tiles — it pushes the kernel off the memory wall toward compute-bound.
 *
 *   C[M×N] = A[M×K] · B[K×N]
 */

/**
 * Floating-point operations for a full GEMM C[M×N] = A[M×K] · B[K×N].
 *
 *   2 * M * N * K
 *
 * Each of the M*N outputs is a length-K dot product: K multiplies + K adds.
 */
export function flops(M: number, N: number, K: number): number {
  return 2 * M * N * K;
}

/**
 * Number of square output tiles tiling a C[M×N] matrix with tile side `T`.
 *
 *   ceil(M / T) * ceil(N / T)
 *
 * Non-divisible sizes round up — the edge tiles are partial but still launched.
 */
export function tileCount(M: number, N: number, T: number): number {
  if (T <= 0) return 0;
  return Math.ceil(M / T) * Math.ceil(N / T);
}

/**
 * Arithmetic intensity (flops per byte) of computing ONE output tile.
 *
 * One T×T output tile performs `2 * T * T * K` flops. To do so it streams a
 * T×K row-strip of A and a K×T column-strip of B — about `2 * T * K` elements,
 * or `2 * T * K * bytesPerElem` bytes.
 *
 *   AI = (2 * T * T * K) / (2 * T * K * bytesPerElem) = T / bytesPerElem
 *
 * So intensity rises LINEARLY with tile side T (each loaded value is reused
 * across more of the tile) and falls as elements get wider. Lower precision
 * (smaller `bytesPerElem`) also lifts it — the other reason tensor cores prefer
 * FP8/FP4.
 */
export function tileArithmeticIntensity(T: number, K: number, bytesPerElem: number): number {
  if (T <= 0 || K <= 0 || bytesPerElem <= 0) return 0;
  const tileFlops = 2 * T * T * K;
  const tileBytes = 2 * T * K * bytesPerElem;
  return tileFlops / tileBytes;
}
