import { COLOR, partAccent, withAlpha } from '@/lib/encoding';
import type { PartMeta } from '@/lib/parts';
import { useEffect, useState } from 'react';

/**
 * ProgressRail — the visual spine of the descent (Invariant I2).
 *
 * A fixed vertical track listing all six parts in descent order. The current part
 * is highlighted, and a warm fill descends through it in proportion to how far the
 * reader has scrolled this page — reinforcing the single-journey metaphor. Every
 * node links to its part, so no part is ever unreachable.
 */

export interface ProgressRailProps {
  parts: PartMeta[];
  currentSlug: string;
}

export function ProgressRail({ parts, currentSlug }: ProgressRailProps) {
  const [progress, setProgress] = useState(0);
  const currentIndex = Math.max(
    0,
    parts.findIndex((p) => p.slug === currentSlug),
  );

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const denom = Math.max(1, parts.length - 1);
  const fillFrac = Math.min(1, (currentIndex + progress) / denom);

  return (
    <nav
      aria-label="Descent progress"
      className="fixed left-0 top-0 z-30 hidden h-screen flex-col items-center justify-center md:flex"
      style={{ width: 'var(--rail-width)' }}
    >
      <div className="relative" style={{ height: '70vh', width: '2rem' }}>
        {/* Background track */}
        <div
          className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2"
          style={{ backgroundColor: COLOR.border }}
        />
        {/* Descended fill */}
        <div
          className="absolute left-1/2 top-0 w-px -translate-x-1/2 transition-[height] duration-300"
          style={{ height: `${fillFrac * 100}%`, backgroundColor: COLOR.active }}
        />

        {parts.map((part, i) => {
          const top = `${(i / denom) * 100}%`;
          const accent = partAccent(part.kind);
          const isCurrent = i === currentIndex;
          const isPast = i < currentIndex;
          const dotColor = isCurrent ? COLOR.active : isPast ? accent : COLOR.faint;
          return (
            <a
              key={part.slug}
              href={`/parts/${part.slug}`}
              aria-current={isCurrent ? 'page' : undefined}
              title={`${part.index}. ${part.title}`}
              className="group absolute left-1/2 flex -translate-x-1/2 items-center"
              style={{ top }}
            >
              <span
                className="block rounded-full border transition-transform group-hover:scale-125"
                style={{
                  width: isCurrent ? '0.85rem' : '0.6rem',
                  height: isCurrent ? '0.85rem' : '0.6rem',
                  backgroundColor: isCurrent ? COLOR.active : withAlpha(dotColor, 0.5),
                  borderColor: dotColor,
                  marginTop: '-0.3rem',
                  boxShadow: isCurrent ? `0 0 0 4px ${withAlpha(COLOR.active, 0.18)}` : undefined,
                }}
              />
              {/* Label appears on hover / for the current node */}
              <span
                className={`pointer-events-none absolute left-5 whitespace-nowrap rounded px-2 py-0.5 text-xs transition-opacity ${
                  isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                style={{
                  backgroundColor: COLOR.surface,
                  color: COLOR.ink,
                  borderColor: COLOR.border,
                }}
              >
                <span className="font-mono opacity-50">{part.index}</span> {part.title}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

export default ProgressRail;
