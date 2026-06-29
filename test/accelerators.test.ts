import { describe, expect, it } from 'vitest';
import {
  ACCELERATORS,
  SRAM_OUTLIERS,
  bytesPerToken,
  decodeTokPerSec,
  fitsInMemory,
} from '../src/lib/accelerators';

describe('bytesPerToken', () => {
  it('is activeParamsB billions × bytes-per-param', () => {
    expect(bytesPerToken(7, 2)).toBe(14e9); // 7B at FP16
    expect(bytesPerToken(70, 1)).toBe(70e9); // 70B at FP8
    expect(bytesPerToken(5, 0.5)).toBe(2.5e9); // 5B active at Q4
  });
});

describe('decodeTokPerSec', () => {
  it('is bandwidth ÷ bytes-per-token', () => {
    // H100 at 3.35 TB/s decoding a 70B dense model at FP8 (70e9 bytes/token)
    expect(decodeTokPerSec(3.35, bytesPerToken(70, 1))).toBeCloseTo(47.86, 1);
  });

  it('rises with bandwidth and falls with bytes-per-token', () => {
    const lo = decodeTokPerSec(3.35, 70e9);
    const hi = decodeTokPerSec(8.0, 70e9);
    expect(hi).toBeGreaterThan(lo);
    const fat = decodeTokPerSec(8.0, 140e9);
    expect(fat).toBeLessThan(hi);
  });

  it('returns 0 for a non-positive byte cost', () => {
    expect(decodeTokPerSec(8.0, 0)).toBe(0);
    expect(decodeTokPerSec(8.0, -1)).toBe(0);
  });
});

describe('fitsInMemory', () => {
  it('compares weight footprint against capacity (inclusive)', () => {
    expect(fitsInMemory(70, 80)).toBe(true);
    expect(fitsInMemory(80, 80)).toBe(true);
    expect(fitsInMemory(81, 80)).toBe(false);
  });
});

describe('ACCELERATORS data', () => {
  it('every entry has positive memory and bandwidth and copy', () => {
    for (const a of ACCELERATORS) {
      expect(a.memGB).toBeGreaterThan(0);
      expect(a.bandwidthTBs).toBeGreaterThan(0);
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.vendor.length).toBeGreaterThan(0);
      expect(a.note.length).toBeGreaterThan(0);
    }
  });

  it('is ordered by ascending bandwidth', () => {
    const bw = ACCELERATORS.map((a) => a.bandwidthTBs);
    expect(bw).toEqual([...bw].sort((x, y) => x - y));
  });

  it('the SRAM outliers are kept off the HBM plane', () => {
    expect(SRAM_OUTLIERS.length).toBeGreaterThan(0);
    const names = new Set(ACCELERATORS.map((a) => a.name));
    for (const o of SRAM_OUTLIERS) expect(names.has(o.name)).toBe(false);
  });
});
