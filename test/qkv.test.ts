import { scaledScores, softmax } from '../src/lib/nn';
import {
  EMBEDDINGS,
  HEADS,
  HEAD_DIM,
  TOKENS,
  buildHead,
  gqaGrouping,
  headAttention,
  project,
} from '../src/lib/qkv';

describe('project', () => {
  it('identity projection returns the input vector', () => {
    const I = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
    expect(project([2, 0, 1, 0], I)).toEqual([2, 0, 1, 0]);
  });

  it('computes out[j] = Σᵢ vec[i]·M[i][j]', () => {
    const M = [
      [1, 2],
      [3, 4],
    ];
    // vec·M = [1*1 + 1*3, 1*2 + 1*4] = [4, 6]
    expect(project([1, 1], M)).toEqual([4, 6]);
  });
});

describe('HEADS fixed example', () => {
  it('has 2-3 heads with distinct names', () => {
    expect(HEADS.length).toBeGreaterThanOrEqual(2);
    expect(HEADS.length).toBeLessThanOrEqual(3);
    const names = new Set(HEADS.map((h) => h.name));
    expect(names.size).toBe(HEADS.length);
  });

  it('every head has one Q/K/V vector per token, each of width HEAD_DIM', () => {
    for (const head of HEADS) {
      for (const matrix of [head.Q, head.K, head.V]) {
        expect(matrix.length).toBe(TOKENS.length);
        for (const vec of matrix) expect(vec.length).toBe(HEAD_DIM);
      }
    }
  });

  it('the heads impose distinct attention patterns', () => {
    const patterns = HEADS.map((h) =>
      headAttention(h.Q[1], h.K, h.V)
        .weights.map((w) => w.toFixed(3))
        .join(','),
    );
    expect(new Set(patterns).size).toBe(HEADS.length);
  });

  it('buildHead projects embeddings through the head definition', () => {
    const rebuilt = buildHead(
      { name: 'x', description: '', Wq: identity(), Wk: identity(), Wv: identity() },
      EMBEDDINGS,
    );
    expect(rebuilt.Q).toEqual(EMBEDDINGS);
    expect(rebuilt.V).toEqual(EMBEDDINGS);
  });
});

describe('headAttention', () => {
  it('weights sum to 1 for every head and every query', () => {
    for (const head of HEADS) {
      for (let q = 0; q < head.Q.length; q++) {
        const { weights } = headAttention(head.Q[q], head.K, head.V);
        const sum = weights.reduce((a, b) => a + b, 0);
        expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
      }
    }
  });

  it('output length equals the value dimension', () => {
    const values = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    const { output } = headAttention(
      [1, 0],
      [
        [1, 0],
        [0, 1],
      ],
      values,
    );
    expect(output.length).toBe(3);
  });

  it('scores are exactly the scaled dot-product scores', () => {
    const head = HEADS[0];
    const { scores } = headAttention(head.Q[0], head.K, head.V);
    expect(scores).toEqual(scaledScores(head.Q[0], head.K));
  });

  it('weights are softmax of the scores', () => {
    const head = HEADS[1];
    const { scores, weights } = headAttention(head.Q[2], head.K, head.V);
    expect(weights).toEqual(softmax(scores));
  });

  it('equal scores give uniform weights and the value mean (hand-computed)', () => {
    // query [0,0] → scores [0,0] → weights [0.5,0.5] → output = mean of the values
    const { weights, output } = headAttention(
      [0, 0],
      [
        [5, 9],
        [1, 3],
      ],
      [
        [2, 0],
        [0, 4],
      ],
    );
    expect(weights[0]).toBeCloseTo(0.5, 12);
    expect(weights[1]).toBeCloseTo(0.5, 12);
    expect(output[0]).toBeCloseTo(1, 12); // 0.5*2 + 0.5*0
    expect(output[1]).toBeCloseTo(2, 12); // 0.5*0 + 0.5*4
  });

  it('output equals Σ weightsᵢ·valuesᵢ on an asymmetric tiny case', () => {
    const query = [1, 0];
    const keys = [
      [1, 0],
      [0, 1],
    ];
    const values = [
      [2, 0],
      [0, 4],
    ];
    const { weights, output } = headAttention(query, keys, values);

    // Independent hand recomputation of the weighted sum.
    const expected = [
      weights[0] * values[0][0] + weights[1] * values[1][0],
      weights[0] * values[0][1] + weights[1] * values[1][1],
    ];
    expect(output[0]).toBeCloseTo(expected[0], 12);
    expect(output[1]).toBeCloseTo(expected[1], 12);

    // And the weights themselves, hand-derived from exp((q·k)/√2).
    const s = 1 / Math.sqrt(2);
    const e0 = Math.exp(s);
    const e1 = Math.exp(0);
    expect(weights[0]).toBeCloseTo(e0 / (e0 + e1), 12);
  });
});

describe('gqaGrouping', () => {
  it('GQA: 8 query heads, 2 groups → contiguous blocks of 4', () => {
    expect(gqaGrouping(8, 2)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
  });

  it('MQA: 8 query heads, 1 group → all zeros (one shared K/V)', () => {
    expect(gqaGrouping(8, 1)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('full MHA: groups === heads → identity mapping', () => {
    expect(gqaGrouping(8, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('groups are contiguous and non-decreasing, within [0, nKvGroups)', () => {
    const map = gqaGrouping(8, 4);
    expect(map).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    for (let i = 1; i < map.length; i++) expect(map[i]).toBeGreaterThanOrEqual(map[i - 1]);
    for (const g of map) {
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThan(4);
    }
  });

  it('handles a non-divisible split without exceeding the last group index', () => {
    const map = gqaGrouping(7, 3);
    expect(Math.max(...map)).toBeLessThanOrEqual(2);
    expect(map.length).toBe(7);
  });
});

function identity(): number[][] {
  return [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}
