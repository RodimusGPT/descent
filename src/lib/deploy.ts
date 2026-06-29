/**
 * deploy.ts — where you actually run a model: the three deployment modes.
 *
 * The same open-weights model can run in three places, trading control for
 * convenience:
 *   - LOCAL: on your own machine (laptop / workstation).
 *   - SELF-HOSTED: a serving engine on GPUs you rent or own.
 *   - MANAGED API: someone else runs the GPU; you call an endpoint.
 *
 * Tools and trait ratings are ILLUSTRATIVE (as of ~2026) — they convey the SHAPE
 * of each mode's trade-offs, not rankings or benchmarks.
 */

/** A representative tool for a deployment mode. */
export interface DeployTool {
  name: string;
  note: string;
}

/** Illustrative 1..5 ratings of what each mode is good at. */
export interface DeployTraits {
  /** Control / privacy — does your data and the weights stay with you. */
  control: number;
  /** Convenience — how little ops work to get running. */
  convenience: number;
  /** Cost-efficiency at high volume (5 = cheapest per token at scale). */
  costAtScale: number;
  /** Best achievable latency / time-to-first-token (5 = fastest). */
  latency: number;
  /** Breadth of models you can run. */
  choice: number;
}

/** One deployment mode and its character. */
export interface DeployMode {
  key: string;
  label: string;
  blurb: string;
  tools: DeployTool[];
  traits: DeployTraits;
}

/** The trait keys, in a stable display order. */
export const TRAIT_KEYS = [
  'control',
  'convenience',
  'costAtScale',
  'latency',
  'choice',
] as const satisfies readonly (keyof DeployTraits)[];

/** Human-readable label for each trait. */
export const TRAIT_LABELS: Record<keyof DeployTraits, string> = {
  control: 'Control / privacy',
  convenience: 'Convenience',
  costAtScale: 'Cost at scale',
  latency: 'Latency',
  choice: 'Model choice',
};

/** Maximum value any illustrative trait rating can take. */
export const TRAIT_MAX = 5;

/** The three modes, ordered most-control → least-control (local → managed). */
export const DEPLOY_MODES: readonly DeployMode[] = [
  {
    key: 'local',
    label: 'Local',
    blurb:
      'Run it on your own machine — private, offline, free after the download. Capped by your RAM and memory bandwidth.',
    tools: [
      { name: 'Ollama', note: 'one-command models; now an MLX backend on Apple Silicon' },
      { name: 'llama.cpp', note: 'portable C/C++ core; the GGUF format; runs almost anywhere' },
      { name: 'LM Studio', note: 'a desktop GUI over llama.cpp / MLX' },
      { name: 'Apple MLX', note: 'fastest on Apple Silicon; bandwidth-bound on big models' },
    ],
    traits: { control: 5, convenience: 4, costAtScale: 2, latency: 3, choice: 4 },
  },
  {
    key: 'selfhosted',
    label: 'Self-hosted',
    blurb:
      'Run a serving engine on GPUs you rent or own — full control and the best cost at scale, but you own the ops.',
    tools: [
      { name: 'vLLM', note: 'the flexible default; PagedAttention + continuous batching' },
      { name: 'SGLang', note: 'RadixAttention prefix caching; agentic workloads' },
      { name: 'TensorRT-LLM', note: 'peak NVIDIA throughput, behind a compile step' },
      { name: 'NVIDIA Dynamo', note: 'multi-node serving with disaggregated prefill / decode' },
    ],
    traits: { control: 4, convenience: 2, costAtScale: 5, latency: 4, choice: 5 },
  },
  {
    key: 'managed',
    label: 'Managed API',
    blurb:
      'Call an endpoint; someone else runs the GPU. Zero ops and instant scale — you trade away control and pay per token.',
    tools: [
      { name: 'Together / Fireworks', note: 'broad open-weights catalogs + fine-tuning' },
      { name: 'Groq / Cerebras', note: 'specialized chips — very low latency / high throughput' },
      { name: 'OpenRouter', note: 'one API key routed across many providers' },
      { name: 'Bedrock / Vertex', note: 'hyperscaler endpoints with compliance + billing' },
    ],
    traits: { control: 2, convenience: 5, costAtScale: 3, latency: 4, choice: 4 },
  },
] as const;

/** Look up a mode by key, or undefined if none matches. */
export function deployModeByKey(key: string): DeployMode | undefined {
  return DEPLOY_MODES.find((m) => m.key === key);
}
