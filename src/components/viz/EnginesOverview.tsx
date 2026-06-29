import { COLOR, weightToColor, withAlpha } from '@/lib/encoding';
import {
  DIM_KEYS,
  DIM_LABELS,
  DIM_MAX,
  ENGINES,
  type Engine,
  type EngineDims,
} from '@/lib/engines';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { type KeyboardEvent, useId, useState } from 'react';

/**
 * EnginesOverview (spec 10.3) — the inference-ENGINES landscape.
 *
 * A model is just numbers until software runs it. A handful of engines dominate,
 * each built around a different priority. This is a selectable card set: pick an
 * engine to highlight it and read its tagline, best-for scenario, and signature
 * tech, alongside a small bar rating of its four illustrative character
 * dimensions (portability / multi-user / prefix-caching / throughput).
 *
 * The cards form a single radiogroup with roving focus: arrow keys move between
 * engines, Enter / Space selects. Reduced-motion safe — colors are static and
 * the only transitions are short, all disabled under reduced motion.
 *
 * Self-contained: renders with zero required props.
 */

/** Map an illustrative 1..5 rating onto the encoding warmth ramp. */
function dimColor(value: number): string {
  // Spread 1..5 across the warm half of the ramp so even low ratings read as a
  // distinct color rather than fully inert.
  return weightToColor(0.15 + 0.85 * ((value - 1) / (DIM_MAX - 1)));
}

export interface EnginesOverviewProps {
  /** Key of the engine selected on first render. */
  initialKey?: string;
}

export function EnginesOverview({ initialKey = ENGINES[0]?.key }: EnginesOverviewProps) {
  const reduced = usePrefersReducedMotion();
  const baseId = useId();
  const groupId = `${baseId}-engines`;
  const panelId = `${baseId}-panel`;

  const initialIndex = Math.max(
    0,
    ENGINES.findIndex((e) => e.key === initialKey),
  );
  const [index, setIndex] = useState<number>(initialIndex);

  const selected: Engine = ENGINES[Math.min(index, ENGINES.length - 1)] ?? ENGINES[0];
  const accent = COLOR.modelAccent;

  const cardTransition = reduced
    ? undefined
    : 'border-color 200ms ease, background-color 200ms ease';
  const barTransition = reduced ? undefined : 'width 260ms ease, background-color 260ms ease';

  const onCardKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % ENGINES.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (i - 1 + ENGINES.length) % ENGINES.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ENGINES.length - 1;
    else return;
    e.preventDefault();
    setIndex(next);
    const el = e.currentTarget.parentElement?.children[next];
    if (el instanceof HTMLElement) el.focus();
  };

  return (
    <div className="flex w-full max-w-[900px] flex-col gap-4 rounded-lg border border-border bg-surface p-4 text-ink">
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-sm text-ink">Inference engines — the landscape</h3>
        <p className="text-xs text-muted">
          A model is just numbers until an <span style={{ color: accent }}>engine</span> runs it. A
          handful dominate, each shaped by a different priority. Pick one to compare its character.
        </p>
      </div>

      {/* Engine cards — a radiogroup with roving focus */}
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
        role="radiogroup"
        aria-label="Inference engines"
        id={groupId}
      >
        {ENGINES.map((engine, i) => {
          const isActive = engine.key === selected.key;
          return (
            <button
              key={engine.key}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setIndex(i)}
              onKeyDown={(e) => onCardKey(e, i)}
              className="flex flex-col gap-1 rounded-md border p-2.5 text-left "
              style={{
                borderColor: isActive ? accent : COLOR.border,
                backgroundColor: isActive ? withAlpha(accent, 0.16) : 'transparent',
                transition: cardTransition,
              }}
            >
              <span
                className="font-mono text-xs"
                style={{ color: isActive ? COLOR.ink : COLOR.muted }}
              >
                {engine.name}
              </span>
              <span className="text-[0.7rem] leading-snug text-faint">{engine.tagline}</span>
            </button>
          );
        })}
      </div>

      {/* Detail panel for the selected engine */}
      <div
        id={panelId}
        aria-live="polite"
        className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-3"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-sm" style={{ color: accent }}>
            {selected.name}
          </span>
          <span className="text-[0.7rem] text-faint">illustrative ratings, not benchmarks</span>
        </div>

        <dl className="flex flex-col gap-2 text-xs">
          <div className="flex flex-col gap-0.5">
            <dt className="text-faint">Best for</dt>
            <dd className="text-ink">{selected.bestFor}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-faint">Key tech</dt>
            <dd className="text-muted">{selected.keyTech}</dd>
          </div>
        </dl>

        {/* Dimension bars */}
        <ul className="flex flex-col gap-2">
          {DIM_KEYS.map((key) => {
            const value = selected.dims[key as keyof EngineDims];
            const color = dimColor(value);
            return (
              <li key={key} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[0.7rem] text-muted">{DIM_LABELS[key]}</span>
                <div
                  className="h-2 flex-1 overflow-hidden rounded-full"
                  style={{ backgroundColor: withAlpha(COLOR.muted, 0.16) }}
                  role="meter"
                  aria-valuemin={1}
                  aria-valuemax={DIM_MAX}
                  aria-valuenow={value}
                  aria-label={`${DIM_LABELS[key]} rating ${value} of ${DIM_MAX}`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(value / DIM_MAX) * 100}%`,
                      backgroundColor: color,
                      transition: barTransition,
                    }}
                  />
                </div>
                <span
                  className="w-6 shrink-0 text-right font-mono text-[0.7rem] tabular-nums"
                  style={{ color }}
                >
                  {value}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default EnginesOverview;
