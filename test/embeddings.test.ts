import {
  ANALOGY,
  CLUSTERS,
  EMBEDDINGS,
  analogy,
  analogyPoint,
  distance,
  nearest,
  vec,
} from '../src/lib/embeddings';

describe('EMBEDDINGS data', () => {
  it('every word has finite coords inside [0,100] and a known cluster', () => {
    const clusters = new Set(CLUSTERS);
    for (const w of EMBEDDINGS) {
      expect(Number.isFinite(w.x)).toBe(true);
      expect(Number.isFinite(w.y)).toBe(true);
      expect(w.x).toBeGreaterThanOrEqual(0);
      expect(w.x).toBeLessThanOrEqual(100);
      expect(w.y).toBeGreaterThanOrEqual(0);
      expect(w.y).toBeLessThanOrEqual(100);
      expect(clusters.has(w.cluster)).toBe(true);
    }
  });

  it('has a legible number of words and 3-5 clusters', () => {
    expect(EMBEDDINGS.length).toBeGreaterThanOrEqual(20);
    expect(EMBEDDINGS.length).toBeLessThanOrEqual(28);
    expect(CLUSTERS.length).toBeGreaterThanOrEqual(3);
    expect(CLUSTERS.length).toBeLessThanOrEqual(5);
  });

  it('words are unique', () => {
    const words = new Set(EMBEDDINGS.map((w) => w.word));
    expect(words.size).toBe(EMBEDDINGS.length);
  });

  it('every declared cluster is actually populated', () => {
    for (const c of CLUSTERS) {
      expect(EMBEDDINGS.some((w) => w.cluster === c)).toBe(true);
    }
  });
});

describe('nearest', () => {
  it('returns k items excluding the word itself', () => {
    const out = nearest('king', 4);
    expect(out.length).toBe(4);
    expect(out.some((w) => w.word === 'king')).toBe(false);
  });

  it("king's nearest neighbours are royalty before any far cluster", () => {
    const out = nearest('king', 3);
    for (const w of out) {
      expect(w.cluster).toBe('royalty');
    }
    expect(out.some((w) => w.word === 'queen')).toBe(true);
  });

  it('returns [] for an unknown word', () => {
    expect(nearest('zzz', 3)).toEqual([]);
  });

  it('orders results by ascending distance', () => {
    const self = vec('cat');
    if (!self) throw new Error('cat missing');
    const out = nearest('cat', 5);
    let prev = Number.NEGATIVE_INFINITY;
    for (const w of out) {
      const d = distance(self, w);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
});

describe('clusters are real geometry', () => {
  it('average same-cluster distance is smaller than average cross-cluster distance', () => {
    let sameSum = 0;
    let sameN = 0;
    let crossSum = 0;
    let crossN = 0;
    for (let i = 0; i < EMBEDDINGS.length; i++) {
      for (let j = i + 1; j < EMBEDDINGS.length; j++) {
        const d = distance(EMBEDDINGS[i], EMBEDDINGS[j]);
        if (EMBEDDINGS[i].cluster === EMBEDDINGS[j].cluster) {
          sameSum += d;
          sameN += 1;
        } else {
          crossSum += d;
          crossN += 1;
        }
      }
    }
    const sameAvg = sameSum / sameN;
    const crossAvg = crossSum / crossN;
    expect(sameAvg).toBeLessThan(crossAvg);
  });
});

describe('analogy', () => {
  it('king - man + woman === queen', () => {
    expect(analogy('king', 'man', 'woman')).toBe('queen');
  });

  it('matches the exported ANALOGY example', () => {
    expect(analogy(ANALOGY.a, ANALOGY.b, ANALOGY.c)).toBe(ANALOGY.expected);
  });

  it('is case-insensitive on its inputs', () => {
    expect(analogy('King', 'Man', 'Woman')).toBe('queen');
  });

  it('returns "" when an input word is unknown', () => {
    expect(analogy('king', 'man', 'nope')).toBe('');
  });

  it('analogyPoint lands on queen exactly', () => {
    const p = analogyPoint('king', 'man', 'woman');
    const q = vec('queen');
    if (!p || !q) throw new Error('missing');
    expect(p.x).toBeCloseTo(q.x, 6);
    expect(p.y).toBeCloseTo(q.y, 6);
  });
});
