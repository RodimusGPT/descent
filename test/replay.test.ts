import { describe, expect, it } from 'vitest';
import { PARTS } from '../src/lib/parts';
import { STAGES, STAGE_COUNT, partForStage, stageAt } from '../src/lib/replay';

describe('replay — the full-stack synthesis walk', () => {
  it('STAGES is non-empty', () => {
    expect(STAGES.length).toBeGreaterThan(0);
    expect(STAGE_COUNT).toBe(STAGES.length);
  });

  it('every stage has a non-empty title and recap', () => {
    for (const stage of STAGES) {
      expect(stage.id.length).toBeGreaterThan(0);
      expect(stage.title.trim().length).toBeGreaterThan(0);
      expect(stage.recap.trim().length).toBeGreaterThan(0);
    }
  });

  it('stage ids are unique', () => {
    const ids = new Set(STAGES.map((s) => s.id));
    expect(ids.size).toBe(STAGES.length);
  });

  it('every partIndex is a valid PARTS index (0–5)', () => {
    for (const stage of STAGES) {
      expect(Number.isInteger(stage.partIndex)).toBe(true);
      expect(stage.partIndex).toBeGreaterThanOrEqual(0);
      expect(stage.partIndex).toBeLessThan(PARTS.length);
      // partForStage resolves to the matching PartMeta.
      expect(partForStage(stage)).toBe(PARTS[stage.partIndex]);
    }
  });

  it('each stage kind matches the kind of the part it recaps', () => {
    for (const stage of STAGES) {
      expect(stage.kind).toBe(PARTS[stage.partIndex].kind);
    }
  });

  it('collectively references parts 1, 2, 3 and 4 — the whole stack', () => {
    const referenced = new Set(STAGES.map((s) => s.partIndex));
    for (const required of [1, 2, 3, 4]) {
      expect(referenced.has(required)).toBe(true);
    }
  });

  it('is ordered: partIndex is non-decreasing top to bottom (descent order)', () => {
    for (let i = 1; i < STAGES.length; i++) {
      expect(STAGES[i].partIndex).toBeGreaterThanOrEqual(STAGES[i - 1].partIndex);
    }
  });

  it('stageAt returns the stage at a position, undefined out of range', () => {
    expect(stageAt(0)).toBe(STAGES[0]);
    expect(stageAt(STAGES.length - 1)).toBe(STAGES[STAGES.length - 1]);
    expect(stageAt(-1)).toBeUndefined();
    expect(stageAt(STAGES.length)).toBeUndefined();
  });
});
