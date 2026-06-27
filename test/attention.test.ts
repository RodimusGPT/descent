import { HEADS, TOKENS, rowNormalize, weightToGeometry } from '../src/lib/attention-data';

describe('HEADS matrices', () => {
  it('has at least two heads with distinct names', () => {
    expect(HEADS.length).toBeGreaterThanOrEqual(2);
    const names = new Set(HEADS.map((h) => h.name));
    expect(names.size).toBe(HEADS.length);
  });

  it('every matrix is square with side === TOKENS.length', () => {
    const n = TOKENS.length;
    for (const head of HEADS) {
      expect(head.matrix.length).toBe(n);
      for (const row of head.matrix) {
        expect(row.length).toBe(n);
      }
    }
  });

  it('every row is row-normalized (sums to ~1)', () => {
    for (const head of HEADS) {
      for (const row of head.matrix) {
        const sum = row.reduce((a, b) => a + b, 0);
        expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
      }
    }
  });

  it('all weights are within [0,1]', () => {
    for (const head of HEADS) {
      for (const row of head.matrix) {
        for (const w of row) {
          expect(w).toBeGreaterThanOrEqual(0);
          expect(w).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('rowNormalize', () => {
  it('makes each row sum to ~1', () => {
    const out = rowNormalize([
      [1, 2, 1],
      [0, 0, 0],
      [10, 0, 0],
    ]);
    for (const row of out) {
      const sum = row.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    }
  });

  it('keeps an all-zero row finite and positive (no NaN)', () => {
    const [row] = rowNormalize([[0, 0, 0, 0]]);
    for (const v of row) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });
});

describe('weightToGeometry', () => {
  it('weight 0 gives the minimum, weight 1 the maximum', () => {
    const lo = weightToGeometry(0);
    const hi = weightToGeometry(1);
    expect(lo.opacity).toBeLessThan(hi.opacity);
    expect(lo.width).toBeLessThan(hi.width);
  });

  it('is monotonically increasing in opacity and width', () => {
    let prev = weightToGeometry(0);
    for (let i = 1; i <= 10; i++) {
      const cur = weightToGeometry(i / 10);
      expect(cur.opacity).toBeGreaterThan(prev.opacity);
      expect(cur.width).toBeGreaterThan(prev.width);
      prev = cur;
    }
  });

  it('is bounded: opacity within [0,1] and width > 0', () => {
    for (let i = 0; i <= 20; i++) {
      const g = weightToGeometry(i / 20);
      expect(g.opacity).toBeGreaterThanOrEqual(0);
      expect(g.opacity).toBeLessThanOrEqual(1);
      expect(g.width).toBeGreaterThan(0);
    }
  });

  it('clamps out-of-range input to the endpoints', () => {
    expect(weightToGeometry(-5)).toEqual(weightToGeometry(0));
    expect(weightToGeometry(5)).toEqual(weightToGeometry(1));
  });

  it('treats NaN as the minimum', () => {
    expect(weightToGeometry(Number.NaN)).toEqual(weightToGeometry(0));
  });
});
