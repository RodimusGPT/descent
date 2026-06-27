/**
 * engines.ts — the inference-ENGINES landscape (spec 10.3).
 *
 * Once a model exists, you still need software to RUN it: an inference engine
 * that turns weights + a prompt into tokens, fast. Four engines dominate, and
 * each is shaped by a different priority:
 *
 *   - llama.cpp     — portable, GGUF, runs anywhere; single-user / local.
 *   - vLLM          — production multi-user serving; PagedAttention.
 *   - SGLang        — RadixAttention prefix caching; agentic / structured.
 *   - TensorRT-LLM  — maximum NVIDIA throughput, behind a compile step.
 *
 * The four `dims` are ILLUSTRATIVE 1..5 character ratings, NOT benchmarks. They
 * exist only to convey the SHAPE of each engine's trade-offs at a glance.
 */

/** The four character dimensions, each an illustrative 1..5 rating. */
export interface EngineDims {
  /** Runs across many platforms / accelerators / consumer hardware. */
  portability: number;
  /** Built to serve many concurrent users efficiently. */
  multiUser: number;
  /** Reuses shared prompt prefixes across requests (prefix/radix caching). */
  prefixCaching: number;
  /** Raw tokens-per-second ceiling on its best-case hardware. */
  throughput: number;
}

/** One inference engine and its illustrative character. */
export interface Engine {
  /** Stable identifier key. */
  key: string;
  /** Display name. */
  name: string;
  /** One-line essence of the engine. */
  tagline: string;
  /** The scenario this engine is the obvious pick for. */
  bestFor: string;
  /** The signature technical idea associated with the engine. */
  keyTech: string;
  /** Illustrative 1..5 ratings across the four dimensions. */
  dims: EngineDims;
}

/**
 * The four dominant engines. Ratings are deliberately COARSE teaching values
 * chosen to reflect each engine's reputation and priorities — not measurements.
 */
export const ENGINES: Engine[] = [
  {
    key: 'llama.cpp',
    name: 'llama.cpp',
    tagline: 'Runs a quantized model almost anywhere.',
    bestFor: 'Single-user, local & on-device inference',
    keyTech: 'GGUF format + portable C/C++ (CPU, Metal, many backends)',
    dims: { portability: 5, multiUser: 1, prefixCaching: 2, throughput: 2 },
  },
  {
    key: 'vllm',
    name: 'vLLM',
    tagline: 'High-throughput multi-user serving.',
    bestFor: 'Production endpoints with many concurrent users',
    keyTech: 'PagedAttention — paged KV-cache memory management',
    dims: { portability: 3, multiUser: 5, prefixCaching: 4, throughput: 4 },
  },
  {
    key: 'sglang',
    name: 'SGLang',
    tagline: 'Prefix-cache-first serving for agents.',
    bestFor: 'Agentic & structured workloads with shared prefixes',
    keyTech: 'RadixAttention — automatic prefix (radix-tree) caching',
    dims: { portability: 3, multiUser: 5, prefixCaching: 5, throughput: 4 },
  },
  {
    key: 'trtllm',
    name: 'TensorRT-LLM',
    tagline: 'Maximum throughput on NVIDIA GPUs.',
    bestFor: 'Squeezing peak tokens/sec out of NVIDIA hardware',
    keyTech: 'Ahead-of-time compiled, fused TensorRT engines',
    dims: { portability: 2, multiUser: 4, prefixCaching: 4, throughput: 5 },
  },
];

/** The four dimension keys, in a stable display order. */
export const DIM_KEYS = [
  'portability',
  'multiUser',
  'prefixCaching',
  'throughput',
] as const satisfies readonly (keyof EngineDims)[];

/** Human-readable label for each dimension key. */
export const DIM_LABELS: Record<keyof EngineDims, string> = {
  portability: 'Portability',
  multiUser: 'Multi-user',
  prefixCaching: 'Prefix caching',
  throughput: 'Throughput',
};

/** Maximum value any illustrative dimension rating can take. */
export const DIM_MAX = 5;

/** Look up an engine by key, or undefined if none matches. */
export function engineByKey(key: string): Engine | undefined {
  return ENGINES.find((e) => e.key === key);
}
