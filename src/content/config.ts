import { defineCollection, z } from 'astro:content';

/**
 * The six parts of the descent. Prose lives in MDX; interactives are embedded as
 * islands. Frontmatter mirrors the canonical metadata in src/lib/parts.ts (which
 * drives the rail/nav) — the `order`/`kind` here let the content layer stand on
 * its own and are cross-checked in tests.
 */
const parts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    order: z.number().int().min(0),
    kind: z.enum(['model', 'hardware', 'neutral']),
    question: z.string(),
    /** Name of the signature interactive this part anchors on. */
    signature: z.string().optional(),
    /** Short summary for nav cards. */
    summary: z.string().optional(),
  }),
});

export const collections = { parts };
