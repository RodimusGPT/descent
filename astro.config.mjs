import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

// https://astro.build/config
export default defineConfig({
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
