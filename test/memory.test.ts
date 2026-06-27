import { describe, expect, it } from 'vitest';
import { MODEL_PRESETS, kvCacheBytes, recomputeWork, weightBytes } from '../src/lib/memory';

describe('kvCacheBytes', () => {
  it('matches the hand-computed formula on a known case', () => {
    // 2 * 4 layers * 8 kvHeads * 16 headDim * 10 seqLen * 2 bytes
    //   = 2 * 4 * 8 * 16 * 10 * 2 = 20_480
    const bytes = kvCacheBytes({
      nLayers: 4,
      nKvHeads: 8,
      headDim: 16,
      seqLen: 10,
      bytesPerElem: 2,
    });
    expect(bytes).toBe(20_480);
  });

  it('GQA (nKvHeads=8) is exactly 4x smaller than MHA (nKvHeads=32)', () => {
    const common = { nLayers: 32, headDim: 128, seqLen: 4096, bytesPerElem: 2 };
    const mha = kvCacheBytes({ ...common, nKvHeads: 32 });
    const gqa = kvCacheBytes({ ...common, nKvHeads: 8 });
    expect(mha).toBe(gqa * 4);
  });

  it('scales linearly with sequence length', () => {
    const base = { nLayers: 8, nKvHeads: 4, headDim: 64, bytesPerElem: 2 };
    const a = kvCacheBytes({ ...base, seqLen: 100 });
    const b = kvCacheBytes({ ...base, seqLen: 200 });
    expect(b).toBe(a * 2);
  });
});

describe('MODEL_PRESETS', () => {
  it('includes an MHA and a GQA variant of the same model shape', () => {
    const mha = MODEL_PRESETS.find((p) => p.name === '7B · MHA');
    const gqa = MODEL_PRESETS.find((p) => p.name === '7B · GQA');
    expect(mha).toBeDefined();
    expect(gqa).toBeDefined();
    if (!mha || !gqa) return;
    // identical shape except for KV heads
    expect(gqa.nLayers).toBe(mha.nLayers);
    expect(gqa.headDim).toBe(mha.headDim);
    expect(gqa.nHeads).toBe(mha.nHeads);
    expect(mha.nKvHeads).toBeGreaterThan(gqa.nKvHeads);

    const seq = { seqLen: 8192, bytesPerElem: 2 };
    const mhaCache = kvCacheBytes({
      nLayers: mha.nLayers,
      nKvHeads: mha.nKvHeads,
      headDim: mha.headDim,
      ...seq,
    });
    const gqaCache = kvCacheBytes({
      nLayers: gqa.nLayers,
      nKvHeads: gqa.nKvHeads,
      headDim: gqa.headDim,
      ...seq,
    });
    expect(gqaCache).toBeLessThan(mhaCache);
  });
});

describe('weightBytes', () => {
  it('multiplies params by bytes-per-param', () => {
    expect(weightBytes(7_000_000_000, 2)).toBe(14_000_000_000);
    expect(weightBytes(1_000, 1)).toBe(1_000);
    expect(weightBytes(0, 4)).toBe(0);
  });
});

describe('recomputeWork', () => {
  it('cached cost is exactly n (O(n))', () => {
    expect(recomputeWork(1, true)).toBe(1);
    expect(recomputeWork(10, true)).toBe(10);
    expect(recomputeWork(100, true)).toBe(100);
  });

  it('uncached cost is the triangular number n*(n+1)/2 (O(n^2))', () => {
    expect(recomputeWork(1, false)).toBe(1);
    expect(recomputeWork(4, false)).toBe(10);
    expect(recomputeWork(10, false)).toBe(55);
  });

  it('the uncached/cached ratio grows with n, approaching (n+1)/2', () => {
    const ratio = (n: number) => recomputeWork(n, false) / recomputeWork(n, true);
    expect(ratio(10)).toBeGreaterThan(ratio(4));
    expect(ratio(100)).toBeGreaterThan(ratio(10));
    expect(ratio(10)).toBeCloseTo((10 + 1) / 2, 10);
  });

  it('is zero for n <= 0', () => {
    expect(recomputeWork(0, true)).toBe(0);
    expect(recomputeWork(0, false)).toBe(0);
    expect(recomputeWork(-5, false)).toBe(0);
  });
});
