import { type RefObject, useEffect, useState } from 'react';

/**
 * Reports whether an element is on (or near) screen, via IntersectionObserver.
 * Interactive islands use it to PAUSE animation timers when scrolled out of view
 * — no point burning the main thread animating something nobody can see, and it
 * keeps scrolling past a playing visual smooth.
 *
 * Defaults to `true` (and stays true if IO is unavailable) so animations are never
 * wrongly suppressed before/without observation.
 */
export function useInView(ref: RefObject<Element | null>, rootMargin = '200px'): boolean {
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setInView(entry.isIntersecting);
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);

  return inView;
}
