/**
 * parts.ts — canonical metadata for the six-part descent.
 *
 * The whole site is one continuous descent from abstract (the model) to physical
 * (the silicon). This array is the single source of that order and is consumed by
 * the landing page, the per-part pages, and the ProgressRail (the spine indicator).
 * `slug` must match the corresponding file in src/content/parts/<slug>.mdx.
 */
import type { PartKind } from './encoding';

export interface PartMeta {
  /** 0-based position in the descent. */
  index: number;
  /** Content-collection slug, == filename without extension. */
  slug: string;
  /** Short title shown in nav and the rail. */
  title: string;
  /** The question this part answers. */
  question: string;
  /** Drives the accent color (model = purple, hardware = teal). */
  kind: PartKind;
  /** One-word depth marker for the descent rail. */
  depth: string;
}

export const PARTS: readonly PartMeta[] = [
  {
    index: 0,
    slug: '0-hook',
    title: 'The prompt',
    question: 'What just happened when I hit enter?',
    kind: 'neutral',
    depth: 'surface',
  },
  {
    index: 1,
    slug: '1-transformer',
    title: 'The transformer',
    question: 'What is the model?',
    kind: 'model',
    depth: 'model',
  },
  {
    index: 2,
    slug: '2-weights',
    title: 'Weights as numbers',
    question: 'How are the weights represented?',
    kind: 'model',
    depth: 'numbers',
  },
  {
    index: 3,
    slug: '3-software',
    title: 'Inference: software',
    question: 'How is it served?',
    kind: 'neutral',
    depth: 'software',
  },
  {
    index: 4,
    slug: '4-hardware',
    title: 'Inference: hardware',
    question: 'How does the silicon run it?',
    kind: 'hardware',
    depth: 'silicon',
  },
  {
    index: 5,
    slug: '5-synthesis',
    title: 'The whole descent',
    question: 'Now show me the whole thing.',
    kind: 'neutral',
    depth: 'synthesis',
  },
] as const;

/** Look up a part by its slug. */
export function partBySlug(slug: string): PartMeta | undefined {
  return PARTS.find((p) => p.slug === slug);
}
