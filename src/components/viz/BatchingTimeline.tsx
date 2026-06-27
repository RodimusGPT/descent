import {
  SAMPLE_SLOTS,
  SAMPLE_WORKLOAD,
  type Seq,
  scheduleContinuous,
  scheduleStatic,
  utilization,
} from '@/lib/batching';
import { CATEGORICAL, COLOR, withAlpha } from '@/lib/encoding';
import { useInView } from '@/lib/use-in-view';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * BatchingTimeline — static vs continuous batching (spec 10.3).
 *
 * GPUs want big batches. STATIC batching holds a batch's slots until EVERY
 * sequence in it finishes, so short sequences leave their slot idle until the
 * whole batch drains. CONTINUOUS batching reschedules per iteration: the instant
 * a slot frees, a waiting sequence takes it — far higher utilization.
 *
 * The grid shows rows = slots, columns = decode iterations, each cell colored by
 * the sequence occupying it; idle cells read inert. A Static/Continuous toggle
 * and a utilization readout make the packing difference visible.
 */

/** Non-semantic categorical sequence palette (<= 5). */
const SEQ_COLORS: readonly string[] = CATEGORICAL;

function seqColor(id: number): string {
  return SEQ_COLORS[((id % SEQ_COLORS.length) + SEQ_COLORS.length) % SEQ_COLORS.length];
}

type Mode = 'static' | 'continuous';

const STEP_MS = 420;

export interface BatchingTimelineProps {
  /** Workload to schedule. Defaults to the deterministic sample. */
  workload?: Seq[];
  /** Number of concurrent slots (batch width). */
  slots?: number;
}

export function BatchingTimeline({
  workload = SAMPLE_WORKLOAD,
  slots = SAMPLE_SLOTS,
}: BatchingTimelineProps) {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const inView = useInView(rootRef);
  const [mode, setMode] = useState<Mode>('static');

  const staticSched = useMemo(() => scheduleStatic(workload, slots), [workload, slots]);
  const continuousSched = useMemo(() => scheduleContinuous(workload, slots), [workload, slots]);
  const schedule = mode === 'static' ? staticSched : continuousSched;

  const nCols = schedule.length;
  const nRows = slots;

  // Final utilization for each mode (drives the contrast readout).
  const staticUtil = useMemo(() => utilization(staticSched), [staticSched]);
  const continuousUtil = useMemo(() => utilization(continuousSched), [continuousSched]);

  // --- progressive reveal clock (gated entirely on reduced motion) -----------
  const [revealed, setRevealed] = useState(nCols);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // When mode/workload changes, reset the reveal: full grid if reduced, else animate.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `mode` is an intentional reset trigger (re-run when static/continuous is toggled); the body does not read it.
  useEffect(() => {
    setRevealed(reduced ? nCols : 0);
  }, [reduced, nCols, mode]);

  const [playing, setPlaying] = useState(!reduced);
  useEffect(() => {
    // Pause the reveal clock when reduced, paused, or scrolled out of view.
    if (reduced || !playing || !inView) return;
    timer.current = setInterval(() => {
      setRevealed((c) => {
        if (c >= nCols) return c;
        return c + 1;
      });
    }, STEP_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [reduced, playing, nCols, inView]);

  const atEnd = revealed >= nCols;

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (!p && atEnd) setRevealed(0); // replay from start
      return !p;
    });
  }, [atEnd]);
  const showAll = useCallback(() => {
    setPlaying(false);
    setRevealed(nCols);
  }, [nCols]);
  const stepForward = useCallback(() => {
    setPlaying(false);
    setRevealed((c) => Math.min(nCols, c + 1));
  }, [nCols]);
  const stepBack = useCallback(() => {
    setPlaying(false);
    setRevealed((c) => Math.max(0, c - 1));
  }, []);

  // `revealed` already initializes to the full grid under reduced motion (see the
  // reveal effect), so the Step ◀/▶ buttons stay live and can walk iterations.
  const shownCols = revealed;

  // Live utilization over the revealed portion (rises as the grid fills in).
  const liveUtil = useMemo(() => utilization(schedule.slice(0, shownCols)), [schedule, shownCols]);
  const shownUtil =
    shownCols >= nCols ? (mode === 'static' ? staticUtil : continuousUtil) : liveUtil;

  const pct = (u: number) => `${Math.round(u * 100)}%`;
  const gain = continuousUtil - staticUtil;

  const panel: CSSProperties = {
    backgroundColor: COLOR.surface,
    borderColor: COLOR.border,
  };

  return (
    <section
      ref={rootRef}
      className="mx-auto flex w-full max-w-[900px] flex-col gap-4 rounded-xl border p-4 font-sans text-ink sm:p-6"
      style={panel}
      aria-label="Static versus continuous batching timeline"
    >
      {/* header: mode toggle + utilization readout */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex rounded-md border p-0.5"
          role="group"
          aria-label="Batching strategy"
          style={{ borderColor: COLOR.border }}
        >
          {(['static', 'continuous'] as const).map((m) => {
            const on = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={on}
                className="rounded border px-3 py-1 font-mono text-xs capitalize transition-colors "
                style={{
                  color: on ? COLOR.modelAccent : COLOR.muted,
                  fontWeight: on ? 600 : 400,
                  borderColor: on ? COLOR.modelAccent : 'transparent',
                  backgroundColor: on ? withAlpha(COLOR.modelAccent, 0.3) : 'transparent',
                }}
              >
                {m}
              </button>
            );
          })}
        </div>

        <div className="flex items-baseline gap-2 font-mono">
          <span className="text-xs text-muted">utilization</span>
          <span
            className="text-2xl font-semibold tabular-nums"
            style={{ color: mode === 'continuous' ? COLOR.hwAccent : COLOR.active }}
          >
            {pct(shownUtil)}
          </span>
        </div>
      </header>

      {/* contrast bar: static vs continuous final utilization */}
      <div className="flex flex-col gap-1 font-mono text-xs">
        {(['static', 'continuous'] as const).map((m) => {
          const u = m === 'static' ? staticUtil : continuousUtil;
          const c = m === 'static' ? COLOR.active : COLOR.hwAccent;
          return (
            <div key={m} className="flex items-center gap-2">
              <span className="w-20 shrink-0 capitalize text-muted">{m}</span>
              <div
                className="h-2 flex-1 overflow-hidden rounded-full"
                style={{ backgroundColor: withAlpha(COLOR.faint, 0.14) }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${u * 100}%`, backgroundColor: c }}
                />
              </div>
              <span className="w-10 shrink-0 text-right tabular-nums" style={{ color: c }}>
                {pct(u)}
              </span>
            </div>
          );
        })}
        <span className="text-faint">
          continuous packs +{Math.round(gain * 100)} points of slot utilization
        </span>
      </div>

      {/* timeline grid: rows = slots, columns = iterations */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between font-mono text-[0.7rem] text-faint">
          <span>rows = slots · columns = decode iterations</span>
          <span className="tabular-nums">
            iter {Math.min(shownCols, nCols)} / {nCols}
          </span>
        </div>
        <div
          className="grid gap-0.5 rounded-md border p-1.5"
          style={{
            borderColor: COLOR.border,
            gridTemplateColumns: `auto repeat(${nCols}, minmax(0, 1fr))`,
          }}
          role="img"
          aria-label={`${mode} batching timeline: ${nRows} slots over ${nCols} iterations, ${pct(
            mode === 'static' ? staticUtil : continuousUtil,
          )} utilized`}
        >
          {Array.from({ length: nRows }, (_, slot) => (
            <SlotRow
              key={slot}
              slot={slot}
              schedule={schedule}
              nCols={nCols}
              shownCols={shownCols}
            />
          ))}
        </div>
        {/* legend */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.7rem] text-muted">
          {workload.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-[2px]"
                style={{ backgroundColor: seqColor(s.id) }}
              />
              seq {s.id}
              <span className="text-muted">·{s.length} it</span>
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-[2px]"
              style={{ backgroundColor: withAlpha(COLOR.inert, 0.45) }}
            />
            idle
          </span>
        </div>
      </div>

      {/* transport controls */}
      <div
        className="flex flex-wrap items-center gap-2 border-t pt-3"
        style={{ borderColor: COLOR.border }}
      >
        {!reduced && (
          <button
            type="button"
            onClick={togglePlay}
            aria-pressed={playing}
            className="rounded-md border px-3 py-1 font-mono text-xs text-ink transition-colors hover:bg-surface-raised "
            style={{ borderColor: COLOR.border, backgroundColor: COLOR.surface }}
          >
            {playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
          </button>
        )}
        <button
          type="button"
          onClick={stepBack}
          disabled={shownCols === 0}
          className="rounded-md border px-3 py-1 font-mono text-xs text-ink transition-colors hover:bg-surface-raised disabled:opacity-40"
          style={{ borderColor: COLOR.border, backgroundColor: COLOR.surface }}
          aria-label="Step back one iteration"
        >
          ◀ Step
        </button>
        <button
          type="button"
          onClick={stepForward}
          disabled={atEnd}
          className="rounded-md border px-3 py-1 font-mono text-xs text-ink transition-colors hover:bg-surface-raised disabled:opacity-40"
          style={{ borderColor: COLOR.border, backgroundColor: COLOR.surface }}
          aria-label="Step forward one iteration"
        >
          Step ▶
        </button>
        <button
          type="button"
          onClick={showAll}
          className="rounded-md border px-3 py-1 font-mono text-xs text-muted transition-colors hover:bg-surface-raised "
          style={{ borderColor: COLOR.border, backgroundColor: COLOR.surface }}
          aria-label="Reveal the whole timeline"
        >
          Show all
        </button>
      </div>

      {reduced && (
        <p className="font-mono text-xs text-faint">
          Reduced motion: the full timeline is shown. Use Step ▶ / ◀ to walk iterations.
        </p>
      )}

      <p className="font-mono text-[0.7rem] leading-relaxed text-faint">
        Chunked prefill interleaves long prompt prefills with ongoing decodes so a big prompt never
        stalls the batch; prefix caching reuses the shared prompt&rsquo;s KV across requests.
      </p>
    </section>
  );
}

/** One slot's row of iteration cells (rows = slots, columns = iterations). */
function SlotRow({
  slot,
  schedule,
  nCols,
  shownCols,
}: {
  slot: number;
  schedule: (number | null)[][];
  nCols: number;
  shownCols: number;
}) {
  return (
    <>
      <span className="pr-1.5 font-mono text-[0.65rem] leading-none text-faint flex items-center justify-end tabular-nums">
        s{slot}
      </span>
      {Array.from({ length: nCols }, (_, col) => {
        const revealedCell = col < shownCols;
        const id = revealedCell ? schedule[col][slot] : null;
        const busy = id !== null;

        let bg: string;
        let bd: string;
        if (!revealedCell) {
          bg = withAlpha(COLOR.faint, 0.06);
          bd = withAlpha(COLOR.border, 0.4);
        } else if (busy) {
          const c = seqColor(id as number);
          bg = withAlpha(c, 0.85);
          bd = c;
        } else {
          // idle slot — inert / wasted
          bg = withAlpha(COLOR.inert, 0.4);
          bd = withAlpha(COLOR.inert, 0.7);
        }

        return (
          <div
            key={col}
            className="h-4 rounded-[2px] border transition-colors"
            style={{ backgroundColor: bg, borderColor: bd }}
            title={busy ? `iter ${col}: seq ${id}` : `iter ${col}: idle`}
          />
        );
      })}
    </>
  );
}

export default BatchingTimeline;
