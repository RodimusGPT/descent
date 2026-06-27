import { describe, expect, it } from 'vitest';
import {
  GPU_PRESETS,
  MODEL_SHAPES,
  fits,
  kvCacheGB,
  q4RuleGB,
  totalGB,
  weightGB,
} from '../src/lib/budget';

describe('weightGB', () => {
  it('a 7B model is 14 GB at FP16 and 3.5 GB at Q4', () => {
    expect(weightGB(7e9, 'FP16')).toBe(14);
    expect(weightGB(7e9, 'Q4')).toBe(3.5);
  });

  it('scales with bytes-per-param across precisions', () => {
    expect(weightGB(7e9, 'INT8')).toBe(7);
    expect(weightGB(7e9, 'Q2')).toBe(1.75);
  });

  it('is zero for zero params', () => {
    expect(weightGB(0, 'FP16')).toBe(0);
  });
});

describe('q4RuleGB', () => {
  it('matches the "size_B x 0.6" rule of thumb', () => {
    expect(q4RuleGB(7)).toBeCloseTo(4.2, 10);
    expect(q4RuleGB(70)).toBeCloseTo(42, 10);
    expect(q4RuleGB(0)).toBe(0);
  });
});

describe('kvCacheGB', () => {
  const shape = { nLayers: 32, nKvHeads: 8, headDim: 128 };

  it('grows monotonically with sequence length', () => {
    let prev = -1;
    for (const seqLen of [128, 512, 2048, 8192, 32768]) {
      const gb = kvCacheGB(shape, seqLen, 2);
      expect(gb).toBeGreaterThan(prev);
      prev = gb;
    }
  });

  it('scales linearly with seqLen and with batch', () => {
    const a = kvCacheGB(shape, 1000, 2, 1);
    const b = kvCacheGB(shape, 2000, 2, 1);
    expect(b).toBeCloseTo(a * 2, 10);
    const batched = kvCacheGB(shape, 1000, 2, 4);
    expect(batched).toBeCloseTo(a * 4, 10);
  });

  it('matches the decimal-GB conversion of the byte formula', () => {
    // 2 * 32 * 8 * 128 * 1000 * 2 bytes = 131_072_000 bytes -> 0.131072 GB
    expect(kvCacheGB(shape, 1000, 2)).toBeCloseTo(0.131072, 10);
  });
});

describe('fits', () => {
  it('is true at or below capacity and false above it', () => {
    expect(fits(3.5, 8)).toBe(true);
    expect(fits(8, 8)).toBe(true); // exactly at the boundary fits
    expect(fits(8.0001, 8)).toBe(false);
    expect(fits(40, 24)).toBe(false);
    expect(fits(40, 80)).toBe(true);
  });
});

describe('totalGB', () => {
  const shape = MODEL_SHAPES.find((s) => s.label === '7B');

  it('equals weights plus KV cache', () => {
    if (!shape) throw new Error('missing 7B shape');
    const w = weightGB(shape.params, 'Q4');
    const kv = kvCacheGB(shape, 4096, 2);
    expect(totalGB(shape, 'Q4', 4096, 2)).toBeCloseTo(w + kv, 10);
  });

  it('increases with context length (more KV) at fixed weights', () => {
    if (!shape) throw new Error('missing 7B shape');
    const short = totalGB(shape, 'Q4', 1024, 2);
    const long = totalGB(shape, 'Q4', 16384, 2);
    expect(long).toBeGreaterThan(short);
  });
});

describe('GPU_PRESETS', () => {
  it('includes a consumer, datacenter, and large unified-memory tier', () => {
    const min = Math.min(...GPU_PRESETS.map((g) => g.vramGB));
    const max = Math.max(...GPU_PRESETS.map((g) => g.vramGB));
    expect(min).toBeLessThanOrEqual(24); // consumer card
    expect(GPU_PRESETS.some((g) => g.vramGB >= 80)).toBe(true); // datacenter
    expect(max).toBeGreaterThanOrEqual(128); // unified-memory machine
  });
});
