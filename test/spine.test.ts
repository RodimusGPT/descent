import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PARTS, partBySlug } from '../src/lib/parts';

describe('I2 — the descent spine is complete and ordered', () => {
  it('has exactly six parts', () => {
    expect(PARTS).toHaveLength(6);
  });

  it('is indexed 0..5 in order', () => {
    PARTS.forEach((part, i) => {
      expect(part.index).toBe(i);
    });
  });

  it('has unique slugs', () => {
    const slugs = PARTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('has a matching MDX file for every part (no orphan/missing parts)', () => {
    for (const part of PARTS) {
      const file = new URL(`../src/content/parts/${part.slug}.mdx`, import.meta.url);
      expect(existsSync(file), `missing content for ${part.slug}`).toBe(true);
    }
  });

  it('resolves parts by slug', () => {
    expect(partBySlug('1-transformer')?.title).toBe('The transformer');
    expect(partBySlug('does-not-exist')).toBeUndefined();
  });
});
