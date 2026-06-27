import { describe, expect, it } from 'vitest';
import {
  SAMPLE_SLOTS,
  SAMPLE_WORKLOAD,
  type Seq,
  scheduleContinuous,
  scheduleStatic,
  utilization,
} from '../src/lib/batching';

/** All sequence ids that appear anywhere in a schedule. */
function idsIn(schedule: (number | null)[][]): Set<number> {
  const ids = new Set<number>();
  for (const row of schedule) {
    for (const cell of row) {
      if (cell !== null) ids.add(cell);
    }
  }
  return ids;
}

/** Count of occupied cells in a single row. */
function busyInRow(row: (number | null)[]): number {
  let n = 0;
  for (const cell of row) if (cell !== null) n++;
  return n;
}

const ALL_IDS = new Set(SAMPLE_WORKLOAD.map((s) => s.id));

describe('schedule shape invariants', () => {
  it('every row has exactly `slots` entries (both schedulers)', () => {
    for (const slots of [1, 2, 3, 4]) {
      for (const sched of [
        scheduleStatic(SAMPLE_WORKLOAD, slots),
        scheduleContinuous(SAMPLE_WORKLOAD, slots),
      ]) {
        for (const row of sched) {
          expect(row).toHaveLength(slots);
        }
      }
    }
  });

  it('no row ever exceeds `slots` occupied cells', () => {
    for (const slots of [1, 2, 3, 4]) {
      const sched = scheduleContinuous(SAMPLE_WORKLOAD, slots);
      for (const row of sched) {
        expect(busyInRow(row)).toBeLessThanOrEqual(slots);
      }
      const stat = scheduleStatic(SAMPLE_WORKLOAD, slots);
      for (const row of stat) {
        expect(busyInRow(row)).toBeLessThanOrEqual(slots);
      }
    }
  });

  it('both schedulers eventually run ALL sequences', () => {
    expect(idsIn(scheduleStatic(SAMPLE_WORKLOAD, SAMPLE_SLOTS))).toEqual(ALL_IDS);
    expect(idsIn(scheduleContinuous(SAMPLE_WORKLOAD, SAMPLE_SLOTS))).toEqual(ALL_IDS);
  });

  it('preserves total decode work (busy cells == sum of lengths)', () => {
    const work = SAMPLE_WORKLOAD.reduce((a, s) => a + s.length, 0);
    const countBusy = (sched: (number | null)[][]) =>
      sched.reduce((a, row) => a + busyInRow(row), 0);
    expect(countBusy(scheduleStatic(SAMPLE_WORKLOAD, SAMPLE_SLOTS))).toBe(work);
    expect(countBusy(scheduleContinuous(SAMPLE_WORKLOAD, SAMPLE_SLOTS))).toBe(work);
  });
});

describe('utilization', () => {
  it('is in [0, 1] and 0 for an empty schedule', () => {
    expect(utilization([])).toBe(0);
    const u = utilization(scheduleStatic(SAMPLE_WORKLOAD, SAMPLE_SLOTS));
    expect(u).toBeGreaterThanOrEqual(0);
    expect(u).toBeLessThanOrEqual(1);
  });

  it('continuous >= static, and STRICTLY greater on the varying-length sample', () => {
    const us = utilization(scheduleStatic(SAMPLE_WORKLOAD, SAMPLE_SLOTS));
    const uc = utilization(scheduleContinuous(SAMPLE_WORKLOAD, SAMPLE_SLOTS));
    expect(uc).toBeGreaterThanOrEqual(us);
    expect(uc).toBeGreaterThan(us);
  });

  it('continuous >= static across several slot widths', () => {
    for (const slots of [1, 2, 3, 4, 5]) {
      const us = utilization(scheduleStatic(SAMPLE_WORKLOAD, slots));
      const uc = utilization(scheduleContinuous(SAMPLE_WORKLOAD, slots));
      expect(uc).toBeGreaterThanOrEqual(us - 1e-9);
    }
  });
});

describe('continuous: waiting work fills a freed slot within one iteration', () => {
  // All-arrival workload so iteration index == row index (no skipped lead rows):
  // any free slot is filled while work is queued, so no idle cell can appear
  // before the LAST sequence has started.
  const w0: Seq[] = [
    { id: 0, arrival: 0, length: 4 },
    { id: 1, arrival: 0, length: 1 },
    { id: 2, arrival: 0, length: 2 },
    { id: 3, arrival: 0, length: 3 },
    { id: 4, arrival: 0, length: 1 },
  ];

  it('no idle cell appears before every sequence has begun', () => {
    const sched = scheduleContinuous(w0, 2);
    // First row in which each id appears.
    const startRow = new Map<number, number>();
    sched.forEach((row, r) => {
      for (const cell of row) {
        if (cell !== null && !startRow.has(cell)) startRow.set(cell, r);
      }
    });
    const lastStart = Math.max(...[...startRow.values()]);
    sched.forEach((row, r) => {
      if (r < lastStart) {
        expect(busyInRow(row)).toBe(2); // both slots busy: no wasted slot while work waits
      }
    });
  });
});

describe('static: no new sequence starts until the batch fully drains', () => {
  it('new ids appear only at a batch boundary (disjoint from the previous row)', () => {
    const sched = scheduleStatic(SAMPLE_WORKLOAD, SAMPLE_SLOTS);
    for (let r = 1; r < sched.length; r++) {
      const prev = new Set(sched[r - 1].filter((c): c is number => c !== null));
      const cur = sched[r].filter((c): c is number => c !== null);
      const newIds = cur.filter((id) => !prev.has(id));
      if (newIds.length > 0) {
        // A new sequence started → the previous batch must have fully drained,
        // i.e. none of the previous row's sequences continue into this row.
        for (const id of cur) {
          expect(prev.has(id)).toBe(false);
        }
      }
    }
  });
});
