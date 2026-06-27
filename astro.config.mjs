import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

/**
 * Tag content headings (h2/h3) as guided-tour stops so DescentTour pauses on each
 * prose beat. Dependency-free walk over the HAST tree; `dataTourStop` serializes to
 * the `data-tour-stop` attribute.
 */
function rehypeTourStops() {
  const visit = (node) => {
    if (node.type === 'element' && (node.tagName === 'h2' || node.tagName === 'h3')) {
      node.properties = node.properties || {};
      node.properties.dataTourStop = true;
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };
  return (tree) => visit(tree);
}

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
    rehypePlugins: [rehypeKatex, rehypeTourStops],
  },
});
