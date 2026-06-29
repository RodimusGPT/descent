import { COLOR, withAlpha } from '@/lib/encoding';
import {
  type OnlineSoftmaxStep,
  flashHbmBytes,
  formatBytes,
  naiveHbmBytes,
  onlineSoftmaxSteps,
  trafficRatio,
} from '@/lib/flash';
import { useInView } from '@/lib/use-in-view';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * FlashAttention — spec 10.4, naive vs fused attention as HBM traffic.
 *
 *   NAIVE   materializes the full n×n scores matrix in HBM: written after QKᵀ,
 *           read back for softmax and the ·V product. That round-trip is O(n²)
 *           HBM traffic — the warm, expensive square on the left.
 *
 *   FUSED   (FlashAttention) tiles Q/K/V through on-chip SRAM and keeps a running
 *           max + running sum (an "online" softmax), so the n×n matrix is NEVER
 *           written to HBM. Only Q, K, V, O move — O(n) traffic.
 *
 * A sequence-length slider drives both HBM readouts, so the gap visibly widens as
 * n grows. The fused panel streams its K/V tiles through SRAM, updating the online
 * softmax statistics tile by tile.
 *
 * Self-contained: renders standalone with zero props. Reduced-motion users get the
 * fully-streamed static frame (all tiles processed, final statistics shown).
 */

/** Head dimension d, held fixed; the slider varies sequence length n. */
const HEAD_DIM = 64;
/** Bytes per element (fp16 / bf16). */
const BYTES = 2;
/** Side length of the schematic n×n matrix grid (cells are illustrative, not 1:1). */
const GRID = 10;
/** Animation cadence: one K/V tile streamed per tick. */
const STEP_MS = 650;

/** Sequence lengths the slider snaps to (the n² vs n gap is clearest across decades). */
const SEQ_STEPS = [256, 512, 1024, 2048, 4096, 8192, 16384, 32768] as const;
const DEFAULT_STEP = 3; // 2048

/** Deterministic [0,1) PRNG (mulberry32) — no Math.random, so the demo is stable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Number of K/V tiles drawn for a given n (schematic: grows with n, capped). */
function tileCount(n: number): number {
  return Math.min(10, Math.max(3, Math.round(n / 1024)));
}

export interface FlashAttentionProps {
  /** Index into SEQ_STEPS for the initial sequence length. */
  initialSeqStep?: number;
}

export function FlashAttention({ initialSeqStep = DEFAULT_STEP }: FlashAttentionProps) {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const inView = useInView(rootRef);

  const [seqStep, setSeqStep] = useState(initialSeqStep);
  const n = SEQ_STEPS[seqStep];

  const nTiles = tileCount(n);

  // Per-tile representative score (the block max FlashAttention folds into the
  // running statistics). Seeded so the online softmax is deterministic.
  const tileValues = useMemo(() => {
    const rng = mulberry32(0x5eed + nTiles);
    return Array.from({ length: nTiles }, () => Math.round((rng() * 8 - 2) * 10) / 10);
  }, [nTiles]);

  // --- streaming clock: reveal K/V tiles one at a time -----------------------
  const [revealed, setRevealed] = useState(nTiles);
  const [playing, setPlaying] = useState(!reduced);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset the stream when n changes (full if reduced, else animate from start).
  useEffect(() => {
    setRevealed(reduced ? nTiles : 0);
  }, [reduced, nTiles]);

  useEffect(() => {
    // Pause when reduced-motion, paused, or scrolled out of view.
    if (reduced || !playing || !inView) return;
    timer.current = setInterval(() => {
      setRevealed((c) => (c >= nTiles ? c : c + 1));
    }, STEP_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [reduced, playing, inView, nTiles]);

  const atEnd = revealed >= nTiles;

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (!p && atEnd) setRevealed(0); // replay
      return !p;
    });
  }, [atEnd]);

  const reset = useCallback(() => {
    setSeqStep(DEFAULT_STEP);
    setRevealed(reduced ? tileCount(SEQ_STEPS[DEFAULT_STEP]) : 0);
    setPlaying(!reduced);
  }, [reduced]);

  // online softmax statistics over the tiles streamed so far
  const steps: OnlineSoftmaxStep[] = useMemo(
    () => onlineSoftmaxSteps(tileValues.slice(0, revealed)),
    [tileValues, revealed],
  );
  const stat = steps.length > 0 ? steps[steps.length - 1] : undefined;

  const naiveBytes = naiveHbmBytes(n, HEAD_DIM, BYTES);
  const flashBytes = flashHbmBytes(n, HEAD_DIM, BYTES);
  const ratio = trafficRatio(n, HEAD_DIM, BYTES);

  const tw = reduced ? '' : 'transition-all duration-300';
  const panel: CSSProperties = { backgroundColor: COLOR.surface, borderColor: COLOR.border };

  return (
    <section
      ref={rootRef}
      className="mx-auto flex w-full max-w-[900px] flex-col gap-4 rounded-xl border p-4 font-sans text-ink sm:p-6"
      style={panel}
      aria-label="FlashAttention: naive versus fused attention as HBM memory traffic"
    >
      <header className="flex flex-col gap-0.5">
        <h3 className="font-mono text-sm font-semibold text-ink">
          FlashAttention · naive vs fused
        </h3>
        <p className="font-mono text-xs text-faint">
          n = <span className="tabular-nums text-muted">{n.toLocaleString()}</span> tokens · head
          dim d = {HEAD_DIM} · fp16. Attention is memory-bound: what costs is bytes moved through
          HBM.
        </p>
      </header>

      {/* the two panels */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* ---------------------------------------------------------------- */}
        {/* NAIVE                                                            */}
        {/* ---------------------------------------------------------------- */}
        <div
          className="flex flex-col gap-3 rounded-lg border p-3"
          style={{ borderColor: COLOR.border, backgroundColor: withAlpha(COLOR.activeHot, 0.05) }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-xs font-semibold" style={{ color: COLOR.activeHot }}>
              Naive
            </span>
            <span className="font-mono text-xs text-faint">scores live in HBM</span>
          </div>

          {/* full n×n scores matrix, materialized (warm) */}
          <div className="flex flex-col items-center gap-1">
            <div
              className="grid gap-px rounded border p-1"
              style={{
                gridTemplateColumns: `repeat(${GRID}, minmax(0, 1fr))`,
                borderColor: withAlpha(COLOR.activeHot, 0.5),
                backgroundColor: withAlpha(COLOR.activeHot, 0.08),
              }}
              role="img"
              aria-label={`Full ${n} by ${n} scores matrix, written to and read back from HBM`}
            >
              {Array.from({ length: GRID * GRID }, (_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-[1px]"
                  style={{ backgroundColor: withAlpha(COLOR.activeHot, 0.55) }}
                />
              ))}
            </div>
            <span className="font-mono text-xs text-muted tabular-nums">
              n × n = {(n * n).toLocaleString()} scores
            </span>
          </div>

          <div
            className="flex items-center justify-center gap-1 font-mono text-xs"
            style={{ color: COLOR.activeHot }}
          >
            <span>write → HBM → read</span>
          </div>

          <TrafficReadout
            label="HBM traffic"
            order="O(n²)"
            bytes={naiveBytes}
            color={COLOR.activeHot}
          />
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* FUSED                                                            */}
        {/* ---------------------------------------------------------------- */}
        <div
          className="flex flex-col gap-3 rounded-lg border p-3"
          style={{ borderColor: COLOR.border, backgroundColor: withAlpha(COLOR.hwAccent, 0.05) }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-xs font-semibold" style={{ color: COLOR.hwAccent }}>
              Fused
            </span>
            <span className="font-mono text-xs text-faint">tiled through SRAM</span>
          </div>

          {/* ghost n×n: never materialized */}
          <div className="flex flex-col items-center gap-1">
            <div
              className="relative grid gap-px rounded border border-dashed p-1"
              style={{
                gridTemplateColumns: `repeat(${GRID}, minmax(0, 1fr))`,
                borderColor: withAlpha(COLOR.inert, 0.6),
              }}
              role="img"
              aria-label="The n by n scores matrix is never written to HBM under FlashAttention"
            >
              {Array.from({ length: GRID * GRID }, (_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-[1px]"
                  style={{ backgroundColor: withAlpha(COLOR.inert, 0.12) }}
                />
              ))}
              <span
                className="-translate-x-1/2 -translate-y-1/2 -rotate-12 absolute top-1/2 left-1/2 whitespace-nowrap font-mono text-xs"
                style={{ color: COLOR.muted }}
              >
                never stored
              </span>
            </div>
            <span className="font-mono text-xs text-faint tabular-nums">
              kept in SRAM, tile by tile
            </span>
          </div>

          {/* streaming K/V tiles */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-muted">K/V tiles → SRAM</span>
              <span className="font-mono text-xs text-faint tabular-nums">
                {Math.min(revealed, nTiles)}/{nTiles}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {tileValues.map((v, i) => {
                const done = i < revealed;
                const current = !reduced && i === revealed - 1 && !atEnd;
                const c = current ? COLOR.active : COLOR.hwAccent;
                return (
                  <div
                    key={i}
                    className={`flex h-7 flex-1 items-center justify-center rounded-[3px] border font-mono text-xs tabular-nums ${tw}`}
                    style={{
                      minWidth: '1.75rem',
                      borderColor: done ? c : withAlpha(COLOR.inert, 0.5),
                      borderStyle: done ? 'solid' : 'dashed',
                      backgroundColor: done ? withAlpha(c, current ? 0.4 : 0.2) : 'transparent',
                      color: done ? COLOR.ink : COLOR.faint,
                    }}
                    title={`tile ${i}: block score ${v}`}
                  >
                    {v}
                  </div>
                );
              })}
            </div>
          </div>

          {/* online softmax running stats */}
          <div
            className="flex items-center justify-between gap-2 rounded border px-2 py-1.5"
            style={{ borderColor: withAlpha(COLOR.hwAccent, 0.4) }}
          >
            <span className="font-mono text-xs text-muted">online softmax</span>
            <span className="flex gap-3 font-mono text-xs tabular-nums">
              <span style={{ color: COLOR.hwAccent }}>
                max <span className="text-ink">{stat ? stat.runningMax.toFixed(1) : '—'}</span>
              </span>
              <span style={{ color: COLOR.hwAccent }}>
                Σ <span className="text-ink">{stat ? stat.runningSum.toFixed(2) : '—'}</span>
              </span>
            </span>
          </div>

          <TrafficReadout
            label="HBM traffic"
            order="O(n)"
            bytes={flashBytes}
            color={COLOR.hwAccent}
          />
        </div>
      </div>

      {/* gap comparison bar */}
      <GapBar naiveBytes={naiveBytes} flashBytes={flashBytes} ratio={ratio} tw={tw} />

      {/* controls */}
      <div className="flex flex-col gap-3 border-t pt-3" style={{ borderColor: COLOR.border }}>
        <label className="flex flex-col gap-1 font-mono text-xs text-muted">
          <span>
            Sequence length: <span className="tabular-nums text-ink">{n.toLocaleString()}</span>{' '}
            tokens
          </span>
          <input
            type="range"
            min={0}
            max={SEQ_STEPS.length - 1}
            step={1}
            value={seqStep}
            onChange={(e) => setSeqStep(Number(e.target.value))}
            className="w-full"
            style={{ accentColor: COLOR.hwAccent }}
            aria-label="Sequence length in tokens"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            disabled={reduced}
            className={`rounded-md border px-3 py-1 font-mono text-xs ${tw} hover:bg-surface-raised disabled:opacity-40`}
            style={{ borderColor: COLOR.border, color: COLOR.muted }}
            aria-label={playing ? 'Pause tile streaming' : 'Play tile streaming'}
          >
            {playing && !atEnd ? 'Pause' : atEnd ? 'Replay' : 'Play'}
          </button>
          <button
            type="button"
            onClick={reset}
            className={`ml-auto rounded-md border px-3 py-1 font-mono text-xs text-muted ${tw} hover:bg-surface-raised`}
            style={{ borderColor: COLOR.border, backgroundColor: COLOR.surface }}
          >
            Reset
          </button>
        </div>

        {reduced && (
          <p className="font-mono text-xs text-faint">
            Reduced motion: all K/V tiles are shown already streamed, with the final online-softmax
            statistics.
          </p>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function TrafficReadout({
  label,
  order,
  bytes,
  color,
}: {
  label: string;
  order: string;
  bytes: number;
  color: string;
}) {
  return (
    <div
      className="mt-auto flex items-center justify-between gap-2 rounded-md border px-3 py-2"
      style={{ borderColor: COLOR.border, backgroundColor: withAlpha(COLOR.faint, 0.08) }}
    >
      <span className="flex flex-col">
        <span className="font-mono text-xs text-faint">{label}</span>
        <span className="font-mono text-xs" style={{ color }}>
          {order}
        </span>
      </span>
      <span className="font-mono text-sm font-semibold tabular-nums" style={{ color }}>
        {formatBytes(bytes)}
      </span>
    </div>
  );
}

function GapBar({
  naiveBytes,
  flashBytes,
  ratio,
  tw,
}: {
  naiveBytes: number;
  flashBytes: number;
  ratio: number;
  tw: string;
}) {
  const max = Math.max(naiveBytes, flashBytes, 1);
  const naivePct = (naiveBytes / max) * 100;
  const flashPct = Math.max((flashBytes / max) * 100, 1.5);
  return (
    <div
      className="flex flex-col gap-2 rounded-md border px-3 py-3"
      style={{ borderColor: COLOR.border, backgroundColor: withAlpha(COLOR.faint, 0.06) }}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted">HBM traffic, to scale</span>
        <span className="font-mono text-xs">
          <span className="tabular-nums" style={{ color: COLOR.activeHot }}>
            {ratio.toFixed(1)}×
          </span>{' '}
          <span className="text-faint">more for naive</span>
        </span>
      </div>
      <Bar label="naive" pct={naivePct} color={COLOR.activeHot} tw={tw} />
      <Bar label="fused" pct={flashPct} color={COLOR.hwAccent} tw={tw} />
    </div>
  );
}

function Bar({
  label,
  pct,
  color,
  tw,
}: {
  label: string;
  pct: number;
  color: string;
  tw: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 font-mono text-xs" style={{ color }}>
        {label}
      </span>
      <div
        className="h-3 flex-1 overflow-hidden rounded-full"
        style={{ backgroundColor: withAlpha(COLOR.inert, 0.18) }}
      >
        <div
          className={`h-full rounded-full ${tw}`}
          style={{ width: `${pct}%`, backgroundColor: withAlpha(color, 0.7) }}
        />
      </div>
    </div>
  );
}

export default FlashAttention;
