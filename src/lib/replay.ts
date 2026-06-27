/**
 * replay.ts — spec 10.5, the Part 5 synthesis.
 *
 * STAGES is the single ordered walk of the WHOLE inference journey the reader has
 * descended through: the opening prompt traversing the entire stack, top (abstract
 * model) to bottom (physical silicon), now legible. Each stage recaps one earlier
 * part of the descent in a single sentence, tinted by its part `kind` so the
 * model/hardware/neutral grammar carries through the replay.
 *
 * Order mirrors the descent itself:
 *   tokenize → embed → attention (×N layers) → FFN/MoE → logits → sample   (Part 1)
 *   → the weights are billions of numbers, quantized                        (Part 2)
 *   → the engine: prefill fills the KV cache, decode emits one at a time    (Part 3)
 *   → it all runs on tensor cores, capped by memory bandwidth               (Part 4)
 *   → out comes the next token                                              (Part 5)
 */
import type { PartKind } from './encoding';
import { PARTS } from './parts';

export interface ReplayStage {
  /** Stable id (used as a React key and for lookups). */
  id: string;
  /** Short title for the stage card. */
  title: string;
  /** One concise sentence recapping the part this stage revisits. */
  recap: string;
  /** Which part of the descent this stage recaps — a valid PARTS index (0–5). */
  partIndex: number;
  /** Drives the accent color, consistent with the recapped part's kind. */
  kind: PartKind;
}

export const STAGES: readonly ReplayStage[] = [
  {
    id: 'tokenize',
    title: 'Tokenize',
    recap: 'The prompt is split into tokens — the discrete units the model actually reads.',
    partIndex: 1,
    kind: 'model',
  },
  {
    id: 'embed',
    title: 'Embed',
    recap: 'Each token becomes a vector — a point in the model’s high-dimensional meaning space.',
    partIndex: 1,
    kind: 'model',
  },
  {
    id: 'attention',
    title: 'Attention × N layers',
    recap: 'Layer after layer, every token attends to the others, mixing context into each vector.',
    partIndex: 1,
    kind: 'model',
  },
  {
    id: 'ffn',
    title: 'Feed-forward / MoE',
    recap: 'Each layer’s feed-forward block — or its routed experts — reshapes the vectors.',
    partIndex: 1,
    kind: 'model',
  },
  {
    id: 'logits',
    title: 'Logits',
    recap: 'The final vector is projected to a score for every token in the vocabulary.',
    partIndex: 1,
    kind: 'model',
  },
  {
    id: 'sample',
    title: 'Sample',
    recap: 'Softmax turns the scores into probabilities, and one token is sampled as the next.',
    partIndex: 1,
    kind: 'model',
  },
  {
    id: 'quantize',
    title: 'Quantized weights',
    recap: 'Those layers are billions of numbers, squeezed to 4- or 8-bit so they fit in memory.',
    partIndex: 2,
    kind: 'model',
  },
  {
    id: 'engine',
    title: 'Prefill & decode',
    recap: 'The serving engine prefills the KV cache, then decodes one token at a time.',
    partIndex: 3,
    kind: 'neutral',
  },
  {
    id: 'silicon',
    title: 'Tensor cores & bandwidth',
    recap: 'It all runs on tensor cores, ultimately capped by memory bandwidth.',
    partIndex: 4,
    kind: 'hardware',
  },
  {
    id: 'next',
    title: 'The next token',
    recap: 'Out comes one token — appended to the prompt, and the whole descent runs again.',
    partIndex: 5,
    kind: 'neutral',
  },
] as const;

/** Total number of stages in the replay. */
export const STAGE_COUNT = STAGES.length;

/** The stage at ordered position `i`, or undefined if out of range. */
export function stageAt(i: number): ReplayStage | undefined {
  return STAGES[i];
}

/** The PartMeta a stage recaps (always defined for in-range stages). */
export function partForStage(stage: ReplayStage) {
  return PARTS[stage.partIndex];
}
