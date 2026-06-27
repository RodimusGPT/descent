import { describe, expect, it } from 'vitest';
import { MOE_PRESET, activeParamsB, route } from '../src/lib/moe';

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

describe('route — top-k selection', () => {
  // Logits where the largest values are at known indices.
  const logits = [0.2, 3.5, 1.0, 2.7, -0.5, 3.9, 0.1, 2.0];

  it('chooses the k experts with the highest logits', () => {
    const { chosen } = route(logits, 3);
    // Highest three logits are at indices 5 (3.9), 1 (3.5), 3 (2.7).
    expect([...chosen].sort((a, b) => a - b)).toEqual([1, 3, 5]);
  });

  it('orders chosen experts by logit, highest first', () => {
    const { chosen } = route(logits, 3);
    expect(chosen).toEqual([5, 1, 3]);
  });

  it('chosen.length equals k', () => {
    expect(route(logits, 1).chosen).toHaveLength(1);
    expect(route(logits, 4).chosen).toHaveLength(4);
    expect(route(logits, 8).chosen).toHaveLength(8);
  });

  it('clamps k into [1, n]', () => {
    expect(route(logits, 0).chosen).toHaveLength(1);
    expect(route(logits, 99).chosen).toHaveLength(logits.length);
  });

  it('handles empty logits', () => {
    expect(route([], 4)).toEqual({ gate: [], chosen: [], weights: [] });
  });
});

describe('route — distributions', () => {
  const logits = [0.2, 3.5, 1.0, 2.7, -0.5, 3.9, 0.1, 2.0];

  it('gate is a softmax over all experts and sums to 1', () => {
    const { gate } = route(logits, 4);
    expect(gate).toHaveLength(logits.length);
    expect(sum(gate)).toBeCloseTo(1, 10);
    for (const g of gate) expect(g).toBeGreaterThan(0);
  });

  it('renormalized chosen weights sum to 1', () => {
    for (const k of [1, 2, 4, 6]) {
      const { weights } = route(logits, k);
      expect(sum(weights.map((w) => w.weight))).toBeCloseTo(1, 10);
    }
  });

  it('weights reference exactly the chosen experts in order', () => {
    const { chosen, weights } = route(logits, 4);
    expect(weights.map((w) => w.expert)).toEqual(chosen);
  });

  it('chosen weights preserve the gate ordering (renormalization is monotone)', () => {
    const { weights } = route(logits, 4);
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i].weight).toBeLessThanOrEqual(weights[i - 1].weight);
    }
  });
});

describe('activeParamsB', () => {
  it('active is a small fraction of total', () => {
    const { activeB, totalB } = activeParamsB();
    expect(activeB).toBeLessThan(totalB);
    expect(activeB / totalB).toBeLessThan(0.15);
  });

  it('lands in a believable range (~5B active of ~117B total)', () => {
    const { activeB, totalB } = activeParamsB();
    expect(activeB).toBeGreaterThan(3);
    expect(activeB).toBeLessThan(12);
    expect(totalB).toBeGreaterThan(100);
    expect(totalB).toBeLessThan(130);
  });

  it('reflects the topK / totalExperts ratio once shared params net out', () => {
    const { activeB, totalB } = activeParamsB();
    const expertActive = activeB - MOE_PRESET.sharedParamsB;
    const expertTotal = totalB - MOE_PRESET.sharedParamsB;
    expect(expertActive / expertTotal).toBeCloseTo(MOE_PRESET.topK / MOE_PRESET.totalExperts, 10);
  });

  it('grows active params as k rises but never exceeds total', () => {
    const a4 = activeParamsB(MOE_PRESET, 4).activeB;
    const a8 = activeParamsB(MOE_PRESET, 8).activeB;
    expect(a8).toBeGreaterThan(a4);
    expect(activeParamsB(MOE_PRESET, MOE_PRESET.totalExperts).activeB).toBeCloseTo(
      activeParamsB(MOE_PRESET).totalB,
      10,
    );
  });

  it('preset has plausible metadata', () => {
    expect(MOE_PRESET.totalExperts).toBeGreaterThan(MOE_PRESET.topK);
    expect(MOE_PRESET.topK).toBeGreaterThanOrEqual(1);
    expect(MOE_PRESET.paramsPerExpertB).toBeGreaterThan(0);
  });
});
