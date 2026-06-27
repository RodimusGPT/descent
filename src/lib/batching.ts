/**
 * batching.ts — static vs continuous batching for LLM serving (spec 10.3).
 *
 * GPUs want big batches. The question is how a server packs many decode
 * requests onto a fixed set of `slots`:
 *
 *   STATIC batching     — fill a batch of up to `slots` sequences and run that
 *                         batch until EVERY sequence in it has finished. Short
 *                         sequences that finish early leave their slot idle until
 *                         the whole batch drains, then the next batch loads. Easy
 *                         to implement, but wastes the freed slots.
 *
 *   CONTINUOUS batching — schedule per iteration. The instant a sequence finishes
 *                         and frees its slot, a waiting sequence takes that slot on
 *                         the very next iteration. No slot sits idle while work is
 *                         queued, so utilization is much higher.
 *
 * The functions below are pure and deterministic. A "schedule" is a grid: each
 * row is one decode iteration, each row has exactly `slots` entries, and an entry
 * is the id of the sequence occupying that slot on that iteration (or null if the
 * slot is idle). Lengths are ILLUSTRATIVE iteration counts, not real token counts.
 */

/** A request to be served. `length` = number of decode iterations it runs. */
export type Seq = {
  /** Stable identifier, also drives the categorical color in the UI. */
  id: number;
  /** Iteration index at which the request becomes available (arrives). */
  arrival: number;
  /** Number of decode iterations the request runs once started. */
  length: number;
};

/** Default number of concurrent slots (batch width) for the sample. */
export const SAMPLE_SLOTS = 3;

/**
 * Deterministic sample workload with VARYING lengths so static batching clearly
 * wastes freed slots. A couple of sequences arrive a little later, so continuous
 * batching is also seen pulling waiting work into freed slots.
 */
export const SAMPLE_WORKLOAD: Seq[] = [
  { id: 0, arrival: 0, length: 5 },
  { id: 1, arrival: 0, length: 2 },
  { id: 2, arrival: 0, length: 1 },
  { id: 3, arrival: 1, length: 4 },
  { id: 4, arrival: 2, length: 2 },
];

/** Clamp `slots` to a sane positive integer. */
function normSlots(slots: number): number {
  const n = Math.floor(slots);
  return n < 1 ? 1 : n;
}

/** Sort by arrival, breaking ties by id — fully deterministic ordering. */
function byArrival(a: Seq, b: Seq): number {
  return a.arrival - b.arrival || a.id - b.id;
}

/**
 * STATIC batching schedule.
 *
 * Repeatedly forms a batch from the next up-to-`slots` available sequences (in
 * arrival order) and runs that batch for `max(length)` iterations — every slot in
 * the batch is held until the longest member finishes. Sequences that finish early
 * leave a `null` (idle) slot for the rest of the batch. Only when the batch fully
 * drains does the next batch load.
 */
export function scheduleStatic(seqs: Seq[], slots: number): (number | null)[][] {
  const width = normSlots(slots);
  const queue = [...seqs].sort(byArrival);
  const rows: (number | null)[][] = [];
  let t = 0;

  while (queue.length > 0) {
    // Nothing available yet → jump forward to the next arrival.
    if (!queue.some((s) => s.arrival <= t)) {
      t = Math.min(...queue.map((s) => s.arrival));
    }

    // Take up to `width` already-arrived sequences, in queue order.
    const batch: Seq[] = [];
    for (const s of queue) {
      if (batch.length >= width) break;
      if (s.arrival <= t) batch.push(s);
    }
    for (const s of batch) {
      queue.splice(queue.indexOf(s), 1);
    }

    const duration = Math.max(...batch.map((s) => s.length));
    for (let i = 0; i < duration; i++) {
      const row: (number | null)[] = new Array(width).fill(null);
      for (let slot = 0; slot < batch.length; slot++) {
        if (i < batch[slot].length) row[slot] = batch[slot].id;
      }
      rows.push(row);
    }
    t += duration;
  }

  return rows;
}

/** Live occupancy of one slot during continuous scheduling. */
type SlotState = { id: number; remaining: number } | null;

/**
 * CONTINUOUS batching schedule.
 *
 * Each iteration: every free slot immediately pulls the next available waiting
 * sequence, then all occupied slots advance one iteration. A sequence that hits
 * zero remaining frees its slot at the end of the iteration, so the waiting
 * sequence that replaces it starts on the very next iteration — no idle gap while
 * work is queued.
 */
export function scheduleContinuous(seqs: Seq[], slots: number): (number | null)[][] {
  const width = normSlots(slots);
  const waiting = [...seqs].sort(byArrival);
  const slotState: SlotState[] = new Array(width).fill(null);
  const rows: (number | null)[][] = [];
  let t = 0;

  const takeNextArrived = (): Seq | null => {
    const idx = waiting.findIndex((s) => s.arrival <= t);
    if (idx < 0) return null;
    return waiting.splice(idx, 1)[0];
  };

  for (;;) {
    // Fill every free slot with the next arrived waiting sequence.
    for (let slot = 0; slot < width; slot++) {
      if (slotState[slot] === null) {
        const next = takeNextArrived();
        if (next) slotState[slot] = { id: next.id, remaining: next.length };
      }
    }

    const allIdle = slotState.every((s) => s === null);
    if (allIdle) {
      if (waiting.length === 0) break; // everything served — done
      t = Math.min(...waiting.map((s) => s.arrival)); // skip ahead to next arrival
      continue;
    }

    // Emit this iteration's row, then advance occupied slots by one.
    rows.push(slotState.map((s) => (s ? s.id : null)));
    for (let slot = 0; slot < width; slot++) {
      const s = slotState[slot];
      if (s) {
        s.remaining -= 1;
        if (s.remaining === 0) slotState[slot] = null; // frees this slot next iteration
      }
    }
    t += 1;
  }

  return rows;
}

/** Fraction of occupied (non-null) cells over total cells, in [0, 1]. */
export function utilization(schedule: (number | null)[][]): number {
  let busy = 0;
  let total = 0;
  for (const row of schedule) {
    for (const cell of row) {
      total += 1;
      if (cell !== null) busy += 1;
    }
  }
  if (total === 0) return 0;
  return busy / total;
}
