import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

// https://astro.build/config
export default defineConfig({
  // Deploys to GitHub Pages as a <username>.github.io user/org site, served at the
  // domain root — so NO `base` path is needed (a project page under /<repo>/ would
  // need `base: '/<repo>/'` plus base-aware links). Optionally set `site` for
  // canonical/sitemap absolute URLs:  site: 'https://<username>.github.io',
  //
  // Static-first: prose is .astro/.mdx, interactivity ships as React islands only.
  integrations: [
    react(),
    // @astrojs/mdx extends the markdown config below by default, so the math
    // plugins apply to both .md and .mdx.
    mdx(),
    // Base styles are owned by src/styles/global.css so we control the cascade.
    tailwind({ applyBaseStyles: false }),
  ],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
  },
});
