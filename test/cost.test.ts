import { describe, expect, it } from 'vitest';
import {
  BATCH_STEPS,
  GPU_COSTS,
  type GpuCost,
  costAtBatch,
  costPerMtok,
  decodeThroughputBatched,
} from '../src/lib/cost';

const gpu = (name: string): GpuCost => {
  const g = GPU_COSTS.find((x) => x.name === name);
  if (!g) throw new Error(`missing gpu: ${name}`);
  return g;
};

describe('costPerMtok', () => {
  it('is $/hour ÷ tokens-per-hour × 1e6', () => {
    // 1000 tok/s = 3.6M tokens/hour; at $3.6/hr → $1.00 per million tokens
    expect(costPerMtok(3.6, 1000)).toBeCloseTo(1.0, 6);
  });
  it('is infinite when nothing is produced', () => {
    expect(costPerMtok(2, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('decodeThroughputBatched', () => {
  it('rises ~linearly with batch while memory-bound', () => {
    const h100 = gpu('H100');
    const t1 = decodeThroughputBatched(70, h100, 1);
    const t8 = decodeThroughputBatched(70, h100, 8);
    expect(t8).toBeCloseTo(t1 * 8, 4); // both well below the compute roof
  });

  it('plateaus past the compute roof (the roofline ridge)', () => {
    const h100 = gpu('H100');
    // For 70B FP8 on H100 the ridge batch is ~298; 512 and 1024 are both above it.
    const t512 = decodeThroughputBatched(70, h100, 512);
    const t1024 = decodeThroughputBatched(70, h100, 1024);
    expect(t1024).toBeCloseTo(t512, 4); // flat: compute-bound
    expect(t1024).toBeLessThan(decodeThroughputBatched(70, h100, 1) * 1024); // far below linear
  });
});

describe('costAtBatch', () => {
  it('falls with batch, then flattens at the roof', () => {
    const h100 = gpu('H100');
    const costs = BATCH_STEPS.map((b) => costAtBatch(70, h100, b));
    // strictly decreasing across the sampled steps (each ≥ previous batch)
    for (let i = 1; i < costs.length; i++) expect(costs[i]).toBeLessThanOrEqual(costs[i - 1]);
    // the drop from batch 1 → 64 is dramatic (batching is the lever)
    expect(costs[0] / costAtBatch(70, h100, 64)).toBeGreaterThan(20);
    // and it has flattened by the top of the range (compute-bound plateau)
    expect(costAtBatch(70, h100, 512) / costAtBatch(70, h100, 1024)).toBeLessThan(1.2);
  });

  it('an MoE (few active params) is far cheaper than a dense model per token', () => {
    const h100 = gpu('H100');
    expect(costAtBatch(5, h100, 32)).toBeLessThan(costAtBatch(70, h100, 32) / 5);
  });

  it('more bandwidth per dollar is cheaper at memory-bound batch', () => {
    // B200 ($5/hr, 8 TB/s) beats H100 ($2.5/hr, 3.35 TB/s) per token.
    expect(costAtBatch(70, gpu('B200'), 8)).toBeLessThan(costAtBatch(70, gpu('H100'), 8));
  });
});
