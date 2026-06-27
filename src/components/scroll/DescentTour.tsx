import { COLOR } from '@/lib/encoding';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { useEffect, useRef, useState } from 'react';

/**
 * DescentTour — a step-through navigator for the descent.
 *
 * The page is a sequence of "stops": each Beat / section heading (`[data-tour-stop]`)
 * and each ScrollScene narration step (`[data-scrollstep]`), in document order. The
 * control lets the reader move through them at their OWN pace with Prev / Next, and
 * shows where they are ("3 / 18"). Free scrolling still works — the counter tracks the
 * nearest stop. An optional auto-play advances on a timer for a hands-free read.
 *
 * Accessibility: real buttons; Prev/Next are the primary affordance; auto-play never
 * starts on its own and any manual wheel/touch/scroll-key stops it; under
 * prefers-reduced-motion every move is an instant jump rather than a glide.
 */

const SPEEDS = [1, 1.5, 2, 0.5] as const;

interface Engine {
  next: () => void;
  prev: () => void;
  toggleAuto: () => void;
  destroy: () => void;
}

interface Hooks {
  getReduced: () => boolean;
  getSpeed: () => number;
  onIndex: (active: number, total: number) => void;
  onAuto: (playing: boolean) => void;
}

function createEngine(hooks: Hooks): Engine {
  let stops: HTMLElement[] = [];
  let active = 0;
  let playing = false;
  let raf: number | null = null;
  let dwell: number | null = null;

  const absTop = (el: HTMLElement) => el.getBoundingClientRect().top + window.scrollY;
  const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
  const collect = () =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-tour-stop], [data-scrollstep]'));

  const refresh = () => {
    stops = collect();
    hooks.onIndex(active, stops.length);
  };

  // The stop whose anchor line is nearest the viewport's reading line.
  const nearest = (): number => {
    if (stops.length === 0) return 0;
    const line = window.scrollY + window.innerHeight * 0.4;
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < stops.length; i++) {
      const d = Math.abs(absTop(stops[i]) - line);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  };

  const targetFor = (el: HTMLElement) =>
    Math.max(0, Math.min(absTop(el) - window.innerHeight * 0.4, maxScroll()));

  const cancelAnim = () => {
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  };
  const cancelDwell = () => {
    if (dwell !== null) {
      clearTimeout(dwell);
      dwell = null;
    }
  };

  const animateTo = (targetY: number, done?: () => void) => {
    cancelAnim();
    const startY = window.scrollY;
    const dist = targetY - startY;
    if (hooks.getReduced() || Math.abs(dist) < 2) {
      window.scrollTo(0, targetY);
      done?.();
      return;
    }
    const duration = Math.min(900, Math.max(300, Math.abs(dist) / (1.6 * hooks.getSpeed())));
    const startT = performance.now();
    const ease = (t: number) => 1 - (1 - t) ** 3;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startT) / duration);
      window.scrollTo(0, startY + dist * ease(t));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = null;
        done?.();
      }
    };
    raf = requestAnimationFrame(tick);
  };

  const dwellMs = (i: number): number => {
    const here = absTop(stops[i]);
    const next =
      i + 1 < stops.length ? absTop(stops[i + 1]) : document.documentElement.scrollHeight;
    return Math.min(9000, Math.max(2500, 2200 + Math.max(0, next - here) * 0.9)) / hooks.getSpeed();
  };

  const goTo = (i: number, done?: () => void) => {
    if (stops.length === 0) return;
    active = Math.max(0, Math.min(stops.length - 1, i));
    hooks.onIndex(active, stops.length);
    animateTo(targetFor(stops[active]), done);
  };

  // While we drive a programmatic scroll, ignore scroll events so `active` doesn't
  // get yanked mid-flight; user scrolling (raf === null) updates the nearest stop.
  const onScroll = () => {
    if (raf !== null) return;
    active = nearest();
    hooks.onIndex(active, stops.length);
  };

  const interrupt = () => stopAuto();
  const onKey = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key))
      stopAuto();
  };
  const attachInterrupt = () => {
    window.addEventListener('wheel', interrupt, { passive: true });
    window.addEventListener('touchmove', interrupt, { passive: true });
    window.addEventListener('keydown', onKey);
  };
  const detachInterrupt = () => {
    window.removeEventListener('wheel', interrupt);
    window.removeEventListener('touchmove', interrupt);
    window.removeEventListener('keydown', onKey);
  };

  function runAuto() {
    if (!playing) return;
    if (active >= stops.length - 1) {
      stopAuto();
      return;
    }
    goTo(active + 1, () => {
      if (!playing) return;
      dwell = window.setTimeout(runAuto, dwellMs(active));
    });
  }
  function startAuto() {
    refresh();
    if (stops.length === 0) return;
    playing = true;
    hooks.onAuto(true);
    attachInterrupt();
    runAuto();
  }
  function stopAuto() {
    if (!playing) return;
    playing = false;
    hooks.onAuto(false);
    cancelAnim();
    cancelDwell();
    detachInterrupt();
  }

  const scrollListener = () => onScroll();
  window.addEventListener('scroll', scrollListener, { passive: true });
  window.addEventListener('resize', refresh);
  refresh();
  onScroll();

  return {
    next: () => {
      stopAuto();
      refresh();
      goTo(active + 1);
    },
    prev: () => {
      stopAuto();
      refresh();
      goTo(active - 1);
    },
    toggleAuto: () => (playing ? stopAuto() : startAuto()),
    destroy: () => {
      stopAuto();
      window.removeEventListener('scroll', scrollListener);
      window.removeEventListener('resize', refresh);
    },
  };
}

export function DescentTour() {
  const reduced = usePrefersReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
  speedRef.current = speed;

  const [active, setActive] = useState(0);
  const [total, setTotal] = useState(0);
  const [playing, setPlaying] = useState(false);
  const engineRef = useRef<Engine | null>(null);

  useEffect(() => {
    const engine = createEngine({
      getReduced: () => reducedRef.current,
      getSpeed: () => speedRef.current,
      onIndex: (a, t) => {
        setActive(a);
        setTotal(t);
      },
      onAuto: setPlaying,
    });
    engineRef.current = engine;
    return () => engine.destroy();
  }, []);

  const btn =
    'flex items-center gap-1 rounded-full px-3 py-1.5 text-sm transition-colors hover:bg-surface-raised disabled:opacity-30 disabled:hover:bg-transparent';

  return (
    <nav
      aria-label="Step through the descent"
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-border bg-surface/95 p-1 shadow-lg backdrop-blur"
    >
      <button
        type="button"
        className={btn}
        onClick={() => engineRef.current?.prev()}
        disabled={active <= 0}
        aria-label="Previous step"
      >
        <span aria-hidden="true">◀</span>
        <span className="hidden sm:inline">Prev</span>
      </button>
      <span className="min-w-[3.5rem] text-center font-mono text-xs tabular-nums text-muted">
        {total > 0 ? `${active + 1} / ${total}` : '—'}
      </span>
      <button
        type="button"
        className={btn}
        onClick={() => engineRef.current?.next()}
        disabled={total > 0 && active >= total - 1}
        aria-label="Next step"
      >
        <span className="hidden sm:inline">Next</span>
        <span aria-hidden="true">▶</span>
      </button>

      <span
        className="mx-1 h-5 w-px"
        style={{ backgroundColor: COLOR.border }}
        aria-hidden="true"
      />

      <button
        type="button"
        className={`${btn} font-mono text-xs`}
        onClick={() => engineRef.current?.toggleAuto()}
        aria-pressed={playing}
        aria-label={playing ? 'Stop auto-play' : 'Auto-play through the steps'}
        style={{ color: playing ? COLOR.active : undefined }}
        title={playing ? 'Stop auto-play' : 'Auto-play'}
      >
        <span aria-hidden="true">{playing ? '❚❚' : '▷'}</span>
        <span className="hidden sm:inline">auto</span>
      </button>
      {playing && (
        <button
          type="button"
          className={`${btn} font-mono text-xs text-muted`}
          onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed as 1) + 1) % SPEEDS.length])}
          aria-label={`Auto-play speed ${speed} times`}
        >
          {speed}×
        </button>
      )}
    </nav>
  );
}

export default DescentTour;
