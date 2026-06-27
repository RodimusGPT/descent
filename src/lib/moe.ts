/**
 * moe.ts — illustrative mixture-of-experts routing model (spec 10.1).
 *
 * Pure, deterministic helpers backing the MoERouter interactive. The headline
 * idea: a transformer's feed-forward block holds MOST of its parameters, so an
 * MoE replaces that one dense FFN with MANY expert FFNs plus a small router that
 * picks the top-k experts for each token. Only those experts run, so the ACTIVE
 * parameter count per token is a small fraction of the total (the classic
 * "~5B active of ~117B total"). Numbers here are ILLUSTRATIVE teaching devices.
 */

import { softmax } from '@/lib/nn';

/** One chosen expert and its renormalized routing weight. */
export interface ExpertWeight {
  expert: number;
  weight: number;
}

/** The full routing decision for a single token. */
export interface RouteResult {
  /** Gate distribution: softmax over ALL expert logits (sums to 1). */
  gate: number[];
  /** Indices of the top-k experts by logit, highest first. */
  chosen: number[];
  /** The chosen experts with gate values RENORMALIZED to sum to 1. */
  weights: ExpertWeight[];
}

/**
 * Route a token: softmax the router logits into a gate distribution over all
 * experts, pick the top-k by logit, and renormalize those k gate values so the
 * weights the active experts contribute with sum to 1.
 *
 * `k` is clamped to [1, logits.length]. Empty logits yield an empty decision.
 */
export function route(logits: number[], k: number): RouteResult {
  const n = logits.length;
  if (n === 0) return { gate: [], chosen: [], weights: [] };

  const kk = Math.max(1, Math.min(Math.floor(k), n));
  const gate = softmax(logits);

  // Top-k expert indices by logit, highest first. Ties break by lower index so
  // the selection is deterministic.
  const chosen = logits
    .map((logit, expert) => ({ logit, expert }))
    .sort((a, b) => b.logit - a.logit || a.expert - b.expert)
    .slice(0, kk)
    .map((d) => d.expert);

  const chosenGateSum = chosen.reduce((sum, e) => sum + gate[e], 0);
  const weights: ExpertWeight[] = chosen.map((expert) => ({
    expert,
    weight: chosenGateSum === 0 ? 1 / kk : gate[expert] / chosenGateSum,
  }));

  return { gate, chosen, weights };
}

/** Parameters describing one illustrative MoE configuration. */
export interface MoePreset {
  /** Total number of expert FFNs in the layer pool. */
  totalExperts: number;
  /** How many experts each token is routed to. */
  topK: number;
  /** Parameters in a single expert FFN, in billions. */
  paramsPerExpertB: number;
  /**
   * Always-on parameters (attention, embeddings, shared/dense expert), in
   * billions — these run for every token regardless of routing.
   */
  sharedParamsB: number;
}

/**
 * MOE_PRESET — an illustrative config in the spirit of a ~117B-total model that
 * activates only ~5B parameters per token (128 experts, top-4 routing).
 */
export const MOE_PRESET: MoePreset = {
  totalExperts: 128,
  topK: 4,
  paramsPerExpertB: 0.9,
  sharedParamsB: 1.5,
};

/** The active vs. total parameter counts (in billions) for a preset. */
export interface ActiveParams {
  /** Parameters that actually run per token: topK experts + shared. */
  activeB: number;
  /** All parameters present: every expert + shared. */
  totalB: number;
}

/**
 * activeParamsB — how many of the preset's parameters run per token vs. how many
 * exist. Active counts only the routed `topK` experts (plus always-on shared
 * params); total counts every expert. The ratio active/total ≈ topK/totalExperts
 * (exactly so once shared params are netted out), illustrating why MoE is cheap
 * to run yet huge to store. `k` overrides the preset's topK when provided.
 */
export function activeParamsB(preset: MoePreset = MOE_PRESET, k?: number): ActiveParams {
  const kk = Math.max(1, Math.min(Math.floor(k ?? preset.topK), preset.totalExperts));
  const activeB = kk * preset.paramsPerExpertB + preset.sharedParamsB;
  const totalB = preset.totalExperts * preset.paramsPerExpertB + preset.sharedParamsB;
  return { activeB, totalB };
}
