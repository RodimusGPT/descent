/**
 * autoregression.ts — the generation loop (spec 10.1).
 *
 * A language model generates text one token at a time. Each step it reads the
 * ENTIRE context produced so far, emits exactly one next token, appends it, and
 * feeds the longer context back in. The context therefore grows by one token per
 * step — and so does the work, unless the per-token keys/values are cached. That
 * caching motivation pays off in Part 3 (the KV cache).
 *
 * This module is a fixed, scripted "generation": no model, no randomness — just
 * the deterministic sequence of tokens an idealized model would emit, so the
 * visual can replay the loop step by step.
 */

/** Initial context fed in before any token is generated (the prompt). */
export const PROMPT: string[] = ['Once', 'upon'];

/** The tokens emitted, in order, one per generation step. */
export const SCRIPT: string[] = ['a', 'time', 'there', 'was', 'a', 'cat', '.'];

/**
 * The growing context fed back in at `step`: the prompt followed by the first
 * `step` generated tokens. `step` is clamped to `[0, SCRIPT.length]`.
 *
 *   contextAt(0)             === PROMPT
 *   contextAt(SCRIPT.length) === PROMPT + SCRIPT  (the full assembled sentence)
 */
export function contextAt(step: number): string[] {
  const s = clampStep(step);
  return [...PROMPT, ...SCRIPT.slice(0, s)];
}

/**
 * Number of tokens in the context at `step` (== contextAt(step).length).
 * Increments by exactly one each step — the "context grows, work grows" point.
 */
export function contextLengthAt(step: number): number {
  return PROMPT.length + clampStep(step);
}

/** The token emitted AT `step` (i.e. the next token appended going from step-1 → step). */
export function emittedAt(step: number): string | null {
  if (step < 1 || step > SCRIPT.length) return null;
  return SCRIPT[step - 1];
}

/** Total number of generation steps (one per scripted token). */
export const TOTAL_STEPS: number = SCRIPT.length;

function clampStep(step: number): number {
  if (Number.isNaN(step) || step < 0) return 0;
  if (step > SCRIPT.length) return SCRIPT.length;
  return Math.floor(step);
}
