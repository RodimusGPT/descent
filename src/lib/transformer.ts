/**
 * transformer.ts — the structural skeleton of a decoder transformer block (spec 10.1).
 *
 * Pure, deterministic data + arithmetic backing the TransformerStack diagram. The
 * model is intentionally minimal: a transformer is a stack of N identical layers,
 * and each layer is a fixed, ordered sequence of sub-blocks in PRE-norm form:
 *
 *   RMSNorm → Attention → (residual add) → RMSNorm → FFN → (residual add)
 *
 * The parameter arithmetic below uses the standard shapes and is ILLUSTRATIVE —
 * it omits biases, embeddings, the final norm, and the LM head, focusing on the
 * per-layer weight matrices so the attention-vs-FFN split reads clearly.
 */

/** Which functional role a sub-block plays inside one layer. */
export type BlockKind = 'norm' | 'attention' | 'ffn' | 'residual';

/** One ordered sub-block within a single transformer layer. */
export interface Block {
  id: string;
  label: string;
  kind: BlockKind;
  note: string;
}

/**
 * BLOCK — the ordered pre-norm structure of ONE transformer layer.
 *
 * Pre-norm (used by Llama, GPT-NeoX, most modern decoders): normalization happens
 * BEFORE each sub-layer, and the residual stream is added back AFTER. This keeps a
 * clean identity path from input to output, which makes deep stacks trainable.
 */
export const BLOCK: readonly Block[] = [
  {
    id: 'norm-1',
    label: 'RMSNorm',
    kind: 'norm',
    note: 'Normalizes the residual stream before attention. Pre-norm: scale only (RMS), no mean-centering.',
  },
  {
    id: 'attention',
    label: 'Self-Attention',
    kind: 'attention',
    note: 'Each token mixes information from earlier tokens. Q, K, V projections + output projection (~4·dModel² params).',
  },
  {
    id: 'residual-1',
    label: '+ residual',
    kind: 'residual',
    note: "Adds attention's output back onto the input stream, preserving an identity path for gradients.",
  },
  {
    id: 'norm-2',
    label: 'RMSNorm',
    kind: 'norm',
    note: 'Normalizes the stream again before the feed-forward network.',
  },
  {
    id: 'ffn',
    label: 'Feed-Forward (FFN)',
    kind: 'ffn',
    note: 'A per-token MLP that expands to dFF and projects back. Holds most of the parameters (~2·dModel·dFF).',
  },
  {
    id: 'residual-2',
    label: '+ residual',
    kind: 'residual',
    note: "Adds the FFN's output back onto the stream — the layer's final output, fed to the next layer.",
  },
] as const;

/** A realistic model configuration the user can switch between. */
export interface ModelConfig {
  name: string;
  /** Number of identical stacked layers. */
  nLayers: number;
  /** Residual-stream / hidden width. */
  dModel: number;
  /** Number of attention heads. */
  nHeads: number;
  /** Inner feed-forward width (typically ≥ 4·dModel). */
  dFF: number;
}

/**
 * MODEL_PRESETS — a few realistic decoder configurations. dFF is ~4·dModel (or
 * larger, as in SwiGLU-style FFNs which use ~8/3·dModel across two up-projections).
 */
export const MODEL_PRESETS: readonly ModelConfig[] = [
  { name: 'GPT-2 (124M)', nLayers: 12, dModel: 768, nHeads: 12, dFF: 3072 },
  { name: 'Llama-2 7B', nLayers: 32, dModel: 4096, nHeads: 32, dFF: 11008 },
  { name: 'Llama-2 13B', nLayers: 40, dModel: 5120, nHeads: 40, dFF: 13824 },
  { name: 'GPT-3 (175B)', nLayers: 96, dModel: 12288, nHeads: 96, dFF: 49152 },
] as const;

/** Per-layer + total parameter breakdown for a config, split attention vs FFN. */
export interface ParamBreakdown {
  /** Attention weight params: Q, K, V, and output projections ≈ 4·dModel². */
  attnParams: number;
  /** Feed-forward params: up- and down-projection ≈ 2·dModel·dFF. */
  ffnParams: number;
  /** Sum of attention + FFN params in one layer. */
  perLayer: number;
  /** perLayer × nLayers. */
  total: number;
}

/**
 * paramBreakdown — standard-shape parameter counts for one config.
 *
 *   attnParams = 4·dModel²        (Wq, Wk, Wv, Wo, each dModel×dModel)
 *   ffnParams  = 2·dModel·dFF     (up dModel×dFF, down dFF×dModel)
 *
 * Because dFF ≥ 4·dModel, ffnParams (= 2·dModel·dFF ≥ 8·dModel²) always exceeds
 * attnParams (= 4·dModel²) — the FFN holds the bulk of a layer's weights.
 */
export function paramBreakdown(cfg: ModelConfig): ParamBreakdown {
  const attnParams = 4 * cfg.dModel * cfg.dModel;
  const ffnParams = 2 * cfg.dModel * cfg.dFF;
  const perLayer = attnParams + ffnParams;
  const total = perLayer * cfg.nLayers;
  return { attnParams, ffnParams, perLayer, total };
}
