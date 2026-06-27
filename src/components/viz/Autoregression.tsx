import { Token } from '@/components/scroll/Token';
import {
  PROMPT,
  SCRIPT,
  TOTAL_STEPS,
  contextAt,
  contextLengthAt,
  emittedAt,
} from '@/lib/autoregression';
import { COLOR, withAlpha } from '@/lib/encoding';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';

/**
 * Autoregression — spec 10.1, the generation loop.
 *
 * Replays one step of autoregressive decoding at a time: the current context is
 * shown as a row of Token pills, the model emits ONE next token (it flashes warm
 * as it is sampled), and that token is then appended and folded into the context —
 * the loop repeats with a context one token longer. A feedback arrow makes the
 * "append → feed back in" loop explicit, and a running length readout makes the
 * "context grows by one each step, so work grows" point.
 *
 * This sets up the KV-cache motivation: each step re-reads the whole context, so
 * caching it (Part 3) is what keeps generation fast. Reduced-motion users get a
 * stepped static fallback — manual Step only, no autoplay.
 */

const STEP_MS = 1100;

export interface AutoregressionProps {
  /** Optional starting step (0 = nothing generated yet). */
  initialStep?: number;
}

export function Autoregression({ initialStep = 0 }: AutoregressionProps) {
  const reduced = usePrefersReducedMotion();

  const [step, setStep] = useState(() => clampStep(initialStep));
  const [playing, setPlaying] = useState(false);
  // `emitting` marks the brief instant a freshly-sampled token flashes hot before
  // it settles into the context. Gated entirely on reduced motion.
  const [emitting, setEmitting] = useState(false);

  const atEnd = step >= TOTAL_STEPS;

  // --- animation clock ------------------------------------------------------
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `step` re-triggers this effect to schedule the next per-step timer (body advances via functional setStep, never reads step directly).
  useEffect(() => {
    if (reduced || !playing) return;
    if (atEnd) {
      setPlaying(false);
      return;
    }
    // Two-phase step: flash the new token, then commit it to the context.
    setEmitting(true);
    timer.current = setTimeout(() => {
      setStep((s) => Math.min(TOTAL_STEPS, s + 1));
      setEmitting(false);
    }, STEP_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [reduced, playing, step, atEnd]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (!p && atEnd) setStep(0); // replay from the start
      return !p;
    });
  }, [atEnd]);

  const stepForward = useCallback(() => {
    setPlaying(false);
    setEmitting(false);
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }, []);
  const reset = useCallback(() => {
    setPlaying(false);
    setEmitting(false);
    setStep(0);
  }, []);

  // --- derived view state ----------------------------------------------------
  // While `emitting`, we display the context BEFORE the new token (step), and
  // show the next token separately as the "just sampled" pill. Otherwise the
  // context already includes everything generated so far.
  const contextStep = step;
  const context = contextAt(contextStep);
  const contextLen = contextLengthAt(contextStep);

  const justAppended = !emitting && step > 0 ? emittedAt(step) : null;
  const promptLen = PROMPT.length;

  // The token surfaced in the "transformer emits …" pill. ONLY during the brief
  // `emitting` instant do we reveal the freshly-sampled FUTURE token (hot,
  // selected). At rest we never preview the future: we echo the token just
  // emitted to reach this step (calmer emphasis), or nothing before the first
  // step / once the sentence is complete. Under reduced motion `emitting` is
  // always false, so the static frame emphasizes the just-appended token.
  const emitToken = emitting ? emittedAt(step + 1) : !atEnd && step > 0 ? emittedAt(step) : null;
  const emitTokenId = emitting ? contextLen : contextLen - 1;

  const panel: CSSProperties = { backgroundColor: COLOR.surface, borderColor: COLOR.border };

  return (
    <section
      className="mx-auto flex w-full max-w-[860px] flex-col gap-4 rounded-xl border p-4 font-sans text-ink sm:p-6"
      style={panel}
      aria-label="Autoregressive generation loop"
    >
      {/* header */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="rounded-md px-2 py-1 font-mono text-xs font-semibold"
            style={{
              color: COLOR.modelAccent,
              backgroundColor: withAlpha(COLOR.modelAccent, 0.14),
            }}
          >
            AUTOREGRESSION
          </span>
          <span className="font-mono text-xs text-muted">one token per step</span>
        </div>
        <span className="font-mono text-xs text-faint">
          step {step} / {TOTAL_STEPS}
        </span>
      </header>

      {/* the loop: context → model → next token → (append, feed back) */}
      <div className="flex flex-col gap-3">
        {/* context row */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">
            Context fed in this step — <span className="tabular-nums text-ink">{contextLen}</span>{' '}
            token
            {contextLen === 1 ? '' : 's'} re-read
          </span>
          <div
            className="flex min-h-[2.25rem] flex-wrap items-center gap-1.5 rounded-md border p-2"
            style={{ borderColor: COLOR.border, backgroundColor: withAlpha(COLOR.faint, 0.06) }}
          >
            {context.map((t, i) => {
              const isPrompt = i < promptLen;
              const isJustAppended = justAppended !== null && i === context.length - 1;
              return (
                <Token
                  key={`ctx-${i}`}
                  text={t}
                  id={i}
                  state={isPrompt ? 'inert' : 'active'}
                  weight={isJustAppended ? 0.85 : isPrompt ? undefined : 0.4}
                  selected={isJustAppended}
                  size="sm"
                />
              );
            })}
          </div>
        </div>

        {/* model → next token */}
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="rounded-md border px-3 py-2 font-mono text-xs"
            style={{
              borderColor: withAlpha(COLOR.modelAccent, 0.5),
              backgroundColor: withAlpha(COLOR.modelAccent, 0.1),
              color: COLOR.modelAccent,
            }}
          >
            transformer
          </span>
          <span aria-hidden="true" className="font-mono text-lg text-faint">
            →
          </span>
          <span className="text-xs text-muted">emits</span>
          <div className="flex min-h-[2rem] items-center" aria-live="polite" aria-atomic="true">
            {emitToken !== null ? (
              <Token
                key={`emit-${step}-${emitting ? 'hot' : 'rest'}`}
                text={emitToken}
                id={emitTokenId}
                state="active"
                weight={emitting ? 1 : 0.85}
                selected={emitting}
                size="md"
              />
            ) : (
              <span className="font-mono text-xs text-faint">
                {atEnd ? '— sentence complete —' : '—'}
              </span>
            )}
          </div>
        </div>

        {/* feedback arrow: append → feed back in */}
        <div
          className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2"
          style={{
            borderColor: withAlpha(COLOR.active, 0.5),
            backgroundColor: withAlpha(COLOR.active, 0.06),
          }}
        >
          <span aria-hidden="true" className="font-mono text-base" style={{ color: COLOR.active }}>
            ↩
          </span>
          <span className="font-mono text-xs" style={{ color: COLOR.active }}>
            append the new token → feed the longer context back in → repeat
          </span>
        </div>
      </div>

      {/* completion / running note */}
      {atEnd ? (
        <p
          className="rounded-md border px-3 py-2 font-mono text-xs"
          style={{
            borderColor: withAlpha(COLOR.hwAccent, 0.5),
            backgroundColor: withAlpha(COLOR.hwAccent, 0.08),
            color: COLOR.hwAccent,
          }}
        >
          Each step re-reads the whole context — caching it (Part 3) is what makes this fast.
        </p>
      ) : (
        <p className="font-mono text-[0.7rem] text-faint">
          The context grows by one token every step, so the work per step grows too.
        </p>
      )}

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
          onClick={stepForward}
          disabled={atEnd}
          className="rounded-md border px-3 py-1 font-mono text-xs text-ink transition-colors hover:bg-surface-raised disabled:opacity-40"
          style={{ borderColor: COLOR.border, backgroundColor: COLOR.surface }}
          aria-label="Generate the next token"
        >
          Step ▶
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border px-3 py-1 font-mono text-xs text-muted transition-colors hover:bg-surface-raised "
          style={{ borderColor: COLOR.border, backgroundColor: COLOR.surface }}
          aria-label="Reset to the start"
        >
          Reset
        </button>

        {reduced && (
          <span className="ml-auto font-mono text-[0.7rem] text-faint">
            Reduced motion: auto-play off — use Step ▶ to advance.
          </span>
        )}
      </div>
    </section>
  );
}

function clampStep(step: number): number {
  if (Number.isNaN(step) || step < 0) return 0;
  if (step > TOTAL_STEPS) return TOTAL_STEPS;
  return Math.floor(step);
}

export default Autoregression;
