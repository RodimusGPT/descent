import { describe, expect, it } from 'vitest';
import {
  argmax,
  cosineSimilarity,
  dot,
  magnitude,
  scaledScores,
  softmax,
  softmaxWithTemperature,
} from '../src/lib/nn';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('softmax', () => {
  it('returns a probability distribution summing to 1', () => {
    const p = softmax([1, 2, 3]);
    expect(sum(p)).toBeCloseTo(1, 12);
    expect(p.every((x) => x >= 0 && x <= 1)).toBe(true);
  });
  it('is order-preserving (larger logit → larger probability)', () => {
    const p = softmax([0, 1, 2, 5]);
    expect(p[0]).toBeLessThan(p[1]);
    expect(p[1]).toBeLessThan(p[2]);
    expect(p[2]).toBeLessThan(p[3]);
  });
  it('is numerically stable for large logits', () => {
    const p = softmax([1000, 1001, 1002]);
    expect(sum(p)).toBeCloseTo(1, 12);
    expect(p.every((x) => Number.isFinite(x))).toBe(true);
  });
  it('handles the empty vector', () => {
    expect(softmax([])).toEqual([]);
  });
});

describe('softmaxWithTemperature', () => {
  it('matches plain softmax at T=1', () => {
    const logits = [0, 1, 2];
    const a = softmax(logits);
    const b = softmaxWithTemperature(logits, 1);
    for (let i = 0; i < a.length; i++) expect(b[i]).toBeCloseTo(a[i], 12);
  });
  it('low temperature sharpens toward the argmax', () => {
    const cold = softmaxWithTemperature([0, 1, 2], 0.2);
    const warm = softmaxWithTemperature([0, 1, 2], 2);
    expect(Math.max(...cold)).toBeGreaterThan(Math.max(...warm));
  });
  it('high temperature flattens toward uniform', () => {
    const hot = softmaxWithTemperature([0, 1, 2], 100);
    for (const x of hot) expect(x).toBeCloseTo(1 / 3, 1);
  });
});

describe('argmax', () => {
  it('finds the max index, first on ties', () => {
    expect(argmax([1, 9, 3])).toBe(1);
    expect(argmax([5, 5, 2])).toBe(0);
    expect(argmax([])).toBe(-1);
  });
});

describe('dot / magnitude / cosineSimilarity', () => {
  it('dot product', () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
  });
  it('magnitude', () => {
    expect(magnitude([3, 4])).toBe(5);
  });
  it('cosine: identical = 1, orthogonal = 0, opposite = -1', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 12);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 12);
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1, 12);
  });
  it('cosine with a zero vector is 0 (no NaN)', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('scaledScores', () => {
  it('divides q·k by sqrt(d)', () => {
    // q·k = 1*1 + 1*1 = 2, d = 2, score = 2/sqrt(2) = sqrt(2)
    expect(scaledScores([1, 1], [[1, 1]])[0]).toBeCloseTo(Math.SQRT2, 12);
  });
  it('returns one score per key', () => {
    expect(
      scaledScores(
        [1, 0],
        [
          [1, 0],
          [0, 1],
          [1, 1],
        ],
      ),
    ).toHaveLength(3);
  });
});
