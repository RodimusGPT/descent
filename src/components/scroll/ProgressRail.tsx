import { COLOR, partAccent, withAlpha } from '@/lib/encoding';
import type { PartMeta } from '@/lib/parts';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { useEffect, useRef, useState } from 'react';

/**
 * ProgressRail — the persistent spine of the descent (Invariant I2).
 *
 * Desktop: a left sidebar with an always-visible label per part, a warm fill that
 * descends with scroll, and live highlighting of the section in view. Mobile: a
 * slim sticky top bar with a progress line + a jump menu.
 *
 * Performance: the scroll handler reads ONLY `window.scrollY` (no per-frame layout
 * reads — section offsets are cached and only re-measured on resize / page-height
 * change). It is rAF-throttled, drives the fill imperatively via refs (no React
 * re-render per frame), and calls setState only when the active part actually
 * changes. No backdrop-filter (it repaints every frame over scrolling content).
 */

export interface ProgressRailProps {
  parts: PartMeta[];
  /** Set on focused per-part pages; omitted on the single continuous descent. */
  currentSlug?: string;
}

export function ProgressRail({ parts, currentSlug }: ProgressRailProps) {
  const staticIndex = currentSlug
    ? Math.max(
        0,
        parts.findIndex((p) => p.slug === currentSlug),
      )
    : 0;
  const [active, setActive] = useState(staticIndex);
  const denom = Math.max(1, parts.length - 1);

  const desktopFill = useRef<HTMLDivElement>(null);
  const mobileFill = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const applyFill = (frac: number) => {
      if (desktopFill.current) desktopFill.current.style.transform = `scaleY(${frac})`;
      if (mobileFill.current) mobileFill.current.style.transform = `scaleX(${frac})`;
    };

    // Focused per-part page: static highlight, no live tracking.
    if (currentSlug) {
      setActive(staticIndex);
      applyFill(denom > 0 ? staticIndex / denom : 0);
      return;
    }

    let raf: number | null = null;
    let tops: number[] = [];
    let lastActive = -1;

    const measure = () => {
      tops = parts.map((p) => {
        const el = document.getElementById(p.slug);
        return el ? el.getBoundingClientRect().top + window.scrollY : Number.POSITIVE_INFINITY;
      });
    };

    const update = () => {
      raf = null;
      const line = window.scrollY + window.innerHeight * 0.4;
      let idx = 0;
      for (let i = 0; i < tops.length; i++) {
        if (tops[i] <= line) idx = i;
      }
      const here = tops[idx];
      const next = idx + 1 < tops.length ? tops[idx + 1] : document.documentElement.scrollHeight;
      const intra = next > here ? Math.min(1, Math.max(0, (line - here) / (next - here))) : 0;
      applyFill(Math.min(1, (idx + intra) / denom));
      if (idx !== lastActive) {
        lastActive = idx;
        setActive(idx);
      }
    };

    const onScroll = () => {
      if (raf === null) raf = requestAnimationFrame(update);
    };
    const onResize = () => {
      measure();
      onScroll();
    };

    measure();
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    // Re-measure when the page height changes (islands hydrating, blocks expanding…).
    const ro = new ResizeObserver(onResize);
    ro.observe(document.body);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [parts, currentSlug, staticIndex, denom]);

  const jumpTo = (slug: string) => {
    const el = typeof document !== 'undefined' ? document.getElementById(slug) : null;
    if (el) el.scrollIntoView({ block: 'start' });
    else window.location.href = `/#${slug}`;
  };

  const activePart = parts[active];

  return (
    <>
      {/* ───────── Desktop: left sidebar with always-visible labels ───────── */}
      <nav
        aria-label="Descent progress"
        className="fixed left-0 top-0 z-30 hidden h-screen w-52 flex-col justify-center px-5 md:flex"
      >
        <a
          href="/"
          className="mb-8 block font-mono text-xs uppercase tracking-[0.25em] text-faint transition-colors hover:text-ink"
        >
          ↑ Descent
        </a>
        <div className="relative" style={{ height: `${denom * 3.2}rem` }}>
          <div
            className="absolute left-[5px] top-1 h-full w-px"
            style={{ backgroundColor: COLOR.border }}
          />
          <div
            ref={desktopFill}
            className="absolute left-[5px] top-1 h-full w-px"
            style={{
              backgroundColor: COLOR.active,
              transformOrigin: 'top',
              transform: 'scaleY(0)',
              willChange: 'transform',
            }}
          />

          {parts.map((part, i) => {
            const top = `${(i / denom) * 100}%`;
            const accent = partAccent(part.kind);
            const isCurrent = i === active;
            const isPast = i < active;
            const dotColor = isCurrent ? COLOR.active : isPast ? accent : COLOR.faint;
            return (
              <a
                key={part.slug}
                href={`/#${part.slug}`}
                onClick={(e) => {
                  e.preventDefault();
                  jumpTo(part.slug);
                  history.replaceState(null, '', `/#${part.slug}`);
                }}
                aria-current={isCurrent ? 'step' : undefined}
                className="group absolute flex -translate-y-1/2 items-center gap-3"
                style={{ top }}
              >
                <span
                  className="block shrink-0 rounded-full border transition-transform group-hover:scale-125"
                  style={{
                    width: isCurrent ? '0.7rem' : '0.55rem',
                    height: isCurrent ? '0.7rem' : '0.55rem',
                    marginLeft: isCurrent ? '-0.35rem' : '-0.275rem',
                    backgroundColor: isCurrent ? COLOR.active : withAlpha(dotColor, 0.5),
                    borderColor: dotColor,
                    boxShadow: isCurrent ? `0 0 0 4px ${withAlpha(COLOR.active, 0.16)}` : undefined,
                  }}
                />
                <span
                  className="whitespace-nowrap text-xs leading-tight transition-colors"
                  style={{ color: isCurrent ? COLOR.ink : COLOR.muted }}
                >
                  <span className="font-mono opacity-50">{part.index}</span>{' '}
                  <span className={isCurrent ? 'font-semibold' : ''}>{part.title}</span>
                </span>
              </a>
            );
          })}
        </div>
      </nav>

      {/* ───────── Mobile: slim top bar with progress + jump menu ───────── */}
      <div className="fixed inset-x-0 top-0 z-30 border-b border-border bg-bg md:hidden">
        <div className="h-0.5 w-full overflow-hidden" style={{ backgroundColor: COLOR.border }}>
          <div
            ref={mobileFill}
            className="h-full w-full"
            style={{
              backgroundColor: COLOR.active,
              transformOrigin: 'left',
              transform: 'scaleX(0)',
              willChange: 'transform',
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <a href="/" className="font-mono text-xs uppercase tracking-widest text-faint">
            ↑ Descent
          </a>
          <label className="flex items-center gap-2 text-xs text-muted">
            <span className="sr-only">Jump to part</span>
            <select
              className="max-w-[12rem] rounded border border-border bg-surface px-2 py-1 text-xs text-ink"
              value={activePart?.slug}
              onChange={(e) => jumpTo(e.target.value)}
            >
              {parts.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.index} · {p.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </>
  );
}

export default ProgressRail;
