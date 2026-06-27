/**
 * tokenize.ts — a deterministic mock subword (BPE-ish) tokenizer.
 *
 * This is NOT a real BPE merge table; it is a small, legible stand-in that
 * conveys the idea the chapter needs: raw text is chopped into whitespace,
 * punctuation, words, and — for longer/compound words — multiple subword
 * pieces, each mapped to a stable integer id in the GPT-2-sized vocab range.
 *
 * Hard invariant (tested): concatenating every `tok.text` in order reproduces
 * the EXACT input string, byte for byte. Every character belongs to exactly one
 * token, so nothing is dropped, merged, or reordered.
 */

/** Upper bound of the (GPT-2-sized) mock vocabulary; ids land in [0, VOCAB_MAX]. */
export const VOCAB_MAX = 50256;

export type TokKind = 'word' | 'subword' | 'punct' | 'space';

export interface Tok {
  /** The exact source slice this token covers. */
  text: string;
  /** Deterministic vocab id in [0, VOCAB_MAX]. */
  id: number;
  kind: TokKind;
}

/**
 * Stable FNV-1a hash of a piece's text, folded into [0, VOCAB_MAX]. Pure and
 * deterministic: the same string always maps to the same id.
 */
export function hashId(text: string): number {
  let h = 2166136261; // FNV offset basis
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619); // FNV prime
  }
  return (h >>> 0) % (VOCAB_MAX + 1);
}

const WORD_CHAR = /[\p{L}\p{N}]/u;
const SPACE_CHAR = /\s/;

// Curated affix lists give the split a plausible morphological feel. Suffixes
// are ordered longest-first so the greedy peel prefers the largest match.
const PREFIXES = [
  'trans',
  'inter',
  'under',
  'over',
  'sub',
  'pre',
  'non',
  'dis',
  'mis',
  'out',
  're',
  'un',
];
const SUFFIXES = [
  'ization',
  'isation',
  'ation',
  'ition',
  'tion',
  'sion',
  'ness',
  'ment',
  'able',
  'ible',
  'ical',
  'ing',
  'ers',
  'ize',
  'ise',
  'ity',
  'ous',
  'ful',
  'est',
  'er',
  'ed',
  'ly',
  'es',
  's',
];

/**
 * Split one word into >= 1 pieces whose concatenation equals the word. Short
 * words stay whole; longer ones shed a prefix and up to two suffixes, and a
 * still-long bare stem is halved — yielding the multi-piece subword behavior.
 */
export function splitWord(word: string): string[] {
  if (word.length <= 4) return [word];

  const lower = word.toLowerCase();
  let lo = 0;
  let hi = word.length;
  const prefixPieces: string[] = [];
  const suffixPieces: string[] = []; // collected end-first, reversed before emit

  // Peel a single leading prefix, leaving a stem of at least 3 chars.
  for (const p of PREFIXES) {
    if (hi - lo > p.length + 2 && lower.startsWith(p, lo)) {
      prefixPieces.push(word.slice(lo, lo + p.length));
      lo += p.length;
      break;
    }
  }

  // Peel up to two trailing suffixes, each leaving a stem of at least 2 chars.
  let peels = 0;
  let changed = true;
  while (peels < 2 && changed) {
    changed = false;
    for (const s of SUFFIXES) {
      if (hi - lo > s.length + 1 && lower.endsWith(s, hi)) {
        suffixPieces.push(word.slice(hi - s.length, hi));
        hi -= s.length;
        peels++;
        changed = true;
        break;
      }
    }
  }

  const stem = word.slice(lo, hi);
  const pieces: string[] = [...prefixPieces];

  if (prefixPieces.length === 0 && suffixPieces.length === 0 && stem.length > 6) {
    // A long word with no recognizable affixes still gets broken in two.
    const mid = Math.ceil(stem.length / 2);
    pieces.push(stem.slice(0, mid), stem.slice(mid));
  } else if (stem.length > 0) {
    pieces.push(stem);
  }

  pieces.push(...suffixPieces.reverse());
  return pieces.length > 0 ? pieces : [word];
}

/**
 * Tokenize text into ordered subword tokens. Whitespace and punctuation are
 * preserved as their own tokens so the stream round-trips exactly.
 */
export function tokenize(text: string): Tok[] {
  const toks: Tok[] = [];
  const n = text.length;
  let i = 0;

  while (i < n) {
    const ch = text[i];

    if (SPACE_CHAR.test(ch)) {
      let j = i + 1;
      while (j < n && SPACE_CHAR.test(text[j])) j++;
      const piece = text.slice(i, j);
      toks.push({ text: piece, id: hashId(piece), kind: 'space' });
      i = j;
    } else if (WORD_CHAR.test(ch)) {
      let j = i + 1;
      while (j < n && WORD_CHAR.test(text[j])) j++;
      const word = text.slice(i, j);
      const pieces = splitWord(word);
      const kind: TokKind = pieces.length > 1 ? 'subword' : 'word';
      for (const piece of pieces) {
        toks.push({ text: piece, id: hashId(piece), kind });
      }
      i = j;
    } else {
      // Any single non-word, non-space character is its own punctuation token.
      toks.push({ text: ch, id: hashId(ch), kind: 'punct' });
      i++;
    }
  }

  return toks;
}
