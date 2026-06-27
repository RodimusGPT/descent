import { describe, expect, it } from 'vitest';
import {
  PROMPT,
  SCRIPT,
  TOTAL_STEPS,
  contextAt,
  contextLengthAt,
  emittedAt,
} from '../src/lib/autoregression';

describe('autoregression — scripted generation loop', () => {
  it('contextAt(0) is exactly the prompt', () => {
    expect(contextAt(0)).toEqual(PROMPT);
  });

  it('contextAt(SCRIPT.length) is the prompt followed by the full script', () => {
    expect(contextAt(SCRIPT.length)).toEqual([...PROMPT, ...SCRIPT]);
  });

  it('the final assembled context equals the whole sentence', () => {
    const final = contextAt(TOTAL_STEPS);
    expect(final).toEqual([...PROMPT, ...SCRIPT]);
    // TOTAL_STEPS is one step per scripted token
    expect(TOTAL_STEPS).toBe(SCRIPT.length);
  });

  it('appends exactly the next scripted token at each step', () => {
    for (let step = 1; step <= SCRIPT.length; step++) {
      const prev = contextAt(step - 1);
      const next = contextAt(step);
      expect(next.length).toBe(prev.length + 1);
      // everything before the new token is unchanged (append-only)
      expect(next.slice(0, prev.length)).toEqual(prev);
      // the new last token is the scripted one for this step
      expect(next[next.length - 1]).toBe(SCRIPT[step - 1]);
      expect(emittedAt(step)).toBe(SCRIPT[step - 1]);
    }
  });

  it('contextLengthAt matches contextAt length and increments by one each step', () => {
    for (let step = 0; step <= SCRIPT.length; step++) {
      expect(contextLengthAt(step)).toBe(contextAt(step).length);
    }
    for (let step = 1; step <= SCRIPT.length; step++) {
      expect(contextLengthAt(step) - contextLengthAt(step - 1)).toBe(1);
    }
  });

  it('contextLengthAt is monotonically increasing', () => {
    let prev = -1;
    for (let step = 0; step <= SCRIPT.length; step++) {
      const len = contextLengthAt(step);
      expect(len).toBeGreaterThan(prev);
      prev = len;
    }
  });

  it('clamps out-of-range steps to the valid window', () => {
    expect(contextAt(-3)).toEqual(PROMPT);
    expect(contextAt(SCRIPT.length + 5)).toEqual([...PROMPT, ...SCRIPT]);
    expect(contextLengthAt(-1)).toBe(PROMPT.length);
    expect(contextLengthAt(SCRIPT.length + 9)).toBe(PROMPT.length + SCRIPT.length);
    expect(emittedAt(0)).toBeNull();
    expect(emittedAt(SCRIPT.length + 1)).toBeNull();
  });

  it('the prompt is non-empty and the script generates a multi-token sentence', () => {
    expect(PROMPT.length).toBeGreaterThan(0);
    expect(SCRIPT.length).toBeGreaterThanOrEqual(3);
  });
});
