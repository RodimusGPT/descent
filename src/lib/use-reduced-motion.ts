import { useEffect, useState } from 'react';

/**
 * Reactively report the user's `prefers-reduced-motion` setting (Invariant I4).
 * Every island uses this to gate tweening — when true, components snap between
 * states instead of animating, and render a meaningful static frame.
 *
 * SSR-safe: returns `false` during server render and on first paint, then
 * synchronizes to the real media query after mount.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
