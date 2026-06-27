import { Token } from '@/components/scroll/Token';
import { COLOR, partAccent, withAlpha } from '@/lib/encoding';
import { PARTS } from '@/lib/parts';
import { STAGES, STAGE_COUNT } from '@/lib/replay';
import { useInView } from '@/lib/use-in-view';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';

/**
 * FullStackReplay — spec 10.5, the Part 5 synthesis.
 *
 * The closing move: replay the opening prompt as it traverses the ENTIRE stack the
 * reader just descended — top (the abstract model) to bottom (the physical silicon),
 * now legible. A single <Token/> walks DOWN the column of stages one at a time;
 * the active stage card is tinted with its part accent and shows its recap,
 * completed stages stay lit, upcoming ones dim. At the end the whole journey is
 * visible at once.
 *
 * Reduced motion → stepped static: manual Step only, no autoplay. Any autoplay is
 * also gated on visibility (useInView) so an off-screen replay never burns the
 * main thread.
 */

const STEP_MS = 1300;

// `cursor` ranges 0..STAGE_COUNT. 0 = nothing entered yet (token waiting above);
// c in 1..STAGE_COUNT means stages [0, c) are lit and stage (c-1) is active.
export function FullStackReplay() {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLElement | null>(null);
  const inView = useInView(rootRef);

  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);

  const atEnd = cursor >= STAGE_COUNT;
  const activeIndex = cursor - 1; // -1 before the first stage

  // --- autoplay clock (gated on reduced motion AND visibility) ---------------
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `cursor` re-triggers this effect to schedule the next step (body advances via functional setCursor, never reads cursor directly).
  useEffect(() => {
    if (reduced || !playing || !inView) return;
    if (atEnd) {
      setPlaying(false);
      return;
    }
    timer.current = setTimeout(() => {
      setCursor((c) => Math.min(STAGE_COUNT, c + 1));
    }, STEP_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [reduced, playing, inView, atEnd, cursor]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (!p && atEnd) setCursor(0); // replay from the top
      return !p;
    });
  }, [atEnd]);

  const stepDown = useCallback(() => {
    setPlaying(false);
    setCursor((c) => Math.min(STAGE_COUNT, c + 1));
  }, []);

  const reset = useCallback(() => {
    setPlaying(false);
    setCursor(0);
  }, []);

  const panel: CSSProperties = { backgroundColor: COLOR.surface, borderColor: COLOR.border };

  // The token that descends. It carries the prompt's first token all the way down.
  const followText = 'The';

  return (
    <section
      ref={rootRef}
      className="mx-auto flex w-full max-w-[900px] flex-col gap-4 rounded-xl border p-4 font-sans text-ink sm:p-6"
      style={panel}
      aria-label="Full-stack replay of the descent"
    >
      {/* header */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="rounded-md px-2 py-1 font-mono text-xs font-semibold"
            style={{ color: COLOR.active, backgroundColor: withAlpha(COLOR.active, 0.14) }}
          >
            THE WHOLE DESCENT
          </span>
          <span className="font-mono text-xs text-muted">one token, top to bottom</span>
        </div>
        <span className="font-mono text-xs text-faint tabular-nums">
          stage {Math.min(cursor, STAGE_COUNT)} / {STAGE_COUNT}
        </span>
      </header>

      {/* the prompt the token comes from */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Following</span>
        <Token text={followText} state={cursor === 0 ? 'active' : 'inert'} size="sm" />
        <span>down through every layer you just learned.</span>
      </div>

      {/* the descent: a vertical column of stages */}
      <ol className="flex flex-col gap-2" aria-label="Stages of the descent">
        {STAGES.map((stage, i) => {
          const isActive = i === activeIndex;
          const isDone = i < activeIndex;
          const isUpcoming = i > activeIndex;
          const accent = partAccent(stage.kind);
          const part = PARTS[stage.partIndex];

          // card tint: active = full accent wash; done = quiet accent; upcoming = dim.
          const cardStyle: CSSProperties = isActive
            ? {
                borderColor: accent,
                backgroundColor: withAlpha(accent, 0.14),
                boxShadow: reduced ? undefined : `0 0 0 1px ${withAlpha(accent, 0.5)}`,
              }
            : isDone
              ? { borderColor: withAlpha(accent, 0.45), backgroundColor: withAlpha(accent, 0.05) }
              : { borderColor: COLOR.border, backgroundColor: withAlpha(COLOR.faint, 0.03) };

          return (
            <li key={stage.id}>
              <div
                className="flex items-start gap-3 rounded-lg border p-3 transition-colors"
                style={cardStyle}
                aria-current={isActive ? 'step' : undefined}
              >
                {/* gutter: the descending token sits beside the active stage */}
                <div className="flex w-12 shrink-0 flex-col items-center gap-1 pt-0.5">
                  {isActive ? (
                    <Token
                      text={followText}
                      state="active"
                      weight={1}
                      selected
                      size="sm"
                      ariaLabel={`token at ${stage.title}`}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="font-mono text-xs leading-none"
                      style={{ color: isDone ? accent : COLOR.faint }}
                    >
                      {isDone ? '●' : '○'}
                    </span>
                  )}
                  <span aria-hidden="true" className="font-mono text-[0.7rem] text-faint">
                    {i < STAGES.length - 1 ? '↓' : '⤓'}
                  </span>
                </div>

                {/* stage body */}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span
                      className="font-mono text-sm font-semibold"
                      style={{ color: isUpcoming ? COLOR.muted : COLOR.ink }}
                    >
                      {stage.title}
                    </span>
                    <span
                      className="rounded px-1.5 py-0.5 font-mono text-[0.65rem]"
                      style={{ color: accent, backgroundColor: withAlpha(accent, 0.12) }}
                    >
                      Part {part.index} · {part.title}
                    </span>
                  </div>
                  {/* recap shown once the stage has been reached */}
                  {!isUpcoming && <p className="text-xs leading-snug text-muted">{stage.recap}</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* the emitted token, revealed when the descent completes */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2"
        style={{
          borderColor: withAlpha(COLOR.active, atEnd ? 0.6 : 0.25),
          backgroundColor: withAlpha(COLOR.active, atEnd ? 0.08 : 0.03),
        }}
      >
        <span aria-hidden="true" className="font-mono text-base" style={{ color: COLOR.active }}>
          ↩
        </span>
        {atEnd ? (
          <span className="flex flex-wrap items-center gap-2 font-mono text-xs text-ink">
            out comes the next token
            <Token text="model" id={42} state="active" weight={1} selected size="sm" />— appended,
            and the whole descent runs again.
          </span>
        ) : (
          <span className="font-mono text-xs text-faint">
            …follow it all the way down to see the next token.
          </span>
        )}
      </div>

      {/* controls */}
      <div
        className="flex flex-wrap items-center gap-2 border-t pt-3"
        style={{ borderColor: COLOR.border }}
      >
        {!reduced && (
          <button
            type="button"
            onClick={togglePlay}
            className="rounded-md border px-3 py-1 font-mono text-xs text-ink transition-colors hover:bg-surface-raised "
            style={{ borderColor: COLOR.border, backgroundColor: COLOR.surface }}
            aria-pressed={playing}
          >
            {playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
          </button>
        )}
        <button
          type="button"
          onClick={stepDown}
          disabled={atEnd}
          className="rounded-md border px-3 py-1 font-mono text-xs text-ink transition-colors hover:bg-surface-raised disabled:opacity-40"
          style={{ borderColor: COLOR.border, backgroundColor: COLOR.surface }}
          aria-label="Descend to the next stage"
        >
          Step ↓
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border px-3 py-1 font-mono text-xs text-muted transition-colors hover:bg-surface-raised "
          style={{ borderColor: COLOR.border, backgroundColor: COLOR.surface }}
          aria-label="Reset to the top of the stack"
        >
          Reset
        </button>

        {reduced && (
          <span className="ml-auto font-mono text-[0.7rem] text-faint">
            Reduced motion: auto-play off — use Step ↓ to descend.
          </span>
        )}
      </div>
    </section>
  );
}

export default FullStackReplay;
