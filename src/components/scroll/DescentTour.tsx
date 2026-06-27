import { COLOR } from '@/lib/encoding';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { useEffect, useRef, useState } from 'react';

/**
 * DescentTour — opt-in "descend for me" autoplay.
 *
 * Walks the reader down the single descent page stop-by-stop: each ScrollScene
 * narration step (`[data-scrollstep]`) and each section header (`[data-tour-stop]`),
 * in document order. At each stop it smooth-scrolls the element into view, then
 * dwells for a duration proportional to that stop's reading length before moving
 * on — so dense steps get more time than sparse ones.
 *
 * Because the existing scrollama + ProgressRail already react to scroll position,
 * driving the scroll is enough to advance the sticky visuals and the spine for free.
 *
 * Guardrails (a11y): it NEVER auto-starts; any manual wheel / touch / scroll-key
 * pauses it instantly (it never fights the reader); a Pause control is always
 * present (WCAG 2.2.2); and under prefers-reduced-motion it steps instantly instead
 * of gliding.
 */

const SPEEDS = [1, 1.5, 2, 0.5] as const;

interface TourEngine {
  toggle: () => void;
  pause: () => void;
  destroy: () => void;
}

interface EngineHooks {
  getReduced: () => boolean;
  getSpeed: () => number;
  onState: (playing: boolean) => void;
  onProgress: (current: number, total: number) => void;
}

function createEngine(hooks: EngineHooks): TourEngine {
  let playing = false;
  let raf: number | null = null;
  let dwell: number | null = null;

  const collectStops = (): HTMLElement[] => {
    // querySelectorAll returns document order; no element carries both attributes.
    const found = document.querySelectorAll<HTMLElement>('[data-tour-stop], [data-scrollstep]');
    return Array.from(new Set(found));
  };

  const absTop = (el: HTMLElement) => el.getBoundingClientRect().top + window.scrollY;

  // Dwell ∝ how much content separates this stop from the next — a robust,
  // content-agnostic proxy for "how long to linger here" (a guided skim pace).
  const dwellMs = (list: HTMLElement[], i: number): number => {
    const here = absTop(list[i]);
    const next = i + 1 < list.length ? absTop(list[i + 1]) : document.documentElement.scrollHeight;
    const gap = Math.max(0, next - here);
    return Math.min(9000, Math.max(2500, 2200 + gap * 0.9)) / hooks.getSpeed();
  };

  const targetFor = (el: HTMLElement): number => {
    const y = el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.4;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return Math.max(0, Math.min(y, max));
  };

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

  const animateTo = (targetY: number, done: () => void) => {
    cancelAnim();
    const startY = window.scrollY;
    const dist = targetY - startY;
    if (hooks.getReduced() || Math.abs(dist) < 2) {
      window.scrollTo(0, targetY);
      done();
      return;
    }
    const duration = Math.min(1200, Math.max(350, Math.abs(dist) / (1.5 * hooks.getSpeed())));
    const startT = performance.now();
    const ease = (t: number) => 1 - (1 - t) ** 3;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startT) / duration);
      window.scrollTo(0, startY + dist * ease(t));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = null;
        done();
      }
    };
    raf = requestAnimationFrame(tick);
  };

  const runStop = (list: HTMLElement[], i: number) => {
    if (!playing) return;
    if (i >= list.length) {
      stop();
      return;
    }
    hooks.onProgress(i + 1, list.length);
    const el = list[i];
    animateTo(targetFor(el), () => {
      if (!playing) return;
      dwell = window.setTimeout(
        () => {
          if (!playing) return;
          runStop(list, i + 1);
        },
        dwellMs(list, i),
      );
    });
  };

  // Any manual scroll intent pauses the tour. Programmatic scrolling fires only
  // 'scroll' (not wheel/touch/key), so these never false-trigger on our own motion.
  const onWheel = () => stop();
  const onTouch = () => stop();
  const onKey = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) stop();
  };
  const attach = () => {
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchmove', onTouch, { passive: true });
    window.addEventListener('keydown', onKey);
  };
  const detach = () => {
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('touchmove', onTouch);
    window.removeEventListener('keydown', onKey);
  };

  function start() {
    const list = collectStops();
    if (list.length === 0) return;
    playing = true;
    hooks.onState(true);
    attach();
    // Begin from the first stop below the current position.
    const line = window.scrollY + window.innerHeight * 0.4;
    let i = list.findIndex((el) => el.getBoundingClientRect().top + window.scrollY > line + 4);
    if (i === -1) i = list.length - 1;
    runStop(list, i);
  }

  function stop() {
    if (!playing) return;
    playing = false;
    hooks.onState(false);
    cancelAnim();
    cancelDwell();
    detach();
  }

  return {
    toggle: () => (playing ? stop() : start()),
    pause: stop,
    destroy: stop,
  };
}

export function DescentTour() {
  const reduced = usePrefersReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const [speed, setSpeed] = useState<number>(1);
  const speedRef = useRef(1);
  speedRef.current = speed;

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const engineRef = useRef<TourEngine | null>(null);

  useEffect(() => {
    const engine = createEngine({
      getReduced: () => reducedRef.current,
      getSpeed: () => speedRef.current,
      onState: setPlaying,
      onProgress: (current, total) => setProgress({ current, total }),
    });
    engineRef.current = engine;
    return () => engine.destroy();
  }, []);

  const cycleSpeed = () => {
    setSpeed((s) => {
      const idx = SPEEDS.indexOf(s as (typeof SPEEDS)[number]);
      return SPEEDS[(idx + 1) % SPEEDS.length];
    });
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-center gap-1 rounded-full border border-border bg-surface/95 p-1 shadow-lg backdrop-blur">
      <button
        type="button"
        onClick={() => engineRef.current?.toggle()}
        aria-pressed={playing}
        aria-label={playing ? 'Pause the guided descent' : 'Auto-scroll the descent for me'}
        className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-raised"
        style={{ color: playing ? COLOR.active : COLOR.ink }}
      >
        <span aria-hidden="true" className="text-xs">
          {playing ? '❚❚' : '▶'}
        </span>
        <span>{playing ? 'Pause' : 'Descend'}</span>
      </button>
      {playing && progress && (
        <span className="px-1 font-mono text-[0.65rem] tabular-nums text-faint" aria-live="off">
          {progress.current}/{progress.total}
        </span>
      )}
      <button
        type="button"
        onClick={cycleSpeed}
        aria-label={`Tour speed ${speed} times. Click to change.`}
        className="rounded-full px-2 py-1.5 font-mono text-xs text-muted transition-colors hover:bg-surface-raised hover:text-ink"
      >
        {speed}×
      </button>
    </div>
  );
}

export default DescentTour;
