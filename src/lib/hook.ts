/**
 * hook.ts — the Part 0 opening hook (spec 10.0).
 *
 * The very first idea the reader meets: a prompt is just text the model continues,
 * one token at a time. Each example prompt carries a tiny hand-authored candidate
 * vocabulary with illustrative logits; softmax (with a temperature knob) turns those
 * into a probability distribution, and the top entry is the token the model would
 * emit next. The math is the same softmax/temperature used everywhere downstream —
 * only the vocabulary is hand-picked so the reveal lands.
 */

import { argmax, softmaxWithTemperature } from '@/lib/nn';

/** One candidate next-token with a base (pre-temperature) logit. */
export interface HookCandidate {
  token: string;
  logit: number;
}

/** An evocative example prompt and its plausible next-token candidates. */
export interface HookPrompt {
  id: string;
  text: string;
  candidates: HookCandidate[];
}

/**
 * A handful of example prompts. Logits are illustrative and ordered so the first
 * candidate is the intended "obvious" continuation. Deterministic — no randomness.
 */
export const PROMPTS: readonly HookPrompt[] = [
  {
    id: 'paris',
    text: 'The capital of France is',
    candidates: [
      { token: ' Paris', logit: 6.4 },
      { token: ' a', logit: 2.1 },
      { token: ' the', logit: 1.8 },
      { token: ' home', logit: 1.3 },
      { token: ' located', logit: 1.0 },
      { token: ' famous', logit: 0.6 },
    ],
  },
  {
    id: 'math',
    text: '2 + 2 =',
    candidates: [
      { token: ' 4', logit: 7.1 },
      { token: ' 5', logit: 1.4 },
      { token: ' four', logit: 1.2 },
      { token: ' 22', logit: 0.7 },
      { token: ' ?', logit: 0.3 },
      { token: ' 3', logit: 0.1 },
    ],
  },
  {
    id: 'fairytale',
    text: 'Once upon a',
    candidates: [
      { token: ' time', logit: 6.8 },
      { token: ' midnight', logit: 1.9 },
      { token: ' star', logit: 1.1 },
      { token: ' dream', logit: 0.9 },
      { token: ' hill', logit: 0.5 },
      { token: ' day', logit: 1.5 },
    ],
  },
  {
    id: 'code',
    text: 'def fibonacci(n):',
    candidates: [
      { token: '\\n    if', logit: 4.6 },
      { token: '\\n    return', logit: 4.0 },
      { token: '\\n    a', logit: 2.8 },
      { token: '\\n    """', logit: 2.5 },
      { token: '\\n    n', logit: 1.6 },
      { token: ' pass', logit: 0.4 },
    ],
  },
  {
    id: 'sky',
    text: 'The sky is',
    candidates: [
      { token: ' blue', logit: 5.2 },
      { token: ' clear', logit: 2.6 },
      { token: ' falling', logit: 1.9 },
      { token: ' grey', logit: 2.2 },
      { token: ' the', logit: 0.8 },
      { token: ' a', logit: 0.5 },
    ],
  },
] as const;

/** Look up a prompt by id (first prompt as a safe fallback). */
export function promptById(id: string): HookPrompt {
  return PROMPTS.find((p) => p.id === id) ?? PROMPTS[0];
}

/** A predicted next-token with its probability under the current temperature. */
export interface Prediction {
  token: string;
  prob: number;
}

/**
 * Predict the next-token distribution for a prompt: softmax-with-temperature over
 * its candidate logits, returned as {token, prob} sorted by probability descending.
 * Ties broken by original candidate order for stability.
 */
export function predict(promptId: string, temperature: number): Prediction[] {
  const prompt = promptById(promptId);
  const logits = prompt.candidates.map((c) => c.logit);
  const probs = softmaxWithTemperature(logits, temperature);
  return prompt.candidates
    .map((c, i) => ({ token: c.token, prob: probs[i], index: i }))
    .sort((a, b) => b.prob - a.prob || a.index - b.index)
    .map(({ token, prob }) => ({ token, prob }));
}

/**
 * The single token the model would emit next: the highest-probability candidate.
 * Temperature never changes which entry is the argmax, but the signature keeps it
 * symmetric with `predict`.
 */
export function topToken(promptId: string, temperature: number): string {
  const prompt = promptById(promptId);
  const logits = prompt.candidates.map((c) => c.logit);
  const probs = softmaxWithTemperature(logits, temperature);
  const i = argmax(probs);
  return i < 0 ? '' : prompt.candidates[i].token;
}
