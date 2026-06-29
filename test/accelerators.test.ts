import { describe, expect, it } from 'vitest';
import {
  ACCELERATORS,
  DECODE_PRECISIONS,
  SRAM_OUTLIERS,
  bytesPerToken,
  decodeTokPerSec,
  fitsInMemory,
  throughputAcrossChips,
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

describe('DECODE_PRECISIONS', () => {
  it('offers FP16 / FP8 / FP4, coarsening (fewer bytes) down the list', () => {
    expect(DECODE_PRECISIONS.map((p) => p.key)).toEqual(['fp16', 'fp8', 'fp4']);
    const bytes = DECODE_PRECISIONS.map((p) => p.bytesPerParam);
    expect(bytes).toEqual([...bytes].sort((a, b) => b - a));
  });
});

describe('throughputAcrossChips', () => {
  const row = (rows: ReturnType<typeof throughputAcrossChips>, name: string) =>
    rows.find((r) => r.accel.name === name);

  it('returns one row per accelerator, sorted fastest-first', () => {
    const rows = throughputAcrossChips(70, 70, 1); // 70B dense at FP8
    expect(rows.length).toBe(ACCELERATORS.length);
    const tps = rows.map((r) => r.tokPerSec);
    expect(tps).toEqual([...tps].sort((a, b) => b - a));
    expect(tps.every((t) => t > 0)).toBe(true);
  });

  it('ranks by bandwidth — the 8 TB/s parts lead a dense workload', () => {
    const rows = throughputAcrossChips(70, 70, 1);
    expect(rows[0].accel.bandwidthTBs).toBe(8.0);
    // H100 (3.35) on 70B FP8: 3.35e12 / 70e9 ≈ 47.86 tok/s
    expect(row(rows, 'H100')?.tokPerSec).toBeCloseTo(47.86, 1);
  });

  it('flags fit: a 70B at FP16 (140 GB) fits B200 but not H100', () => {
    const rows = throughputAcrossChips(70, 70, 2);
    expect(row(rows, 'B200')?.fits).toBe(true);
    expect(row(rows, 'H100')?.fits).toBe(false);
  });

  it('MoE flies: ~5B-active decodes far faster than a 70B dense on the same chip', () => {
    const moe = throughputAcrossChips(120, 5, 2); // 120B MoE, 5B active, FP16
    const dense = throughputAcrossChips(70, 70, 2); // 70B dense, FP16
    expect(row(moe, 'H100')!.tokPerSec).toBeGreaterThan(row(dense, 'H100')!.tokPerSec * 5);
    // …but the full 240 GB of MoE weights won't fit an 80 GB H100.
    expect(row(moe, 'H100')?.fits).toBe(false);
    expect(row(moe, 'M3 Ultra')?.fits).toBe(true);
  });
});
