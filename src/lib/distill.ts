/**
 * distill.ts — illustrative model of knowledge DISTILLATION (spec 10.2).
 *
 * Distillation is the OTHER route to small models: rather than COMPRESSING an
 * existing model's numbers (quantization), you TRAIN a small student on a big
 * teacher's outputs — its answers, and especially its reasoning traces. The
 * student learns to imitate the teacher's behaviour, so capability is
 * TRANSFERRED rather than squeezed. Strikingly, even a small set of high-quality
 * examples (~1K) can transfer a surprising amount.
 *
 * Every number here is an ILLUSTRATIVE teaching device, not a benchmark. The
 * transfer score is a smooth saturating curve chosen only to convey the SHAPE
 * of the effect (fast early gains, diminishing returns), not any measured result.
 */

/** The large model whose behaviour we distil FROM. */
export interface TeacherModel {
  name: string;
  /** Parameter count, in billions. */
  paramsB: number;
}

/** The small model we distil INTO. */
export interface StudentModel {
  name: string;
  /** Parameter count, in billions. */
  paramsB: number;
}

/** Illustrative teacher: a large frontier-scale model. */
export const TEACHER: TeacherModel = { name: 'Teacher', paramsB: 70 };

/** Illustrative student: a much smaller model trained on the teacher's traces. */
export const STUDENT: StudentModel = { name: 'Student', paramsB: 7 };

/**
 * Preset training-set sizes (number of teacher examples / traces). The middle
 * value (~1K) echoes the surprising result that a modest set transfers a lot.
 */
export const EXAMPLE_PRESETS: readonly number[] = [100, 1000, 10000] as const;

/**
 * Half-saturation constant for the transfer curve: the example count at which
 * the illustrative score reaches 50. Chosen so that ~1K examples already lands
 * the student well up the curve.
 */
const HALF_SATURATION = 1000;

/**
 * transferProxy — an ILLUSTRATIVE 0..100 capability-transfer score that rises
 * with the number of teacher examples and exhibits clear diminishing returns.
 *
 * Uses a hyperbolic saturation, score = 100 * x / (x + k): early examples buy
 * large gains, later ones buy little. This is NOT a benchmark — it only conveys
 * the SHAPE of capability transfer. Deterministic (no Math.random).
 *
 * @param examples number of teacher examples / traces used to train the student
 * @returns a score in [0, 100]
 */
export function transferProxy(examples: number): number {
  const x = Number.isFinite(examples) && examples > 0 ? examples : 0;
  const score = (100 * x) / (x + HALF_SATURATION);
  // Numerical safety clamp into [0, 100].
  if (score < 0) return 0;
  if (score > 100) return 100;
  return score;
}
