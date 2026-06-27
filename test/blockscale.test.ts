import { describe, expect, it } from 'vitest';
import {
  BLOCK_SIZE,
  blockCount,
  generateVaryingSample,
  quantizePerBlock,
  quantizePerTensor,
} from '../src/lib/blockscale';

describe('BLOCK_SIZE', () => {
  it('is 32 (real MXFP4 block size)', () => {
    expect(BLOCK_SIZE).toBe(32);
  });
});

describe('blockCount', () => {
  it('is ceil(n / blockSize)', () => {
    expect(blockCount(64, 32)).toBe(2);
    expect(blockCount(65, 32)).toBe(3);
    expect(blockCount(32, 8)).toBe(4);
    expect(blockCount(31, 8)).toBe(4);
    expect(blockCount(0, 8)).toBe(0);
  });
});

describe('generateVaryingSample — deterministic', () => {
  it('same seed yields identical arrays', () => {
    const a = generateVaryingSample(4, 8, 123);
    const b = generateVaryingSample(4, 8, 123);
    expect(a).toEqual(b);
  });

  it('different seeds yield different arrays', () => {
    const a = generateVaryingSample(4, 8, 1);
    const b = generateVaryingSample(4, 8, 2);
    expect(a).not.toEqual(b);
  });

  it('produces blocks * blockSize values', () => {
    expect(generateVaryingSample(4, 8, 1)).toHaveLength(32);
    expect(generateVaryingSample(5, 32, 1)).toHaveLength(160);
  });

  it('magnitudes vary across blocks', () => {
    const values = generateVaryingSample(8, 8, 7);
    const blockMaxes: number[] = [];
    for (let b = 0; b < 8; b++) {
      let m = 0;
      for (let i = 0; i < 8; i++) m = Math.max(m, Math.abs(values[b * 8 + i]));
      blockMaxes.push(m);
    }
    const lo = Math.min(...blockMaxes);
    const hi = Math.max(...blockMaxes);
    // A clear spread: loudest block is several times the quietest.
    expect(hi / lo).toBeGreaterThan(3);
  });
});

describe('scale counts', () => {
  const values = generateVaryingSample(4, 8, 42);

  it('per-tensor uses exactly one scale', () => {
    const { scale } = quantizePerTensor(values, 4);
    expect(typeof scale).toBe('number');
  });

  it('per-block uses ceil(n / blockSize) scales', () => {
    const { scales } = quantizePerBlock(values, 8, 4);
    expect(scales).toHaveLength(blockCount(values.length, 8));
    expect(scales).toHaveLength(4);
  });

  it('per-block scale count tracks blockSize', () => {
    const { scales } = quantizePerBlock(values, BLOCK_SIZE, 4);
    expect(scales).toHaveLength(blockCount(values.length, BLOCK_SIZE));
  });
});

describe('quantization level counts', () => {
  const values = generateVaryingSample(4, 8, 9);

  it('per-tensor snaps to at most 2^bits levels', () => {
    const { quantized } = quantizePerTensor(values, 4);
    // 4-bit symmetric: indices in [-7, 7] -> at most 15 distinct levels.
    expect(new Set(quantized).size).toBeLessThanOrEqual(15);
  });

  it('per-block snaps each block to at most 2^bits levels', () => {
    const { quantized } = quantizePerBlock(values, 8, 4);
    for (let b = 0; b < 4; b++) {
      const block = quantized.slice(b * 8, b * 8 + 8);
      expect(new Set(block).size).toBeLessThanOrEqual(15);
    }
  });
});

describe('per-block beats per-tensor on varying magnitudes', () => {
  it('per-block error is strictly lower (4-bit)', () => {
    const values = generateVaryingSample(4, 8, 42);
    const tensor = quantizePerTensor(values, 4);
    const block = quantizePerBlock(values, 8, 4);
    expect(block.error).toBeLessThan(tensor.error);
  });

  it('holds across several seeds and at the real block size', () => {
    for (const seed of [1, 2, 3, 7, 99, 12345]) {
      const values = generateVaryingSample(6, BLOCK_SIZE, seed);
      const tensor = quantizePerTensor(values, 4);
      const block = quantizePerBlock(values, BLOCK_SIZE, 4);
      expect(block.error).toBeLessThan(tensor.error);
    }
  });

  it('holds at other bit widths', () => {
    const values = generateVaryingSample(8, 8, 5);
    for (const bits of [2, 3, 4, 8]) {
      const tensor = quantizePerTensor(values, bits);
      const block = quantizePerBlock(values, 8, bits);
      expect(block.error).toBeLessThan(tensor.error);
    }
  });
});

describe('deterministic quantization', () => {
  it('same input yields same output', () => {
    const values = generateVaryingSample(4, 8, 3);
    const a = quantizePerBlock(values, 8, 4);
    const b = quantizePerBlock(values, 8, 4);
    expect(a).toEqual(b);
  });

  it('handles empty input', () => {
    expect(quantizePerTensor([], 4)).toEqual({ scale: 0, quantized: [], error: 0 });
    expect(quantizePerBlock([], 8, 4)).toEqual({ scales: [], quantized: [], error: 0 });
  });
});
