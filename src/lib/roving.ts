import type { KeyboardEvent } from 'react';

/**
 * Shared WAI-ARIA radiogroup keyboard navigation (Invariant I4).
 *
 * A single-select "chip" group (precision, model, head, strategy, …) must behave
 * like a real radio group: exactly one option in the tab order (each option sets
 * `tabIndex={active ? 0 : -1}`), and Arrow keys (plus Home/End) moving BOTH
 * selection and focus, wrapping at the ends. This is the one implementation every
 * such group imports, so the behavior is identical everywhere.
 */

/**
 * The next option index for a roving group given a navigation key, or `null` if
 * the key should not move selection. Arrows wrap at both ends; Home/End jump to
 * the first/last option. Pure — unit-tested in test/roving.test.ts.
 */
export function rovingNextIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (index + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * `onKeyDown` handler for one option in a button-based radio group. Wire it as
 * `onKeyDown={(e) => moveRadioFocus(e, index, count, setIndex)}` on each option,
 * give each option `role="radio"` + `aria-checked` + `tabIndex={active ? 0 : -1}`,
 * and put `role="radiogroup"` on the container.
 *
 * Ref-free: the sibling options are located via the enclosing `[role="radiogroup"]`,
 * so call sites never thread ref arrays. Selection follows focus.
 */
export function moveRadioFocus(
  e: KeyboardEvent<HTMLElement>,
  currentIndex: number,
  count: number,
  setIndex: (i: number) => void,
): void {
  const next = rovingNextIndex(e.key, currentIndex, count);
  if (next === null) return;
  e.preventDefault();
  setIndex(next);
  const group = e.currentTarget.closest('[role="radiogroup"]');
  const radios = group?.querySelectorAll<HTMLElement>('[role="radio"]');
  radios?.[next]?.focus();
}
