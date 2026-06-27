import { describe, expect, it } from 'vitest';
import { VOCAB_MAX, splitWord, tokenize } from '../src/lib/tokenize';

const SAMPLES = [
  'The transformer reads tokenization as subword pieces.',
  'Hello, world!',
  '   leading and  internal   spaces   ',
  'newlines\nand\ttabs',
  'CamelCase ALLCAPS mixed123 digits 4567',
  'punctuation: a, b; c. d? e! (f) [g] {h}',
  'one',
  '',
  'a',
  '   ',
  'café naïve résumé',
];

describe('tokenize — determinism', () => {
  it('same input twice produces identical token arrays', () => {
    for (const s of SAMPLES) {
      expect(tokenize(s)).toEqual(tokenize(s));
    }
  });
});

describe('tokenize — exact round-trip reconstruction', () => {
  it('concatenating tok.text reproduces the input', () => {
    for (const s of SAMPLES) {
      const rebuilt = tokenize(s)
        .map((t) => t.text)
        .join('');
      expect(rebuilt).toBe(s);
    }
  });

  it('handles the empty string as zero tokens', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('tokenize — id range', () => {
  it('every id is an integer within [0, VOCAB_MAX]', () => {
    for (const s of SAMPLES) {
      for (const tok of tokenize(s)) {
        expect(Number.isInteger(tok.id)).toBe(true);
        expect(tok.id).toBeGreaterThanOrEqual(0);
        expect(tok.id).toBeLessThanOrEqual(VOCAB_MAX);
      }
    }
  });

  it('same piece text always maps to the same id', () => {
    const a = tokenize('the the the');
    const ids = a.filter((t) => t.text === 'the').map((t) => t.id);
    expect(new Set(ids).size).toBe(1);
  });
});

describe('tokenize — subword splitting', () => {
  it('splits a long compound word into >= 2 subword tokens', () => {
    const toks = tokenize('tokenization');
    const subwords = toks.filter((t) => t.kind === 'subword');
    expect(subwords.length).toBeGreaterThanOrEqual(2);
    expect(subwords.map((t) => t.text).join('')).toBe('tokenization');
  });

  it('keeps short words whole as a single "word" token', () => {
    const toks = tokenize('cat');
    expect(toks).toHaveLength(1);
    expect(toks[0].kind).toBe('word');
  });

  it('classifies whitespace and punctuation tokens', () => {
    const toks = tokenize('hi, there');
    const kinds = new Set(toks.map((t) => t.kind));
    expect(kinds.has('punct')).toBe(true);
    expect(kinds.has('space')).toBe(true);
  });
});

describe('splitWord — concatenation safety', () => {
  it('pieces always re-join to the original word', () => {
    for (const w of ['transformer', 'tokenization', 'running', 'understandable', 'x', 'house']) {
      expect(splitWord(w).join('')).toBe(w);
    }
  });
});
