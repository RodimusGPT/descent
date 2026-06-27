import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import scrollama from 'scrollama';

/**
 * ScrollScene — the core scrollytelling primitive.
 *
 * Layout: a narration column that scrolls past a `position: sticky` visual pane.
 * `scrollama` (IntersectionObserver) reports which narration step is in view and
 * the visual pane re-renders for that step via `render(activeStep)`.
 *
 * Accessibility (Invariant I4): the pane carries real Prev/Next <button> controls
 * so the scene is fully operable without scrolling, focus is managed, and the
 * active step is announced via aria-current. `render` receives `reducedMotion` so
 * visuals can snap instead of tween.
 */

export interface ScrollStep {
  id: string;
  narration: ReactNode;
}

export interface ScrollSceneRenderCtx {
  reducedMotion: boolean;
}

export interface ScrollSceneProps {
  steps: ScrollStep[];
  render: (activeStep: number, ctx: ScrollSceneRenderCtx) => ReactNode;
  /** Which side the sticky visual sits on (desktop). */
  visualSide?: 'left' | 'right';
  className?: string;
  ariaLabel?: string;
}

export function ScrollScene({
  steps,
  render,
  visualSide = 'right',
  className = '',
  ariaLabel,
}: ScrollSceneProps) {
  const [active, setActive] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  const narrationRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<Array<HTMLLIElement | null>>([]);

  useEffect(() => {
    const root = narrationRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-scrollstep]'));
    if (els.length === 0) return;

    const scroller = scrollama();
    scroller.setup({ step: els, offset: 0.5 }).onStepEnter(({ index }) => setActive(index));

    const onResize = () => scroller.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      scroller.destroy();
    };
  }, []);

  const goTo = useCallback(
    (target: number) => {
      const clamped = Math.max(0, Math.min(steps.length - 1, target));
      setActive(clamped);
      const el = stepRefs.current[clamped];
      if (el) {
        el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
      }
    },
    [steps.length, reducedMotion],
  );

  const visualOrder = visualSide === 'left' ? 'md:order-1' : 'md:order-2';
  const narrationOrder = visualSide === 'left' ? 'md:order-2' : 'md:order-1';

  return (
    <section className={`relative ${className}`} aria-label={ariaLabel ?? 'Scrollytelling scene'}>
      <div className="grid gap-x-10 md:grid-cols-2">
        {/* Sticky visual pane */}
        <div className={visualOrder}>
          <div className="sticky top-0 flex h-screen flex-col justify-center py-10">
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <div className="w-full">{render(active, { reducedMotion })}</div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted">
              <button
                type="button"
                className="rounded border border-border px-2 py-1 font-mono text-ink transition-colors hover:border-active disabled:opacity-40"
                onClick={() => goTo(active - 1)}
                disabled={active === 0}
              >
                ← Prev
              </button>
              <span aria-live="polite" className="tabular-nums">
                Step {active + 1} / {steps.length}
              </span>
              <button
                type="button"
                className="rounded border border-border px-2 py-1 font-mono text-ink transition-colors hover:border-active disabled:opacity-40"
                onClick={() => goTo(active + 1)}
                disabled={active === steps.length - 1}
              >
                Next →
              </button>
            </div>
          </div>
        </div>

        {/* Scrolling narration column */}
        <div className={narrationOrder} ref={narrationRef}>
          <ol className="list-none p-0">
            {steps.map((step, i) => (
              <li
                key={step.id}
                data-scrollstep
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                aria-current={i === active ? 'step' : undefined}
                className="flex min-h-[78vh] items-center"
              >
                <div
                  className="transition-opacity duration-500"
                  style={{ opacity: i === active ? 1 : 0.35 }}
                >
                  {step.narration}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export default ScrollScene;
