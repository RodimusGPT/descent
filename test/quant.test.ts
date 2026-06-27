import { describe, expect, it } from 'vitest';
import {
  PARAM_PRESETS,
  PRECISIONS,
  type PrecisionKey,
  bucketHistogram,
  generateWeights,
  meanAbsError,
  modelSizeBytes,
  qualityProxy,
  quantize,
} from '../src/lib/quant';

const ORDER: PrecisionKey[] = ['FP16', 'INT8', 'Q4', 'Q2'];

describe('quantize — distinct level counts', () => {
  const values = generateWeights(2000);

  it('Q2 produces at most 4 distinct levels', () => {
    const { quantized } = quantize(values, 'Q2');
    expect(new Set(quantized).size).toBeLessThanOrEqual(4);
  });

  it('Q4 produces at most 16 distinct levels', () => {
    const { quantized } = quantize(values, 'Q4');
    expect(new Set(quantized).size).toBeLessThanOrEqual(16);
  });

  it('INT8 produces at most 256 distinct levels', () => {
    const { quantized } = quantize(values, 'INT8');
    expect(new Set(quantized).size).toBeLessThanOrEqual(256);
  });

  it('exposes the full level array for the precision', () => {
    expect(quantize(values, 'Q2').levels).toHaveLength(4);
    expect(quantize(values, 'Q4').levels).toHaveLength(16);
  });
});

describe('modelSizeBytes', () => {
  it('7e9 params FP16 -> 14e9 bytes', () => {
    expect(modelSizeBytes(7e9, 'FP16')).toBe(14e9);
  });

  it('7e9 params Q4 -> 3.5e9 bytes', () => {
    expect(modelSizeBytes(7e9, 'Q4')).toBe(3.5e9);
  });

  it('7e9 params INT8 -> 7e9 bytes; Q2 -> 1.75e9 bytes', () => {
    expect(modelSizeBytes(7e9, 'INT8')).toBe(7e9);
    expect(modelSizeBytes(7e9, 'Q2')).toBe(1.75e9);
  });

  it('exposes the standard presets', () => {
    const keys = PARAM_PRESETS.map((p) => p.key);
    expect(keys).toContain('7B');
    expect(keys).toContain('70B');
  });
});

describe('quantization error monotonicity', () => {
  const values = generateWeights(3000);

  it('mean error increases as bits drop', () => {
    const errs = ORDER.map((k) => meanAbsError(values, k));
    for (let i = 1; i < errs.length; i++) {
      expect(errs[i]).toBeGreaterThan(errs[i - 1]);
    }
  });
});

describe('qualityProxy', () => {
  const values = generateWeights(3000);

  it('decreases monotonically as bits drop', () => {
    const scores = ORDER.map((k) => qualityProxy(values, k));
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThan(scores[i - 1]);
    }
  });

  it('stays within [0, 100]', () => {
    for (const k of ORDER) {
      const s = qualityProxy(values, k);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });
});

describe('seeded generator determinism', () => {
  it('same seed -> identical array', () => {
    expect(generateWeights(500, 123)).toEqual(generateWeights(500, 123));
  });

  it('different seeds -> different arrays', () => {
    expect(generateWeights(500, 1)).not.toEqual(generateWeights(500, 2));
  });
});

describe('bucketHistogram', () => {
  it('counts sum to the input length', () => {
    const values = generateWeights(1000);
    const hist = bucketHistogram(values, 24);
    expect(hist).toHaveLength(24);
    expect(hist.reduce((a, b) => a + b, 0)).toBe(1000);
  });
});

describe('PRECISIONS metadata', () => {
  it('has the four ordered levels with expected bytesPerParam', () => {
    expect(PRECISIONS.map((p) => p.key)).toEqual(ORDER);
    expect(PRECISIONS.find((p) => p.key === 'FP16')?.bytesPerParam).toBe(2);
    expect(PRECISIONS.find((p) => p.key === 'Q2')?.bytesPerParam).toBe(0.25);
  });
});
