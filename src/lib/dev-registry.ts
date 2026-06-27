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
  {
    slug: 'attention',
    title: 'Attention fan',
    description: 'Click/arrow to re-root the query; switch heads; hover for weight.',
    milestone: 'M1',
  },
  {
    slug: 'float',
    title: 'Float exploder',
    description: 'Toggle IEEE-754 bits across FP32 / FP16 / BF16; load presets.',
    milestone: 'M2',
  },
  {
    slug: 'quant',
    title: 'Quantization slider',
    description: 'Re-bucket the weight histogram across FP16 / INT8 / Q4 / Q2.',
    milestone: 'M2',
  },
  {
    slug: 'prefill',
    title: 'Prefill / decode + KV cache',
    description: 'Parallel prefill, token-by-token decode, KV grid, no-cache toggle.',
    milestone: 'M3',
  },
  {
    slug: 'tokenizer',
    title: 'Tokenizer',
    description: 'Live subword split of editable text into tokens + ids.',
    milestone: 'M4',
  },
  {
    slug: 'embeddings',
    title: 'Embedding space',
    description: '2D scatter; clusters + analogy (king − man + woman ≈ queen).',
    milestone: 'M4',
  },
  {
    slug: 'stack',
    title: 'Transformer stack',
    description: 'Pre-norm layer structure (norm → attn → FFN, residuals) + params.',
    milestone: 'M4',
  },
  {
    slug: 'qkv',
    title: 'Q/K/V + multi-head',
    description: 'Scaled dot-product → softmax → weighted V; heads; GQA/MQA toggle.',
    milestone: 'M4',
  },
  {
    slug: 'moe',
    title: 'MoE router',
    description: 'Router picks top-k experts; active vs total params.',
    milestone: 'M4',
  },
  {
    slug: 'sampling',
    title: 'Sampling playground',
    description: 'Temperature / top-k / top-p reshape the next-token distribution.',
    milestone: 'M4',
  },
  {
    slug: 'autoregression',
    title: 'Autoregression',
    description: 'Append the sampled token, feed back, repeat — the generation loop.',
    milestone: 'M4',
  },
  {
    slug: 'zoom',
    title: 'Zoom into a weight',
    description: 'Stepped zoom: model → layer → matrix → one float.',
    milestone: 'M5',
  },
  {
    slug: 'budget',
    title: 'Memory budget',
    description: 'Weights + KV cache stacked against a GPU’s VRAM.',
    milestone: 'M5',
  },
  {
    slug: 'blockscale',
    title: 'Block scaling (MXFP4)',
    description: 'Per-tensor vs per-block-of-32 scale; watch the error collapse.',
    milestone: 'M5',
  },
  {
    slug: 'distill',
    title: 'Distillation',
    description: 'Small student learns from a big teacher’s outputs.',
    milestone: 'M5',
  },
];
