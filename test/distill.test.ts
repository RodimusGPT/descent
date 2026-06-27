import { describe, expect, it } from 'vitest';
import { EXAMPLE_PRESETS, STUDENT, TEACHER, transferProxy } from '../src/lib/distill';

describe('transferProxy — range', () => {
  it('stays within [0, 100] across many magnitudes', () => {
    const samples = [0, 1, 10, 100, 1000, 10000, 100000, 1_000_000, 1e9];
    for (const n of samples) {
      const s = transferProxy(n);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  it('maps zero / invalid input to 0', () => {
    expect(transferProxy(0)).toBe(0);
    expect(transferProxy(-5)).toBe(0);
    expect(transferProxy(Number.NaN)).toBe(0);
  });
});

describe('transferProxy — monotonic non-decreasing', () => {
  it('never decreases as examples increase', () => {
    let prev = -1;
    for (let n = 0; n <= 200000; n += 137) {
      const s = transferProxy(n);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
});

describe('transferProxy — diminishing returns', () => {
  it('gains less per decade as examples grow', () => {
    const earlyGain = transferProxy(1000) - transferProxy(100);
    const lateGain = transferProxy(100000) - transferProxy(10000);
    expect(earlyGain).toBeGreaterThan(lateGain);
  });
});

describe('transferProxy — deterministic', () => {
  it('returns identical values for repeated calls', () => {
    for (const n of EXAMPLE_PRESETS) {
      expect(transferProxy(n)).toBe(transferProxy(n));
    }
  });
});

describe('illustrative data', () => {
  it('student is smaller than the teacher', () => {
    expect(STUDENT.paramsB).toBeLessThan(TEACHER.paramsB);
  });

  it('exposes ascending example presets', () => {
    expect(EXAMPLE_PRESETS.length).toBeGreaterThan(0);
    for (let i = 1; i < EXAMPLE_PRESETS.length; i++) {
      expect(EXAMPLE_PRESETS[i]).toBeGreaterThan(EXAMPLE_PRESETS[i - 1]);
    }
  });
});
