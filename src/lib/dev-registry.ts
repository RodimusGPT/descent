/**
 * Metadata for the /dev/* sandbox routes. Each interactive gets a standalone page
 * where it can be exercised in isolation (the agent cannot self-certify visuals, so
 * these routes are where a human reviews each piece — see QA.md). The component
 * references themselves live in src/pages/dev/[component].astro; this list is the
 * single source for which slugs exist, their titles, and the dev index.
 */
export interface DevSandbox {
  slug: string;
  title: string;
  description: string;
  /** Milestone that introduced it. */
  milestone: string;
}

export const DEV_SANDBOXES: DevSandbox[] = [
  {
    slug: 'token',
    title: 'Token motif',
    description: 'The single-sourced <Token/> in its various states.',
    milestone: 'M0',
  },
];
