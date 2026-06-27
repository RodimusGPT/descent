import { describe, expect, it } from 'vitest';
import {
  GPU_OPTIONS,
  MODEL_OPTIONS,
  type ModelOption,
  estimateTokensPerSec,
  estimateVramGB,
  fits,
} from '../src/lib/config';

function model(name: string): ModelOption {
  const m = MODEL_OPTIONS.find((x) => x.name === name);
  if (!m) throw new Error(`missing model: ${name}`);
  return m;
}

function gpu(name: string) {
  const g = GPU_OPTIONS.find((x) => x.name === name);
  if (!g) throw new Error(`missing gpu: ${name}`);
  return g;
}

describe('MODEL_OPTIONS', () => {
  it('includes a 7B dense, a 70B dense, and an MoE with active << total', () => {
    const dense7 = model('7B dense');
    expect(dense7.activeParamsB).toBe(dense7.paramsB);

    const dense70 = MODEL_OPTIONS.find((m) => m.paramsB === 70 && m.activeParamsB === 70);
    expect(dense70).toBeDefined();

    const moe = MODEL_OPTIONS.find((m) => m.activeParamsB < m.paramsB);
    expect(moe).toBeDefined();
    if (moe) {
      expect(moe.paramsB).toBeGreaterThanOrEqual(100);
      expect(moe.activeParamsB).toBeLessThan(moe.paramsB);
    }
  });
});

describe('GPU_OPTIONS', () => {
  it('spans a consumer card, datacenter cards, and a big unified-memory box', () => {
    expect(GPU_OPTIONS.some((g) => g.vramGB <= 24)).toBe(true); // consumer
    expect(GPU_OPTIONS.some((g) => g.vramGB >= 80)).toBe(true); // datacenter
    expect(GPU_OPTIONS.some((g) => g.vramGB >= 128)).toBe(true); // unified memory
  });

  it('every card has a positive bandwidth', () => {
    for (const g of GPU_OPTIONS) expect(g.bandwidthTBs).toBeGreaterThan(0);
  });
});

describe('estimateVramGB — weight math', () => {
  it('a 7B model weighs 14 GB at FP16 and 3.5 GB at Q4', () => {
    expect(estimateVramGB(model('7B dense'), 'FP16', 2048).weightGB).toBeCloseTo(14, 10);
    expect(estimateVramGB(model('7B dense'), 'Q4', 2048).weightGB).toBeCloseTo(3.5, 10);
  });

  it('total equals weights plus KV cache', () => {
    const e = estimateVramGB(model('7B dense'), 'Q4', 4096);
    expect(e.totalGB).toBeCloseTo(e.weightGB + e.kvGB, 10);
  });
});

describe('estimateVramGB — KV cache', () => {
  it('grows with context length', () => {
    const short = estimateVramGB(model('7B dense'), 'FP16', 1024).kvGB;
    const long = estimateVramGB(model('7B dense'), 'FP16', 8192).kvGB;
    expect(long).toBeGreaterThan(short);
  });

  it('scales linearly with batch', () => {
    const b1 = estimateVramGB(model('7B dense'), 'FP16', 4096, 1).kvGB;
    const b4 = estimateVramGB(model('7B dense'), 'FP16', 4096, 4).kvGB;
    expect(b4).toBeCloseTo(b1 * 4, 10);
  });

  it('lower precision lowers total VRAM (weights shrink)', () => {
    const fp16 = estimateVramGB(model('7B dense'), 'FP16', 4096).totalGB;
    const q4 = estimateVramGB(model('7B dense'), 'Q4', 4096).totalGB;
    expect(q4).toBeLessThan(fp16);
  });
});

describe('estimateTokensPerSec', () => {
  it('H100 (3.35 TB/s) on a 7B dense FP16 ≈ 239 tok/s', () => {
    const t = estimateTokensPerSec(model('7B dense'), 'FP16', gpu('H100 80GB'));
    expect(t).toBeCloseTo(3.35e12 / (7e9 * 2), 6);
    expect(t).toBeGreaterThan(235);
    expect(t).toBeLessThan(245);
  });

  it('lower precision raises tokens/sec', () => {
    const fp16 = estimateTokensPerSec(model('7B dense'), 'FP16', gpu('H100 80GB'));
    const q4 = estimateTokensPerSec(model('7B dense'), 'Q4', gpu('H100 80GB'));
    expect(q4).toBeGreaterThan(fp16);
  });

  it('an MoE decodes much faster than a dense model of the same total size', () => {
    const moe = model('120B MoE (~5B active)');
    const dense = model('70B dense');
    const h100 = gpu('H100 80GB');
    const moeTps = estimateTokensPerSec(moe, 'FP16', h100);
    const denseTps = estimateTokensPerSec(dense, 'FP16', h100);
    // MoE reads ~5B active vs 70B dense -> dramatically higher throughput.
    expect(moeTps).toBeGreaterThan(denseTps * 5);
  });

  it('scales with GPU bandwidth', () => {
    const a100 = estimateTokensPerSec(model('7B dense'), 'FP16', gpu('A100 80GB'));
    const h100 = estimateTokensPerSec(model('7B dense'), 'FP16', gpu('H100 80GB'));
    expect(h100).toBeGreaterThan(a100);
  });
});

describe('fits', () => {
  it('is correct at the boundary', () => {
    expect(fits(8, 8)).toBe(true);
    expect(fits(8.0001, 8)).toBe(false);
    expect(fits(3.5, 24)).toBe(true);
    expect(fits(140, 80)).toBe(false);
  });

  it('a 7B Q4 fits a 4090 but a 70B FP16 does not', () => {
    const fourNinety = gpu('RTX 4090');
    const small = estimateVramGB(model('7B dense'), 'Q4', 4096).totalGB;
    const big = estimateVramGB(model('70B dense'), 'FP16', 4096).totalGB;
    expect(fits(small, fourNinety.vramGB)).toBe(true);
    expect(fits(big, fourNinety.vramGB)).toBe(false);
  });
});
