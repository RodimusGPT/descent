import { describe, expect, it } from 'vitest';
import { PROMPTS, predict, promptById, topToken } from '../src/lib/hook';

describe('PROMPTS', () => {
  it('is non-empty with a handful of prompts', () => {
    expect(PROMPTS.length).toBeGreaterThanOrEqual(4);
    expect(PROMPTS.length).toBeLessThanOrEqual(6);
  });

  it('each prompt has text, a unique id, and >= 4 candidates', () => {
    const ids = new Set<string>();
    for (const p of PROMPTS) {
      expect(p.text.length).toBeGreaterThan(0);
      expect(p.candidates.length).toBeGreaterThanOrEqual(4);
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
    }
  });
});

describe('promptById', () => {
  it('returns the matching prompt', () => {
    expect(promptById('paris').text).toBe('The capital of France is');
  });

  it('falls back to the first prompt for an unknown id', () => {
    expect(promptById('nope')).toBe(PROMPTS[0]);
  });
});

describe('predict', () => {
  it('returns one entry per candidate with probs summing to 1', () => {
    for (const p of PROMPTS) {
      const out = predict(p.id, 1);
      expect(out).toHaveLength(p.candidates.length);
      const total = out.reduce((a, b) => a + b.prob, 0);
      expect(total).toBeCloseTo(1, 10);
    }
  });

  it('is sorted by probability descending', () => {
    for (const p of PROMPTS) {
      const out = predict(p.id, 0.9);
      for (let i = 1; i < out.length; i++) {
        expect(out[i - 1].prob).toBeGreaterThanOrEqual(out[i].prob);
      }
    }
  });

  it('low temperature sharpens (top prob rises) vs high temperature', () => {
    for (const p of PROMPTS) {
      const cold = predict(p.id, 0.3)[0].prob;
      const hot = predict(p.id, 2)[0].prob;
      expect(cold).toBeGreaterThan(hot);
    }
  });

  it('high temperature flattens toward uniform', () => {
    const p = PROMPTS[0];
    const uniform = 1 / p.candidates.length;
    const top = predict(p.id, 50)[0].prob;
    expect(top).toBeLessThan(0.5);
    expect(top).toBeGreaterThan(uniform - 0.05);
  });
});

describe('topToken', () => {
  it('at low temperature equals the highest-logit candidate', () => {
    for (const p of PROMPTS) {
      const best = [...p.candidates].sort((a, b) => b.logit - a.logit)[0].token;
      expect(topToken(p.id, 0.2)).toBe(best);
    }
  });

  it('matches the first entry of predict', () => {
    for (const p of PROMPTS) {
      expect(topToken(p.id, 1)).toBe(predict(p.id, 1)[0].token);
    }
  });
});
