import { describe, expect, it } from 'vitest';
import { STRATEGIES, type StrategyKey, pipelineBubbleFraction } from '../src/lib/parallelism';

describe('STRATEGIES', () => {
  it('has exactly three entries: tp, pp, ep', () => {
    expect(STRATEGIES).toHaveLength(3);
    expect(STRATEGIES.map((s) => s.key)).toEqual(['tp', 'pp', 'ep']);
  });

  it('has a unique key per strategy', () => {
    const keys = new Set<StrategyKey>(STRATEGIES.map((s) => s.key));
    expect(keys.size).toBe(3);
  });

  it('uses the right collective op per strategy', () => {
    const byKey = new Map(STRATEGIES.map((s) => [s.key, s]));
    expect(byKey.get('tp')?.commOp).toBe('all-reduce');
    expect(byKey.get('pp')?.commOp).toBe('point-to-point');
    expect(byKey.get('ep')?.commOp).toBe('all-to-all');
  });

  it('has non-empty descriptive fields on every strategy', () => {
    for (const s of STRATEGIES) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.splits.length).toBeGreaterThan(0);
      expect(s.boundBy.length).toBeGreaterThan(0);
      expect(s.note.length).toBeGreaterThan(0);
    }
  });
});

describe('pipelineBubbleFraction', () => {
  it('matches the closed form (s-1)/(m+s-1)', () => {
    for (const s of [1, 2, 4, 8, 16]) {
      for (const m of [1, 2, 5, 13, 64]) {
        expect(pipelineBubbleFraction(s, m)).toBeCloseTo((s - 1) / (m + s - 1), 12);
      }
    }
  });

  it('is 0 when there is a single stage (no bubble)', () => {
    expect(pipelineBubbleFraction(1, 8)).toBe(0);
  });

  it('stays within [0, 1)', () => {
    for (const s of [1, 2, 4, 8, 32]) {
      for (const m of [1, 2, 8, 100]) {
        const b = pipelineBubbleFraction(s, m);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(1);
      }
    }
  });

  it('decreases monotonically as microbatches increase', () => {
    const stages = 8;
    let prev = Number.POSITIVE_INFINITY;
    for (const m of [1, 2, 4, 8, 16, 32, 64, 128]) {
      const b = pipelineBubbleFraction(stages, m);
      expect(b).toBeLessThan(prev);
      prev = b;
    }
  });

  it('tends to 0 as microbatches grow without bound', () => {
    expect(pipelineBubbleFraction(8, 1_000_000)).toBeLessThan(1e-5);
    expect(pipelineBubbleFraction(64, 100_000_000)).toBeLessThan(1e-5);
  });

  it('clamps non-positive / fractional inputs to at least one', () => {
    expect(pipelineBubbleFraction(0, 4)).toBe(pipelineBubbleFraction(1, 4));
    expect(pipelineBubbleFraction(4, 0)).toBe(pipelineBubbleFraction(4, 1));
    expect(pipelineBubbleFraction(4.9, 8.9)).toBe(pipelineBubbleFraction(4, 8));
  });
});
