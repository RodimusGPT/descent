import { COLOR, partAccent, withAlpha } from '@/lib/encoding';
import type { PartMeta } from '@/lib/parts';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { useEffect, useState } from 'react';

/**
 * ProgressRail — the spine of the descent (Invariant I2).
 *
 * The site is ONE continuous page: a hero followed by six `<section id={slug}>`
 * blocks. This rail is the persistent map of that journey. On desktop it is a
 * left sidebar listing every part with an always-visible label; a warm fill
 * descends through it tracking scroll depth, and the part currently in view is
 * highlighted. On mobile it collapses to a slim top bar with a progress line and
 * a jump menu. Every entry links to its section, so no part is unreachable.
 *
 * Modes: on the single descent page (no `currentSlug`) it tracks the active
 * section live from scroll position; on a focused per-part page (`currentSlug`
 * given) it highlights that part statically and its links jump back to the
 * full descent at `/#slug`.
 */

export interface ProgressRailProps {
  parts: PartMeta[];
  /** Set on focused per-part pages; omitted on the single continuous descent. */
  currentSlug?: string;
}

export function ProgressRail({ parts, currentSlug }: ProgressRailProps) {
  const reduced = usePrefersReducedMotion();
  const staticIndex = currentSlug
    ? Math.max(
        0,
        parts.findIndex((p) => p.slug === currentSlug),
      )
    : 0;

  const [active, setActive] = useState(staticIndex);
  const [fillFrac, setFillFrac] = useState(0);

  useEffect(() => {
    // Per-part pages highlight statically (only one section is present).
    if (currentSlug) {
      setActive(staticIndex);
      setFillFrac(parts.length > 1 ? staticIndex / (parts.length - 1) : 0);
      return;
    }

    const denom = Math.max(1, parts.length - 1);
    const onScroll = () => {
      const line = window.scrollY + window.innerHeight * 0.35;
      const tops = parts.map((p) => {
        const el = document.getElementById(p.slug);
        return el ? el.getBoundingClientRect().top + window.scrollY : Number.POSITIVE_INFINITY;
      });
      let idx = 0;
      for (let i = 0; i < tops.length; i++) {
        if (tops[i] <= line) idx = i;
      }
      // Smoothly interpolate the fill between the active dot and the next one.
      const here = tops[idx];
      const next = tops[idx + 1] ?? document.documentElement.scrollHeight;
      const span = Math.max(1, next - here);
      const intra = Math.min(1, Math.max(0, (line - here) / span));
      setActive(idx);
      setFillFrac(Math.min(1, (idx + intra) / denom));
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [parts, currentSlug, staticIndex]);

  const jumpTo = (slug: string) => {
    const el = typeof document !== 'undefined' ? document.getElementById(slug) : null;
    if (el) {
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    } else {
      window.location.href = `/#${slug}`;
    }
  };

  const denom = Math.max(1, parts.length - 1);
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
          {/* Track + descending fill */}
          <div
            className="absolute left-[5px] top-1 h-full w-px"
            style={{ backgroundColor: COLOR.border }}
          />
          <div
            className="absolute left-[5px] top-1 w-px transition-[height] duration-200"
            style={{ height: `calc(${fillFrac * 100}% )`, backgroundColor: COLOR.active }}
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
      <div className="fixed inset-x-0 top-0 z-30 border-b border-border bg-bg/90 backdrop-blur md:hidden">
        <div className="h-0.5 w-full" style={{ backgroundColor: COLOR.border }}>
          <div
            className="h-full transition-[width] duration-200"
            style={{ width: `${fillFrac * 100}%`, backgroundColor: COLOR.active }}
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
