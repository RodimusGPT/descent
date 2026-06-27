/**
 * attention-data.ts — the data + geometry behind the AttentionFan centerpiece
 * (spec 9.1).
 *
 * A short, legible sentence is tokenized once; several attention "heads" then
 * impose DISTINCT, hand-built weighting patterns over those tokens. Each head's
 * matrix is row-stochastic: row = query token, col = key token, every row sums
 * to ~1 so a single query's weights form a probability distribution.
 *
 * The pure `weightToGeometry` mapping turns a weight in [0,1] into the stroke
 * opacity + width used to draw each fan line, so visual prominence tracks
 * attention mass. It is the unit under test in test/attention.test.ts.
 */

export interface TokenDatum {
  text: string;
  id: number;
}

/** The sentence the reader follows across the fan. N = TOKENS.length. */
export const TOKENS: TokenDatum[] = [
  { text: 'The', id: 0 },
  { text: 'tired', id: 1 },
  { text: 'cat', id: 2 },
  { text: 'sat', id: 3 },
  { text: 'on', id: 4 },
  { text: 'the', id: 5 },
  { text: 'warm', id: 6 },
  { text: 'mat', id: 7 },
  { text: '.', id: 8 },
];

export interface Head {
  name: string;
  description: string;
  /** NxN, row-normalized. rows = query token, cols = key token. */
  matrix: number[][];
}

const N = TOKENS.length;

/**
 * Normalize every row of a matrix so it sums to exactly ~1 (Σ = 1 within float
 * error). A tiny floor is added everywhere first so no row can be all-zero and
 * every key keeps a faint, visible thread.
 */
export function rowNormalize(rows: number[][]): number[][] {
  return rows.map((row) => {
    const floored = row.map((v) => Math.max(v, 1e-6));
    const sum = floored.reduce((a, b) => a + b, 0);
    return floored.map((v) => v / sum);
  });
}

/** (1) Previous-token head: each query attends mostly to the token before it. */
function buildPreviousToken(): number[][] {
  const rows: number[][] = [];
  for (let q = 0; q < N; q++) {
    const row = new Array<number>(N).fill(0.02);
    const prev = q - 1;
    if (prev >= 0) {
      row[prev] = 1;
    } else {
      // First token has no predecessor; let it attend to itself.
      row[q] = 1;
    }
    rows.push(row);
  }
  return rowNormalize(rows);
}

/**
 * (2) Content head: structured links between related words — the subject "cat"
 * and the verb "sat", the modifier "warm" and the noun "mat", determiners to
 * their nouns. Reads as a syntactic skeleton rather than a positional shift.
 */
function buildContent(): number[][] {
  // index map for readability
  const The = 0;
  const tired = 1;
  const cat = 2;
  const sat = 3;
  const on = 4;
  const the = 5;
  const warm = 6;
  const mat = 7;
  const dot = 8;

  const links: Array<[number, number, number]> = [
    [The, cat, 1.0], // determiner -> its noun
    [tired, cat, 1.0], // adjective -> noun it modifies
    [cat, sat, 1.0], // subject -> verb
    [sat, cat, 0.7], // verb -> subject
    [sat, mat, 0.6], // verb -> location object
    [on, mat, 1.0], // preposition -> object
    [the, mat, 1.0], // determiner -> its noun
    [warm, mat, 1.0], // adjective -> noun it modifies
    [mat, sat, 1.0], // object -> verb
    [dot, sat, 1.0], // period -> main verb
  ];

  const rows: number[][] = [];
  for (let q = 0; q < N; q++) {
    rows.push(new Array<number>(N).fill(0.03));
  }
  for (const [q, k, w] of links) {
    rows[q][k] = w;
  }
  return rowNormalize(rows);
}

/** (3) Broad head: weight spread fairly evenly across all tokens. */
function buildBroad(): number[][] {
  const rows: number[][] = [];
  for (let q = 0; q < N; q++) {
    const row = new Array<number>(N).fill(1);
    // a very mild self-emphasis keeps it from being perfectly flat
    row[q] = 1.6;
    rows.push(row);
  }
  return rowNormalize(rows);
}

export const HEADS: Head[] = [
  {
    name: 'Previous token',
    description: 'Each query attends to the token immediately before it.',
    matrix: buildPreviousToken(),
  },
  {
    name: 'Content',
    description: 'Subject↔verb, modifier→noun, determiner→noun — a syntactic skeleton.',
    matrix: buildContent(),
  },
  {
    name: 'Broad',
    description: 'Attention spread almost evenly across every token.',
    matrix: buildBroad(),
  },
];

export interface FanGeometry {
  opacity: number;
  width: number;
}

const OPACITY_MIN = 0.06;
const OPACITY_MAX = 1;
const WIDTH_MIN = 0.5;
const WIDTH_MAX = 6;

/**
 * Map an attention weight in [0,1] to stroke geometry. Both opacity and width
 * increase monotonically with weight and are clamped: weight 0 → minimum,
 * weight 1 → maximum. Out-of-range input is clamped first.
 */
export function weightToGeometry(weight: number): FanGeometry {
  const t = weight < 0 ? 0 : weight > 1 ? 1 : Number.isNaN(weight) ? 0 : weight;
  return {
    opacity: OPACITY_MIN + (OPACITY_MAX - OPACITY_MIN) * t,
    width: WIDTH_MIN + (WIDTH_MAX - WIDTH_MIN) * t,
  };
}
