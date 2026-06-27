import { describe, expect, it } from 'vitest';
import {
  flashHbmBytes,
  formatBytes,
  naiveHbmBytes,
  onlineSoftmax,
  onlineSoftmaxSteps,
  trafficRatio,
} from '../src/lib/flash';
import { softmax } from '../src/lib/nn';

const D = 64;
const BYTES = 2; // fp16

describe('naiveHbmBytes vs flashHbmBytes', () => {
  it('flash moves strictly less HBM traffic than naive for large n', () => {
    for (const n of [512, 1024, 4096, 16384]) {
      expect(flashHbmBytes(n, D, BYTES)).toBeLessThan(naiveHbmBytes(n, D, BYTES));
    }
  });

  it('both are zero for degenerate inputs', () => {
    expect(naiveHbmBytes(0, D, BYTES)).toBe(0);
    expect(flashHbmBytes(0, D, BYTES)).toBe(0);
    expect(naiveHbmBytes(1024, 0, BYTES)).toBe(0);
    expect(flashHbmBytes(1024, D, 0)).toBe(0);
  });

  it('scales linearly with bytes-per-element', () => {
    expect(naiveHbmBytes(1024, D, 4)).toBe(2 * naiveHbmBytes(1024, D, 2));
    expect(flashHbmBytes(1024, D, 4)).toBe(2 * flashHbmBytes(1024, D, 2));
  });
});

describe('growth rates', () => {
  // small head dim so the n^2 / n terms cleanly dominate the asymptotics
  const d = 8;

  it('naive grows ~quadratically: quadrupling n multiplies traffic ~16x', () => {
    const base = naiveHbmBytes(2048, d, BYTES);
    const quad = naiveHbmBytes(2048 * 4, d, BYTES);
    expect(quad / base).toBeCloseTo(16, 0.5);
  });

  it('flash grows ~linearly: quadrupling n multiplies traffic exactly 4x', () => {
    const base = flashHbmBytes(2048, d, BYTES);
    const quad = flashHbmBytes(2048 * 4, d, BYTES);
    expect(quad / base).toBeCloseTo(4, 1e-9);
  });

  it('the naive/flash ratio strictly increases with n', () => {
    const ns = [256, 512, 1024, 2048, 4096, 8192];
    const ratios = ns.map((n) => trafficRatio(n, D, BYTES));
    for (let i = 1; i < ratios.length; i++) {
      expect(ratios[i]).toBeGreaterThan(ratios[i - 1]);
    }
  });

  it('trafficRatio agrees with the two byte functions', () => {
    expect(trafficRatio(4096, D, BYTES)).toBeCloseTo(
      naiveHbmBytes(4096, D, BYTES) / flashHbmBytes(4096, D, BYTES),
      6,
    );
  });
});

describe('onlineSoftmax (streaming) matches plain softmax', () => {
  const cases: number[][] = [
    [1, 2, 3, 4],
    [0, 0, 0, 0],
    [-5, -1, -9, 2, 7],
    [10, 10.5, 9.9, 12, 8],
    [100, 101, 99, 102], // large values: stability matters
  ];

  it('produces the same probability vector as nn.softmax', () => {
    for (const values of cases) {
      const online = onlineSoftmax(values);
      const plain = softmax(values);
      expect(online.length).toBe(plain.length);
      for (let i = 0; i < plain.length; i++) {
        expect(online[i]).toBeCloseTo(plain[i], 12);
      }
    }
  });

  it('probabilities sum to 1', () => {
    for (const values of cases) {
      const sum = onlineSoftmax(values).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 12);
    }
  });

  it('empty input yields empty output', () => {
    expect(onlineSoftmax([])).toEqual([]);
    expect(onlineSoftmaxSteps([])).toEqual([]);
  });
});

describe('onlineSoftmaxSteps', () => {
  it('running max is non-decreasing and ends at the global max', () => {
    const values = [3, 1, 4, 1, 5, 9, 2, 6];
    const steps = onlineSoftmaxSteps(values);
    expect(steps.length).toBe(values.length);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].runningMax).toBeGreaterThanOrEqual(steps[i - 1].runningMax);
    }
    expect(steps[steps.length - 1].runningMax).toBe(Math.max(...values));
  });

  it('the final running sum is Σ exp(xᵢ − max), the softmax denominator', () => {
    const values = [2, 0, 1, 3];
    const max = Math.max(...values);
    const expected = values.reduce((acc, x) => acc + Math.exp(x - max), 0);
    const steps = onlineSoftmaxSteps(values);
    expect(steps[steps.length - 1].runningSum).toBeCloseTo(expected, 12);
  });
});

describe('formatBytes', () => {
  it('formats across unit boundaries', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe('5.0 GB');
  });
});
