import { describe, expect, it } from 'vitest';
import { flops, tileArithmeticIntensity, tileCount } from '../src/lib/gemm';

describe('flops', () => {
  it('is 2 * M * N * K', () => {
    expect(flops(2, 3, 4)).toBe(2 * 2 * 3 * 4);
    expect(flops(128, 128, 128)).toBe(2 * 128 * 128 * 128);
  });

  it('is zero when any dimension is zero', () => {
    expect(flops(0, 4, 4)).toBe(0);
    expect(flops(4, 0, 4)).toBe(0);
    expect(flops(4, 4, 0)).toBe(0);
  });

  it('scales linearly in each dimension', () => {
    const base = flops(8, 8, 8);
    expect(flops(16, 8, 8)).toBe(2 * base);
    expect(flops(8, 16, 8)).toBe(2 * base);
    expect(flops(8, 8, 16)).toBe(2 * base);
  });
});

describe('tileCount', () => {
  it('is ceil(M/T) * ceil(N/T) for divisible sizes', () => {
    expect(tileCount(128, 128, 64)).toBe(4);
    expect(tileCount(256, 128, 64)).toBe(8);
  });

  it('rounds up partial edge tiles (non-divisible)', () => {
    expect(tileCount(130, 128, 64)).toBe(3 * 2);
    expect(tileCount(100, 100, 64)).toBe(2 * 2);
    expect(tileCount(65, 65, 64)).toBe(2 * 2);
    expect(tileCount(64, 64, 64)).toBe(1);
  });

  it('a single tile covers a matrix no larger than the tile', () => {
    expect(tileCount(64, 64, 128)).toBe(1);
    expect(tileCount(1, 1, 16)).toBe(1);
  });

  it('returns 0 for a non-positive tile size', () => {
    expect(tileCount(64, 64, 0)).toBe(0);
    expect(tileCount(64, 64, -8)).toBe(0);
  });
});

describe('tileArithmeticIntensity', () => {
  it('is positive and finite', () => {
    const ai = tileArithmeticIntensity(64, 128, 2);
    expect(ai).toBeGreaterThan(0);
    expect(Number.isFinite(ai)).toBe(true);
  });

  it('strictly increases as the tile size T grows (K, bytes fixed)', () => {
    const K = 256;
    const bytes = 2;
    let prev = Number.NEGATIVE_INFINITY;
    for (const T of [8, 16, 32, 64, 128, 256]) {
      const ai = tileArithmeticIntensity(T, K, bytes);
      expect(ai).toBeGreaterThan(prev);
      prev = ai;
    }
  });

  it('is independent of K (reuse is what matters, not the contraction length)', () => {
    expect(tileArithmeticIntensity(64, 128, 2)).toBeCloseTo(tileArithmeticIntensity(64, 4096, 2));
  });

  it('rises as elements get narrower (FP8/FP4 vs FP16)', () => {
    const fp16 = tileArithmeticIntensity(64, 256, 2);
    const fp8 = tileArithmeticIntensity(64, 256, 1);
    const fp4 = tileArithmeticIntensity(64, 256, 0.5);
    expect(fp8).toBeGreaterThan(fp16);
    expect(fp4).toBeGreaterThan(fp8);
  });

  it('equals T / bytesPerElem', () => {
    expect(tileArithmeticIntensity(64, 999, 2)).toBeCloseTo(32);
    expect(tileArithmeticIntensity(128, 17, 1)).toBeCloseTo(128);
  });

  it('returns 0 for non-positive inputs', () => {
    expect(tileArithmeticIntensity(0, 128, 2)).toBe(0);
    expect(tileArithmeticIntensity(64, 0, 2)).toBe(0);
    expect(tileArithmeticIntensity(64, 128, 0)).toBe(0);
  });
});
