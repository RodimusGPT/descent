import { describe, expect, it, vi } from 'vitest';
import { moveRadioFocus, rovingNextIndex } from '../src/lib/roving';

describe('rovingNextIndex', () => {
  it('advances and wraps with ArrowRight/ArrowDown', () => {
    expect(rovingNextIndex('ArrowRight', 0, 4)).toBe(1);
    expect(rovingNextIndex('ArrowDown', 1, 4)).toBe(2);
    expect(rovingNextIndex('ArrowRight', 3, 4)).toBe(0); // wrap forward
  });

  it('retreats and wraps with ArrowLeft/ArrowUp', () => {
    expect(rovingNextIndex('ArrowLeft', 2, 4)).toBe(1);
    expect(rovingNextIndex('ArrowUp', 1, 4)).toBe(0);
    expect(rovingNextIndex('ArrowLeft', 0, 4)).toBe(3); // wrap backward
  });

  it('jumps to ends with Home/End', () => {
    expect(rovingNextIndex('Home', 2, 4)).toBe(0);
    expect(rovingNextIndex('End', 1, 4)).toBe(3);
  });

  it('returns null for non-navigation keys and empty groups', () => {
    expect(rovingNextIndex('Enter', 1, 4)).toBeNull();
    expect(rovingNextIndex(' ', 1, 4)).toBeNull();
    expect(rovingNextIndex('a', 1, 4)).toBeNull();
    expect(rovingNextIndex('ArrowRight', 0, 0)).toBeNull();
  });
});

describe('moveRadioFocus', () => {
  function makeEvent(key: string) {
    // A radio button inside a radiogroup with three radios; the helper finds the
    // siblings via closest('[role="radiogroup"]') and focuses the target.
    const radios = [0, 1, 2].map(() => {
      const el = { focus: vi.fn() } as unknown as HTMLElement;
      return el;
    });
    const group = {
      querySelectorAll: () => radios as unknown as NodeListOf<HTMLElement>,
    } as unknown as Element;
    const currentTarget = {
      closest: (sel: string) => (sel === '[role="radiogroup"]' ? group : null),
    } as unknown as HTMLElement;
    const preventDefault = vi.fn();
    return {
      e: { key, preventDefault, currentTarget } as unknown as Parameters<typeof moveRadioFocus>[0],
      radios,
      preventDefault,
    };
  }

  it('moves selection and focus on arrow keys', () => {
    const { e, radios, preventDefault } = makeEvent('ArrowRight');
    const setIndex = vi.fn();
    moveRadioFocus(e, 0, 3, setIndex);
    expect(preventDefault).toHaveBeenCalled();
    expect(setIndex).toHaveBeenCalledWith(1);
    expect(radios[1].focus).toHaveBeenCalled();
  });

  it('wraps focus backward from the first option', () => {
    const { e, radios } = makeEvent('ArrowLeft');
    const setIndex = vi.fn();
    moveRadioFocus(e, 0, 3, setIndex);
    expect(setIndex).toHaveBeenCalledWith(2);
    expect(radios[2].focus).toHaveBeenCalled();
  });

  it('ignores non-navigation keys (no selection change, no preventDefault)', () => {
    const { e, preventDefault } = makeEvent('Enter');
    const setIndex = vi.fn();
    moveRadioFocus(e, 0, 3, setIndex);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(setIndex).not.toHaveBeenCalled();
  });
});
