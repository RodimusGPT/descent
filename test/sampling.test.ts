import { describe, expect, it } from 'vitest';
import { BASE_LOGITS, VOCAB, applySampling, sampleIndex } from '../src/lib/sampling';

const n = BASE_LOGITS.length;

function maxProb(probs: number[]): number {
  return Math.max(...probs);
}

function keptCount(kept: boolean[]): number {
  return kept.filter(Boolean).length;
}

describe('VOCAB', () => {
  it('has ~12 candidate tokens', () => {
    expect(VOCAB.length).toBeGreaterThanOrEqual(10);
    expect(VOCAB.length).toBeLessThanOrEqual(14);
    expect(BASE_LOGITS).toHaveLength(VOCAB.length);
  });
});

describe('temperature', () => {
  it('lower temperature yields a higher max probability', () => {
    const cold = applySampling(BASE_LOGITS, { temperature: 0.3, topK: n, topP: 1 });
    const hot = applySampling(BASE_LOGITS, { temperature: 1.5, topK: n, topP: 1 });
    expect(maxProb(cold.probs)).toBeGreaterThan(maxProb(hot.probs));
  });

  it('is monotonic in temperature (max prob decreases as T rises)', () => {
    const temps = [0.2, 0.5, 1.0, 1.6, 2.0];
    const maxes = temps.map((t) =>
      maxProb(applySampling(BASE_LOGITS, { temperature: t, topK: n, topP: 1 }).probs),
    );
    for (let i = 1; i < maxes.length; i++) {
      expect(maxes[i]).toBeLessThan(maxes[i - 1]);
    }
  });
});

describe('top-k', () => {
  it('keeps exactly min(k, n) entries when top-p does not truncate', () => {
    for (const k of [1, 3, 5, n, n + 5]) {
      const { kept } = applySampling(BASE_LOGITS, { temperature: 1, topK: k, topP: 1 });
      expect(keptCount(kept)).toBe(Math.min(k, n));
    }
  });

  it('keeps the k highest-probability entries', () => {
    const { kept } = applySampling(BASE_LOGITS, { temperature: 1, topK: 2, topP: 1 });
    // Highest base logits are indices 0 and 1.
    expect(kept[0]).toBe(true);
    expect(kept[1]).toBe(true);
    expect(keptCount(kept)).toBe(2);
  });
});

describe('top-p / nucleus', () => {
  it('keeps the minimal set whose cumulative probability ≥ p', () => {
    // Construct an easy distribution: softmax of these gives ~[0.5,0.3,0.2] style mass.
    const logits = [Math.log(0.5), Math.log(0.3), Math.log(0.2)];
    const { kept } = applySampling(logits, { temperature: 1, topK: 3, topP: 0.7 });
    // Sorted desc: 0.5, 0.3 -> cumulative 0.8 ≥ 0.7 reached at the 2nd entry.
    expect(keptCount(kept)).toBe(2);
    expect(kept[0]).toBe(true);
    expect(kept[1]).toBe(true);
    expect(kept[2]).toBe(false);
  });

  it('keeps only the single top entry when its mass already ≥ p', () => {
    const logits = [Math.log(0.6), Math.log(0.25), Math.log(0.15)];
    const { kept } = applySampling(logits, { temperature: 1, topK: 3, topP: 0.5 });
    expect(keptCount(kept)).toBe(1);
    expect(kept[0]).toBe(true);
  });
});

describe('renormalization', () => {
  it('probs sum to 1 over kept entries', () => {
    const cases = [
      { temperature: 0.7, topK: 4, topP: 0.9 },
      { temperature: 1.0, topK: 1, topP: 1.0 },
      { temperature: 1.8, topK: n, topP: 0.5 },
    ];
    for (const opts of cases) {
      const { probs } = applySampling(BASE_LOGITS, opts);
      const total = probs.reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 10);
    }
  });

  it('zeros out filtered entries', () => {
    const { probs, kept } = applySampling(BASE_LOGITS, { temperature: 1, topK: 2, topP: 1 });
    for (let i = 0; i < n; i++) {
      if (!kept[i]) expect(probs[i]).toBe(0);
    }
  });
});

describe('sampleIndex', () => {
  it('rng = () => 0 returns the first kept index', () => {
    const { probs } = applySampling(BASE_LOGITS, { temperature: 1, topK: 3, topP: 1 });
    expect(sampleIndex(probs, () => 0)).toBe(0);
  });

  it('lands in the expected bucket for a fixed draw', () => {
    const probs = [0.5, 0.3, 0.2];
    expect(sampleIndex(probs, () => 0.6)).toBe(1); // 0.5..0.8 bucket
    expect(sampleIndex(probs, () => 0.9)).toBe(2); // 0.8..1.0 bucket
    expect(sampleIndex(probs, () => 0.4)).toBe(0); // 0.0..0.5 bucket
  });

  it('never returns a zero-probability index for an interior draw', () => {
    const probs = [0, 0.7, 0, 0.3, 0];
    expect(sampleIndex(probs, () => 0.1)).toBe(1);
    expect(sampleIndex(probs, () => 0.9)).toBe(3);
  });
});
