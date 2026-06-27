import { describe, expect, it } from 'vitest';
import {
  GPU_SPEC,
  MEMORY_TIERS,
  type MemoryTier,
  fastestTier,
  slowestTier,
  sramFasterThanHbm,
  tierByName,
  tiersBySpeed,
  totalTensorCores,
} from '../src/lib/gpu';

describe('GPU_SPEC', () => {
  it('has every field present and positive', () => {
    expect(GPU_SPEC.name.length).toBeGreaterThan(0);
    expect(GPU_SPEC.sms).toBeGreaterThan(0);
    expect(GPU_SPEC.tensorCoresPerSm).toBeGreaterThan(0);
    expect(GPU_SPEC.hbmGB).toBeGreaterThan(0);
    expect(GPU_SPEC.hbmBandwidthTBs).toBeGreaterThan(0);
    expect(GPU_SPEC.l2MB).toBeGreaterThan(0);
    expect(GPU_SPEC.smemKBPerSm).toBeGreaterThan(0);
  });

  it('describes an H100-class part (~130 SMs, ~80 GB HBM, ~3 TB/s)', () => {
    expect(GPU_SPEC.sms).toBeGreaterThanOrEqual(100);
    expect(GPU_SPEC.sms).toBeLessThanOrEqual(160);
    expect(GPU_SPEC.hbmGB).toBeGreaterThanOrEqual(40);
    expect(GPU_SPEC.hbmBandwidthTBs).toBeGreaterThanOrEqual(1);
  });

  it('totalTensorCores multiplies SMs by cores-per-SM', () => {
    expect(totalTensorCores()).toBe(GPU_SPEC.sms * GPU_SPEC.tensorCoresPerSm);
    expect(totalTensorCores()).toBeGreaterThan(0);
  });
});

describe('MEMORY_TIERS', () => {
  it('has at least HBM, an on-chip cache, SRAM/shared, and registers', () => {
    expect(MEMORY_TIERS.length).toBeGreaterThanOrEqual(4);
    expect(tierByName('HBM')).toBeDefined();
    expect(tierByName('SRAM / shared')).toBeDefined();
    expect(tierByName('registers')).toBeDefined();
  });

  it('every tier has positive size, relSpeed, bandwidth and a blurb', () => {
    for (const t of MEMORY_TIERS) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.bytes).toBeGreaterThan(0);
      expect(t.relSpeed).toBeGreaterThan(0);
      expect(t.bandwidthTBs).toBeGreaterThan(0);
      expect(t.blurb.length).toBeGreaterThan(0);
    }
  });

  it('is ordered so size strictly DECREASES from base to tip', () => {
    for (let i = 1; i < MEMORY_TIERS.length; i++) {
      expect(MEMORY_TIERS[i].bytes).toBeLessThan(MEMORY_TIERS[i - 1].bytes);
    }
  });

  it('is ordered so relative speed strictly INCREASES from base to tip', () => {
    for (let i = 1; i < MEMORY_TIERS.length; i++) {
      expect(MEMORY_TIERS[i].relSpeed).toBeGreaterThan(MEMORY_TIERS[i - 1].relSpeed);
    }
  });

  it('pins HBM as the 1x speed baseline', () => {
    expect(tierByName('HBM')?.relSpeed).toBe(1);
  });

  it('bandwidthTBs tracks relSpeed scaled by the HBM baseline', () => {
    const hbm = tierByName('HBM') as MemoryTier;
    expect(hbm.bandwidthTBs).toBeCloseTo(GPU_SPEC.hbmBandwidthTBs, 10);
    for (const t of MEMORY_TIERS) {
      expect(t.bandwidthTBs).toBeCloseTo(hbm.bandwidthTBs * t.relSpeed, 1);
    }
  });
});

describe('SRAM vs HBM', () => {
  it('SRAM / shared is at least ~10x faster than HBM', () => {
    const hbm = tierByName('HBM') as MemoryTier;
    const sram = tierByName('SRAM / shared') as MemoryTier;
    expect(sram.relSpeed).toBeGreaterThanOrEqual(10 * hbm.relSpeed);
  });

  it('SRAM is many orders smaller than HBM (KBs not GBs)', () => {
    const hbm = tierByName('HBM') as MemoryTier;
    const sram = tierByName('SRAM / shared') as MemoryTier;
    expect(sram.bytes).toBeLessThan(hbm.bytes / 1e5);
  });

  it('sramFasterThanHbm reports the 10x gap, and rejects an impossible factor', () => {
    expect(sramFasterThanHbm()).toBe(true);
    expect(sramFasterThanHbm(10)).toBe(true);
    expect(sramFasterThanHbm(1000)).toBe(false);
  });
});

describe('tier helpers', () => {
  it('slowestTier is HBM (the base) and fastestTier is registers (the tip)', () => {
    expect(slowestTier().name).toBe('HBM');
    expect(fastestTier().name).toBe('registers');
  });

  it('tiersBySpeed reverses the storage order (fastest first)', () => {
    const bySpeed = tiersBySpeed();
    expect(bySpeed[0].name).toBe('registers');
    expect(bySpeed[bySpeed.length - 1].name).toBe('HBM');
    for (let i = 1; i < bySpeed.length; i++) {
      expect(bySpeed[i].relSpeed).toBeLessThan(bySpeed[i - 1].relSpeed);
    }
  });

  it('tierByName returns undefined for an unknown tier', () => {
    expect(tierByName('nope')).toBeUndefined();
  });
});
