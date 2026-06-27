import { describe, expect, it } from 'vitest';
import { expectedAcceptedTokens, makeRng, simulateRound, speedup } from '../src/lib/speculative';

describe('expectedAcceptedTokens — boundary values', () => {
  it('returns k+1 when alpha = 1 (everything accepted plus bonus)', () => {
    for (const k of [1, 2, 4, 8]) {
      expect(expectedAcceptedTokens(k, 1)).toBe(k + 1);
    }
  });

  it('returns 1 when alpha = 0 (nothing accepted, single resample)', () => {
    for (const k of [1, 2, 4, 8]) {
      expect(expectedAcceptedTokens(k, 0)).toBeCloseTo(1, 12);
    }
  });
});

describe('expectedAcceptedTokens — monotonic', () => {
  it('strictly increases in alpha', () => {
    const k = 4;
    let prev = Number.NEGATIVE_INFINITY;
    for (let a = 0; a <= 1.00001; a += 0.05) {
      const v = expectedAcceptedTokens(k, Math.min(1, a));
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('strictly increases in k for any 0 < alpha <= 1', () => {
    for (const alpha of [0.2, 0.5, 0.8, 1]) {
      let prev = Number.NEGATIVE_INFINITY;
      for (let k = 1; k <= 12; k++) {
        const v = expectedAcceptedTokens(k, alpha);
        expect(v).toBeGreaterThan(prev);
        prev = v;
      }
    }
  });
});

describe('expectedAcceptedTokens — finite and positive', () => {
  it('is finite and > 0 across the parameter grid', () => {
    for (let k = 1; k <= 16; k++) {
      for (let a = 0; a <= 1; a += 0.1) {
        const v = expectedAcceptedTokens(k, a);
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
      }
    }
  });
});

describe('speedup — closed form at alpha = 1', () => {
  it('equals (k+1)/(1+k*c)', () => {
    for (const k of [1, 3, 5]) {
      for (const c of [0, 0.1, 0.25, 0.5]) {
        expect(speedup(k, 1, c)).toBeCloseTo((k + 1) / (1 + k * c), 12);
      }
    }
  });
});

describe('speedup — behavior', () => {
  it('increases with alpha (fixed k, c)', () => {
    const k = 4;
    const c = 0.1;
    let prev = Number.NEGATIVE_INFINITY;
    for (let a = 0; a <= 1.00001; a += 0.05) {
      const v = speedup(k, Math.min(1, a), c);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('can drop below 1 for low alpha + high draft cost', () => {
    expect(speedup(6, 0.1, 0.6)).toBeLessThan(1);
  });

  it('exceeds 1 for high alpha + cheap draft', () => {
    expect(speedup(4, 0.9, 0.05)).toBeGreaterThan(1);
  });

  it('is finite and positive across the grid', () => {
    for (let k = 1; k <= 12; k++) {
      for (let a = 0; a <= 1; a += 0.1) {
        for (const c of [0.01, 0.1, 0.5, 1]) {
          const v = speedup(k, a, c);
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('simulateRound — deterministic & consistent', () => {
  it('is reproducible for a fixed seed', () => {
    const a = simulateRound(5, 0.7, makeRng(42));
    const b = simulateRound(5, 0.7, makeRng(42));
    expect(b).toEqual(a);
  });

  it('always produces acceptedCount + 1 tokens', () => {
    for (let seed = 0; seed < 50; seed++) {
      const r = simulateRound(6, 0.6, makeRng(seed));
      expect(r.produced).toBe(r.acceptedCount + 1);
      expect(r.acceptedCount).toBeGreaterThanOrEqual(0);
      expect(r.acceptedCount).toBeLessThanOrEqual(6);
      expect(r.tokens.length).toBe(r.produced);
    }
  });

  it('accepts everything plus a bonus when alpha = 1', () => {
    const r = simulateRound(5, 1, makeRng(7));
    expect(r.acceptedCount).toBe(5);
    expect(r.produced).toBe(6);
    expect(r.tokens.at(-1)?.bonus).toBe(true);
  });

  it('accepts nothing and resamples when alpha = 0', () => {
    const r = simulateRound(5, 0, makeRng(7));
    expect(r.acceptedCount).toBe(0);
    expect(r.produced).toBe(1);
    expect(r.tokens[0].rejected).toBe(true);
  });

  it('empirical mean approaches expectedAcceptedTokens', () => {
    const k = 4;
    const alpha = 0.65;
    const rng = makeRng(12345);
    let total = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      total += simulateRound(k, alpha, rng).produced;
    }
    const mean = total / N;
    expect(mean).toBeCloseTo(expectedAcceptedTokens(k, alpha), 1);
  });
});

describe('makeRng', () => {
  it('produces values in [0,1)', () => {
    const rng = makeRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
