import { describe, expect, it } from 'vitest';
import {
  DECODE_INTENSITY_PER_TOKEN,
  HARDWARE,
  PREFILL_TOKENS,
  arithmeticIntensity,
  attainableFlops,
  decodeIntensity,
  isMemoryBound,
  prefillIntensity,
  ridgeIntensity,
} from '../src/lib/roofline';

describe('arithmeticIntensity', () => {
  it('is flops divided by bytes', () => {
    expect(arithmeticIntensity(2000, 1000)).toBe(2);
    expect(arithmeticIntensity(1, 4)).toBe(0.25);
  });

  it('is 1 FLOP/byte when one MAC (2 FLOPs) rides on one fp16 weight (2 bytes)', () => {
    expect(arithmeticIntensity(2, 2)).toBe(1);
  });
});

describe('attainableFlops', () => {
  const peak = 1e15;
  const bw = 3.35e12;
  const ridge = ridgeIntensity(peak, bw);

  it('rides the sloped memory roof (ai * bw) below the ridge', () => {
    const ai = ridge / 4; // well below the ridge
    expect(attainableFlops(ai, peak, bw)).toBeCloseTo(ai * bw, 6);
    // and below the flat ceiling
    expect(attainableFlops(ai, peak, bw)).toBeLessThan(peak);
  });

  it('is clamped to the flat compute roof above the ridge', () => {
    const ai = ridge * 4; // well above the ridge
    expect(attainableFlops(ai, peak, bw)).toBe(peak);
  });

  it('equals exactly peak at the ridge point', () => {
    expect(attainableFlops(ridge, peak, bw)).toBeCloseTo(peak, 0);
  });
});

describe('ridgeIntensity', () => {
  it('is peak divided by bandwidth', () => {
    expect(ridgeIntensity(1e15, 3.35e12)).toBeCloseTo(1e15 / 3.35e12, 6);
  });

  it('for the HARDWARE preset lands at a few hundred FLOPs/byte', () => {
    const ridge = ridgeIntensity(HARDWARE.peakFlops, HARDWARE.bandwidthBytesPerSec);
    expect(ridge).toBeGreaterThan(100);
    expect(ridge).toBeLessThan(1000);
  });
});

describe('isMemoryBound', () => {
  const ridge = 300;

  it('is true strictly below the ridge', () => {
    expect(isMemoryBound(1, ridge)).toBe(true);
    expect(isMemoryBound(299.999, ridge)).toBe(true);
  });

  it('is false at or above the ridge', () => {
    expect(isMemoryBound(300, ridge)).toBe(false);
    expect(isMemoryBound(900, ridge)).toBe(false);
  });
});

describe('decodeIntensity', () => {
  it('strictly increases with batch size', () => {
    let prev = -1;
    for (const batch of [1, 2, 4, 8, 16, 32, 64, 128, 256, 512]) {
      const ai = decodeIntensity(batch);
      expect(ai).toBeGreaterThan(prev);
      prev = ai;
    }
  });

  it('is ~1 FLOP/byte at batch 1 (deep in the memory-bound region)', () => {
    expect(decodeIntensity(1)).toBe(DECODE_INTENSITY_PER_TOKEN);
    const ridge = ridgeIntensity(HARDWARE.peakFlops, HARDWARE.bandwidthBytesPerSec);
    expect(isMemoryBound(decodeIntensity(1), ridge)).toBe(true);
  });

  it('scales linearly: doubling the batch doubles the intensity', () => {
    expect(decodeIntensity(64)).toBeCloseTo(2 * decodeIntensity(32), 10);
  });

  it('crosses from memory-bound to compute-bound as the batch grows', () => {
    const ridge = ridgeIntensity(HARDWARE.peakFlops, HARDWARE.bandwidthBytesPerSec);
    // small batch is memory-bound, a large batch is compute-bound
    expect(isMemoryBound(decodeIntensity(1), ridge)).toBe(true);
    expect(isMemoryBound(decodeIntensity(1024), ridge)).toBe(false);

    // there is a single crossover batch where the bound flips and stays flipped
    let crossover = -1;
    let prevBound = true;
    for (let batch = 1; batch <= 1024; batch++) {
      const bound = isMemoryBound(decodeIntensity(batch), ridge);
      if (prevBound && !bound) crossover = batch;
      // once compute-bound, never memory-bound again (monotone)
      if (!prevBound) expect(bound).toBe(false);
      prevBound = bound;
    }
    expect(crossover).toBeGreaterThan(1);
    expect(crossover).toBeLessThan(1024);
    // just below the crossover is still memory-bound
    expect(isMemoryBound(decodeIntensity(crossover - 1), ridge)).toBe(true);
  });
});

describe('prefillIntensity', () => {
  it('is high enough to be compute-bound on the HARDWARE preset', () => {
    const ridge = ridgeIntensity(HARDWARE.peakFlops, HARDWARE.bandwidthBytesPerSec);
    expect(prefillIntensity()).toBe(PREFILL_TOKENS * DECODE_INTENSITY_PER_TOKEN);
    expect(isMemoryBound(prefillIntensity(), ridge)).toBe(false);
  });

  it('is far to the right of a batch-1 decode point', () => {
    expect(prefillIntensity()).toBeGreaterThan(decodeIntensity(1) * 100);
  });
});
