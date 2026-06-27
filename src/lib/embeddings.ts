/**
 * embeddings.ts — the data behind the EmbeddingSpace scatter (spec 10.1).
 *
 * Concept: every token becomes a vector; words with similar meanings sit close
 * together (legible semantic CLUSTERS) and consistent DIRECTIONS encode
 * relationships. We hand-place ~26 common words on a clean 2D grid (0..100) so
 * the structure is readable at a glance and the classic analogy
 *
 *     king − man + woman ≈ queen
 *
 * lands exactly: the royalty cluster is built as a parallelogram where the
 * "royal" offset (man→king) equals (woman→queen) and the "gender" offset
 * (man→woman) equals (king→queen). The pure helpers below are unit-tested in
 * test/embeddings.test.ts.
 */

/** A single word placed in the 2D embedding plane. */
export interface WordVec {
  word: string;
  x: number;
  y: number;
  cluster: string;
}

/** The semantic clusters, in a stable order (drives the categorical palette). */
export const CLUSTERS: string[] = ['royalty', 'animals', 'numbers', 'food', 'verbs'];

/**
 * Hand-placed coordinates in [0,100]². Each cluster occupies a separated region
 * so same-cluster distances are clearly smaller than cross-cluster ones. The
 * royalty four (man, woman, king, queen) form a parallelogram so the analogy
 * vector king − man + woman resolves onto queen's exact coordinates.
 */
export const EMBEDDINGS: WordVec[] = [
  // royalty — a parallelogram in the top-right.
  //   x = "royal-ness" (common 70 → royal 78), y = "gender" (male 70 → female 78)
  { word: 'man', x: 70, y: 70, cluster: 'royalty' },
  { word: 'woman', x: 70, y: 78, cluster: 'royalty' },
  { word: 'king', x: 78, y: 70, cluster: 'royalty' },
  { word: 'queen', x: 78, y: 78, cluster: 'royalty' },
  { word: 'prince', x: 84, y: 71, cluster: 'royalty' },
  { word: 'princess', x: 84, y: 79, cluster: 'royalty' },

  // animals — top-left.
  { word: 'dog', x: 18, y: 70, cluster: 'animals' },
  { word: 'cat', x: 22, y: 72, cluster: 'animals' },
  { word: 'horse', x: 26, y: 76, cluster: 'animals' },
  { word: 'cow', x: 18, y: 78, cluster: 'animals' },
  { word: 'lion', x: 26, y: 70, cluster: 'animals' },
  { word: 'wolf', x: 22, y: 80, cluster: 'animals' },

  // numbers — bottom-left.
  { word: 'one', x: 18, y: 20, cluster: 'numbers' },
  { word: 'two', x: 22, y: 18, cluster: 'numbers' },
  { word: 'three', x: 26, y: 22, cluster: 'numbers' },
  { word: 'four', x: 18, y: 26, cluster: 'numbers' },
  { word: 'five', x: 24, y: 26, cluster: 'numbers' },

  // food — bottom-right.
  { word: 'bread', x: 74, y: 20, cluster: 'food' },
  { word: 'apple', x: 78, y: 18, cluster: 'food' },
  { word: 'cheese', x: 82, y: 22, cluster: 'food' },
  { word: 'wine', x: 74, y: 26, cluster: 'food' },
  { word: 'soup', x: 82, y: 26, cluster: 'food' },

  // verbs — center.
  { word: 'run', x: 46, y: 48, cluster: 'verbs' },
  { word: 'jump', x: 54, y: 48, cluster: 'verbs' },
  { word: 'walk', x: 46, y: 52, cluster: 'verbs' },
  { word: 'swim', x: 54, y: 52, cluster: 'verbs' },
];

/** Look up a word's vector (case-insensitive). Returns undefined if absent. */
export function vec(word: string): WordVec | undefined {
  const key = word.toLowerCase();
  return EMBEDDINGS.find((w) => w.word.toLowerCase() === key);
}

/** Euclidean distance on (x,y) between two word vectors. */
export function distance(a: WordVec, b: WordVec): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * The k nearest words to `word` by Euclidean distance on (x,y), excluding the
 * word itself. Returns fewer than k if there are not enough words; [] if the
 * word is unknown.
 */
export function nearest(word: string, k: number): WordVec[] {
  const self = vec(word);
  if (!self) return [];
  return EMBEDDINGS.filter((w) => w !== self)
    .map((w) => ({ w, d: distance(self, w) }))
    .sort((p, q) => p.d - q.d)
    .slice(0, Math.max(0, k))
    .map((p) => p.w);
}

/** The analogy the interactive showcases: king − man + woman ≈ queen. */
export const ANALOGY = {
  a: 'king',
  b: 'man',
  c: 'woman',
  expected: 'queen',
} as const;

/**
 * Resolve a word analogy "a is to b as ? is to c", i.e. the nearest word to the
 * point vec(a) − vec(b) + vec(c). The three input words are excluded from the
 * candidate set (standard for analogy queries). Returns the resolved word, or
 * '' if any input is unknown.
 */
export function analogy(a: string, b: string, c: string): string {
  const va = vec(a);
  const vb = vec(b);
  const vc = vec(c);
  if (!va || !vb || !vc) return '';
  const tx = va.x - vb.x + vc.x;
  const ty = va.y - vb.y + vc.y;
  const inputs = new Set([va.word, vb.word, vc.word]);
  let best: WordVec | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const w of EMBEDDINGS) {
    if (inputs.has(w.word)) continue;
    const dx = w.x - tx;
    const dy = w.y - ty;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best ? best.word : '';
}

/** Coordinates of the analogy result point vec(a) − vec(b) + vec(c). */
export function analogyPoint(a: string, b: string, c: string): { x: number; y: number } | null {
  const va = vec(a);
  const vb = vec(b);
  const vc = vec(c);
  if (!va || !vb || !vc) return null;
  return { x: va.x - vb.x + vc.x, y: va.y - vb.y + vc.y };
}
