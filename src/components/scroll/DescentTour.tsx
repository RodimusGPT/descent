import { COLOR } from '@/lib/encoding';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { useEffect, useRef, useState } from 'react';

/**
 * DescentTour — a step-through navigator for the descent.
 *
 * Stops = each Beat / section heading (`[data-tour-stop]`) and each ScrollScene
 * narration step (`[data-scrollstep]`), in document order. Prev / Next move through
 * them at the reader's pace; the counter tracks the nearest stop while free-scrolling;
 * an optional auto-play advances on a timer.
 *
 * Performance: stop offsets are cached and only re-measured on resize / page-height
 * change — the scroll handler reads only `window.scrollY`, is rAF-throttled, and
 * calls setState only when the active stop changes. No backdrop-filter.
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
  let tops: number[] = []; // cached absolute offsets; re-measured on resize, not per scroll
  let active = 0;
  let lastReported = -1;
  let playing = false;
  let animating = false;
  let raf: number | null = null;
  let animRaf: number | null = null;
  let dwell: number | null = null;

  const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;

  const measure = () => {
    stops = Array.from(
      document.querySelectorAll<HTMLElement>('[data-tour-stop], [data-scrollstep]'),
    );
    tops = stops.map((el) => el.getBoundingClientRect().top + window.scrollY);
    hooks.onIndex(active, stops.length);
  };

  // Nearest stop to the reading line, from CACHED offsets (no layout read).
  const nearest = (): number => {
    if (tops.length === 0) return 0;
    const line = window.scrollY + window.innerHeight * 0.4;
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < tops.length; i++) {
      const d = Math.abs(tops[i] - line);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  };

  const targetFor = (i: number) =>
    Math.max(0, Math.min((tops[i] ?? 0) - window.innerHeight * 0.4, maxScroll()));

  const cancelAnim = () => {
    if (animRaf !== null) {
      cancelAnimationFrame(animRaf);
      animRaf = null;
    }
    animating = false;
  };
  const cancelDwell = () => {
    if (dwell !== null) {
      clearTimeout(dwell);
      dwell = null;
    }
  };

  const animateTo = (targetY: number, done?: () => void) => {
    if (animRaf !== null) cancelAnimationFrame(animRaf);
    const startY = window.scrollY;
    const dist = targetY - startY;
    if (hooks.getReduced() || Math.abs(dist) < 2) {
      window.scrollTo(0, targetY);
      done?.();
      return;
    }
    animating = true;
    const duration = Math.min(900, Math.max(300, Math.abs(dist) / (1.6 * hooks.getSpeed())));
    const startT = performance.now();
    const ease = (t: number) => 1 - (1 - t) ** 3;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startT) / duration);
      window.scrollTo(0, startY + dist * ease(t));
      if (t < 1) {
        animRaf = requestAnimationFrame(tick);
      } else {
        animRaf = null;
        animating = false;
        done?.();
      }
    };
    animRaf = requestAnimationFrame(tick);
  };

  const setActiveIdx = (i: number) => {
    active = i;
    if (i !== lastReported) {
      lastReported = i;
      hooks.onIndex(active, stops.length);
    }
  };

  const goTo = (i: number, done?: () => void) => {
    if (stops.length === 0) return;
    const idx = Math.max(0, Math.min(stops.length - 1, i));
    setActiveIdx(idx);
    animateTo(targetFor(idx), done);
  };

  const update = () => {
    raf = null;
    if (animating) return; // don't fight a programmatic scroll
    setActiveIdx(nearest());
  };
  const onScroll = () => {
    if (raf === null) raf = requestAnimationFrame(update);
  };
  const onResize = () => {
    measure();
    onScroll();
  };

  const dwellMs = (i: number): number => {
    const here = tops[i] ?? 0;
    const next = i + 1 < tops.length ? tops[i + 1] : document.documentElement.scrollHeight;
    return Math.min(9000, Math.max(2500, 2200 + Math.max(0, next - here) * 0.9)) / hooks.getSpeed();
  };

  const stopOnInput = () => stopAuto();
  const onKey = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key))
      stopAuto();
  };
  const attachInterrupt = () => {
    window.addEventListener('wheel', stopOnInput, { passive: true });
    window.addEventListener('touchmove', stopOnInput, { passive: true });
    window.addEventListener('keydown', onKey);
  };
  const detachInterrupt = () => {
    window.removeEventListener('wheel', stopOnInput);
    window.removeEventListener('touchmove', stopOnInput);
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
    measure();
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

  measure();
  update();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  const ro = new ResizeObserver(onResize);
  ro.observe(document.body);

  return {
    next: () => {
      stopAuto();
      measure();
      goTo(nearest() + 1);
    },
    prev: () => {
      stopAuto();
      measure();
      goTo(nearest() - 1);
    },
    toggleAuto: () => (playing ? stopAuto() : startAuto()),
    destroy: () => {
      stopAuto();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
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
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-border bg-surface p-1 shadow-lg"
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
