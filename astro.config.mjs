import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

// https://astro.build/config
export default defineConfig({
  // Deploys to GitHub Pages as a PROJECT page, served from a /<repo>/ subpath.
  // `site`/`base` come from env so no repo name is hard-coded: the deploy workflow
  // injects PUBLIC_SITE=https://<owner>.github.io and PUBLIC_BASE=/<repo>/. Locally
  // they're unset, so the site builds at the root for `bun run dev`/`build`. Every
  // internal link routes through import.meta.env.BASE_URL to work in both.
  site: process.env.PUBLIC_SITE,
  base: process.env.PUBLIC_BASE || '/',
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
