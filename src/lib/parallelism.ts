/**
 * parallelism.ts — three ways to split a large model across devices (spec 10.4).
 *
 * Once a model (and its KV cache) no longer fits on a single accelerator, the
 * work must be partitioned across many. There are three distinct axes, and real
 * deployments combine them:
 *
 *   TENSOR PARALLEL (TP) — shard every weight MATRIX across devices. Each device
 *     holds a slice of every layer and computes a partial activation; an
 *     ALL-REDUCE every layer sums the slices back together. Chatty and latency-
 *     sensitive, so it is bounded by intra-node interconnect bandwidth (NVLink).
 *
 *   PIPELINE PARALLEL (PP) — split the LAYERS into consecutive stages, one stage
 *     per device. Activations flow POINT-TO-POINT from stage to stage. Cheap on
 *     bandwidth, but the pipeline has "bubbles": stages sit idle while the first
 *     microbatch fills the pipe and the last drains it. Splitting a batch into
 *     more microbatches shrinks the bubble.
 *
 *   EXPERT PARALLEL (EP) — distribute a Mixture-of-Experts layer's EXPERTS across
 *     devices. Each token is routed to its chosen experts, which generally live
 *     on other devices, so an ALL-TO-ALL shuffles tokens there and back.
 *
 * Pure, deterministic teaching helpers — no rendering, no randomness.
 */

/** Which collective communication a strategy leans on. */
export type CommOp = 'all-reduce' | 'point-to-point' | 'all-to-all';

/** The three parallelism axes. */
export type StrategyKey = 'tp' | 'pp' | 'ep';

/** A single parallelism strategy and its defining characteristics. */
export interface Strategy {
  key: StrategyKey;
  /** Human-readable name. */
  name: string;
  /** What unit of the model gets sharded across devices. */
  splits: string;
  /** The collective op that stitches the shards back together. */
  commOp: CommOp;
  /** The resource the strategy is primarily bottlenecked by. */
  boundBy: string;
  /** A short teaching note. */
  note: string;
}

/**
 * The three ways to split a model across devices. Order is TP, PP, EP — roughly
 * from finest-grained (inside each matrix) to coarsest (whole expert FFNs).
 */
export const STRATEGIES: readonly Strategy[] = [
  {
    key: 'tp',
    name: 'Tensor parallel',
    splits: 'each weight matrix, sharded across devices',
    commOp: 'all-reduce',
    boundBy: 'interconnect bandwidth (NVLink)',
    note: 'Every device holds a slice of every layer and computes a partial activation; an all-reduce each layer sums the slices. Chatty — keep it inside one node.',
  },
  {
    key: 'pp',
    name: 'Pipeline parallel',
    splits: 'consecutive ranges of layers (stages)',
    commOp: 'point-to-point',
    boundBy: 'pipeline bubbles (idle stages)',
    note: 'Each device owns a stage; activations flow stage to stage. Stages idle while the pipe fills and drains — more microbatches shrink the bubble.',
  },
  {
    key: 'ep',
    name: 'Expert parallel',
    splits: 'MoE experts, spread across devices',
    commOp: 'all-to-all',
    boundBy: 'all-to-all routing traffic',
    note: 'Each MoE layer’s experts live on different devices; tokens are shuffled to their chosen experts and back with an all-to-all.',
  },
] as const;

/**
 * Fraction of pipeline time that stages spend IDLE (the "bubble").
 *
 * With `stages` pipeline stages processing `microbatches` microbatches, the
 * total schedule length is (microbatches + stages - 1) microbatch-slots, of
 * which (stages - 1) are the fill-and-drain bubble. So the idle fraction is
 *
 *     bubble = (stages - 1) / (microbatches + stages - 1)
 *
 * It lies in [0, 1), DECREASES as microbatches grow, and tends to 0 as
 * microbatches → ∞ — the standard motivation for many small microbatches.
 *
 * `stages` and `microbatches` are clamped to at least 1.
 */
export function pipelineBubbleFraction(stages: number, microbatches: number): number {
  const s = Math.max(1, Math.floor(stages));
  const m = Math.max(1, Math.floor(microbatches));
  return (s - 1) / (m + s - 1);
}
