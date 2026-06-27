import { Token } from '@/components/scroll/Token';
import { COLOR, withAlpha } from '@/lib/encoding';
import { MODEL_PRESETS, type ModelPreset, kvCacheBytes, recomputeWork } from '@/lib/memory';
import { useInView } from '@/lib/use-in-view';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * PrefillDecode — spec 9.4, the M3 MVP-checkpoint anchor.
 *
 * Teaches the two regimes of autoregressive generation:
 *   PREFILL  (compute-bound) — the whole prompt is processed in ONE parallel pass.
 *   DECODE   (memory-bound)  — one token emitted per step, filling a KV-cache grid.
 *
 * The "No cache" toggle replays the wasteful O(n^2) path where every step
 * reprocesses all prior tokens; a context slider + preset picker drive a live
 * KV-cache memory readout (GQA vs MHA visibly differ). Reduced-motion users get a
 * stepped static fallback with no auto-animation.
 */

const PROMPT_TOKENS = ['The', 'cat', 'sat', 'on', 'the'] as const;
const DECODE_TOKENS = ['mat', 'and', 'purred', 'softly', 'all', 'night'] as const;

/** Total animated frames: prefill (1) + one per decoded token. */
const N_DECODE = DECODE_TOKENS.length;
const LAST_FRAME = N_DECODE; // frame 0 = prefill, 1..N = decode steps

/** Number of layer rows drawn in the KV-cache grid (illustrative, not real depth). */
const GRID_ROWS = 4;

const STEP_MS = 900;

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

export interface PrefillDecodeProps {
  /** Optional starting preset index. */
  initialPresetIndex?: number;
}

export function PrefillDecode({ initialPresetIndex = 0 }: PrefillDecodeProps) {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const inView = useInView(rootRef);

  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [noCache, setNoCache] = useState(false);
  const [presetIndex, setPresetIndex] = useState(initialPresetIndex);
  const [seqLen, setSeqLen] = useState(4096);

  const preset: ModelPreset = MODEL_PRESETS[presetIndex] ?? MODEL_PRESETS[0];

  // --- animation clock (gated entirely on reduced motion) -------------------
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    // Pause the clock when reduced, paused, or scrolled out of view.
    if (reduced || !playing || !inView) return;
    timer.current = setInterval(() => {
      setFrame((f) => {
        if (f >= LAST_FRAME) {
          setPlaying(false);
          return f;
        }
        return f + 1;
      });
    }, STEP_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [reduced, playing, inView]);

  const atEnd = frame >= LAST_FRAME;

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (!p && atEnd) setFrame(0); // replay from start
      return !p;
    });
  }, [atEnd]);

  const stepForward = useCallback(() => {
    setPlaying(false);
    setFrame((f) => Math.min(LAST_FRAME, f + 1));
  }, []);
  const stepBack = useCallback(() => {
    setPlaying(false);
    setFrame((f) => Math.max(0, f - 1));
  }, []);
  const reset = useCallback(() => {
    setPlaying(false);
    setFrame(0);
  }, []);

  // --- derived view state ----------------------------------------------------
  const inDecode = frame >= 1;
  const decodedCount = Math.max(0, frame); // tokens emitted so far (frame n => n tokens)
  const decodedTokens = DECODE_TOKENS.slice(0, decodedCount);

  // step counter: cached grows O(n), uncached grows O(n^2)
  const cachedWork = recomputeWork(decodedCount, true);
  const uncachedWork = recomputeWork(decodedCount, false);
  const shownWork = noCache ? uncachedWork : cachedWork;

  // KV-cache memory readout (live from the slider + preset)
  const cacheNow = useMemo(
    () =>
      kvCacheBytes({
        nLayers: preset.nLayers,
        nKvHeads: preset.nKvHeads,
        headDim: preset.headDim,
        seqLen,
        bytesPerElem: preset.bytesPerParam,
      }),
    [preset, seqLen],
  );
  const cacheMha = useMemo(
    () =>
      kvCacheBytes({
        nLayers: preset.nLayers,
        nKvHeads: preset.nHeads, // full multi-head: KV heads == query heads
        headDim: preset.headDim,
        seqLen,
        bytesPerElem: preset.bytesPerParam,
      }),
    [preset, seqLen],
  );
  const shrink = cacheMha / cacheNow;

  const phaseLabel = inDecode ? 'DECODE' : 'PREFILL';
  const phaseColor = inDecode ? COLOR.modelAccent : COLOR.active;
  const boundLabel = inDecode ? 'MEMORY-BOUND' : 'COMPUTE-BOUND';

  // --- styles ---------------------------------------------------------------
  const panel: CSSProperties = {
    backgroundColor: COLOR.surface,
    borderColor: COLOR.border,
  };

  return (
    <section
      ref={rootRef}
      className="flex w-full flex-col gap-4 rounded-xl border p-4 font-sans text-ink sm:p-6"
      style={panel}
      aria-label="Prefill and decode with KV cache"
    >
      {/* header / phase banner */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="rounded-md px-2 py-1 font-mono text-xs font-semibold"
            style={{ color: phaseColor, backgroundColor: withAlpha(phaseColor, 0.14) }}
          >
            {phaseLabel}
          </span>
          <span className="font-mono text-xs text-muted">{boundLabel}</span>
        </div>
        <span className="font-mono text-xs text-faint">
          frame {frame} / {LAST_FRAME}
        </span>
      </header>

      {/* Phase 1: PREFILL — all prompt tokens processed in parallel */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">Prompt — processed in one parallel pass</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {PROMPT_TOKENS.map((t, i) => (
            <Token
              key={`p-${i}`}
              text={t}
              id={i}
              // During prefill every prompt token lights up together (parallel);
              // afterwards they stay warm in the context.
              state="active"
              weight={frame === 0 ? 0.9 : 0.45}
              size="sm"
            />
          ))}
        </div>
      </div>

      {/* Phase 2: DECODE — one token per step */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">
          Generated — one token per step (autoregressive loop)
        </span>
        <div className="flex min-h-[2rem] flex-wrap items-center gap-1.5">
          {decodedTokens.length === 0 && (
            <span className="font-mono text-xs text-faint">— not started —</span>
          )}
          {decodedTokens.map((t, i) => {
            const isNewest = i === decodedTokens.length - 1;
            return (
              <Token
                key={`d-${i}`}
                text={t}
                id={PROMPT_TOKENS.length + i}
                state="active"
                weight={isNewest ? 1 : 0.5}
                size="sm"
                selected={isNewest}
              />
            );
          })}
        </div>
      </div>

      {/* KV-cache grid: rows = layers, cols = tokens; fills cell-by-cell */}
      <KvGrid
        promptLen={PROMPT_TOKENS.length}
        decodedCount={decodedCount}
        noCache={noCache}
        frame={frame}
      />

      {/* work counter: O(n) vs O(n^2) */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
        style={{ borderColor: COLOR.border, backgroundColor: withAlpha(COLOR.faint, 0.08) }}
      >
        <span className="font-mono text-xs text-muted">token-processings to reach here</span>
        <span className="flex items-baseline gap-2 font-mono text-sm">
          <span
            className="font-semibold tabular-nums"
            style={{ color: noCache ? COLOR.activeHot : COLOR.hwAccent }}
          >
            {shownWork}
          </span>
          <span className="text-xs text-faint">
            {noCache
              ? `no cache · O(n²) · vs ${cachedWork} cached`
              : 'cached · O(n) · 1 new token / step'}
          </span>
        </span>
      </div>

      {/* controls */}
      <div className="flex flex-col gap-3 border-t pt-3" style={{ borderColor: COLOR.border }}>
        {/* transport */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Primary cluster: play + step back/forward, kept tight together. */}
          <div className="flex items-center gap-1.5">
            {!reduced && (
              <button
                type="button"
                onClick={togglePlay}
                className="rounded-md border px-3 py-1 font-mono text-xs font-semibold transition-colors hover:brightness-110 "
                style={{
                  borderColor: COLOR.active,
                  backgroundColor: withAlpha(COLOR.active, 0.16),
                  color: COLOR.active,
                }}
                aria-pressed={playing}
              >
                {playing ? '❚❚ Pause' : atEnd ? '↻ Replay' : '▶ Play'}
              </button>
            )}
            <button
              type="button"
              onClick={stepBack}
              disabled={frame === 0}
              className="rounded-md border px-3 py-1 font-mono text-xs font-medium text-ink transition-colors hover:bg-surface-raised disabled:opacity-40"
              style={{ borderColor: COLOR.border, backgroundColor: COLOR.surface }}
              aria-label="Step back one frame"
            >
              ◀ Back
            </button>
            <button
              type="button"
              onClick={stepForward}
              disabled={atEnd}
              className="rounded-md border px-3 py-1 font-mono text-xs font-medium text-ink transition-colors hover:bg-surface-raised disabled:opacity-40"
              style={{ borderColor: COLOR.border, backgroundColor: COLOR.surface }}
              aria-label="Step forward one frame"
            >
              Next ▶
            </button>
          </div>

          {/* Reset is recessive — secondary to play/step. */}
          <button
            type="button"
            onClick={reset}
            className="rounded-md px-2 py-1 font-mono text-xs text-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
            aria-label="Reset to start"
          >
            ↺ Reset
          </button>

          <label className="ml-auto flex cursor-pointer items-center gap-2 font-mono text-xs text-muted">
            <input
              type="checkbox"
              checked={noCache}
              onChange={(e) => setNoCache(e.target.checked)}
              className="h-4 w-4 accent-current"
              style={{ accentColor: COLOR.activeHot }}
            />
            No cache (recompute all)
          </label>
        </div>

        {reduced && (
          <p className="font-mono text-xs text-faint">
            Reduced motion: auto-play is off. Use Next ▶ / ◀ Back to advance frames manually.
          </p>
        )}

        {/* preset + context slider → KV-cache memory readout */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-6">
          <label className="flex flex-col gap-1 font-mono text-xs text-muted">
            <span>Model</span>
            <select
              value={presetIndex}
              onChange={(e) => setPresetIndex(Number(e.target.value))}
              className="rounded-md border px-2 py-1 text-ink "
              style={{ borderColor: COLOR.border, backgroundColor: COLOR.surface }}
            >
              {MODEL_PRESETS.map((p, i) => (
                <option key={p.name} value={i}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-1 flex-col gap-1 font-mono text-xs text-muted">
            <span>
              Context length:{' '}
              <span className="tabular-nums text-ink">{seqLen.toLocaleString()}</span> tokens
            </span>
            <input
              type="range"
              min={256}
              max={32768}
              step={256}
              value={seqLen}
              onChange={(e) => setSeqLen(Number(e.target.value))}
              className="w-full"
              style={{ accentColor: COLOR.modelAccent }}
              aria-label="Context length in tokens"
            />
          </label>
        </div>

        <p className="font-mono text-[0.7rem] text-faint">{preset.note}</p>

        {/* memory readout */}
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 font-mono text-xs">
          <span className="text-muted">
            KV cache{' '}
            <span className="font-semibold tabular-nums" style={{ color: COLOR.modelAccent }}>
              {formatBytes(cacheNow)}
            </span>
          </span>
          <span className="text-muted">
            full MHA would be{' '}
            <span className="tabular-nums" style={{ color: COLOR.active }}>
              {formatBytes(cacheMha)}
            </span>
          </span>
          <span className="text-faint">
            {shrink > 1.01
              ? `→ ${shrink.toFixed(1)}× smaller via grouped KV heads`
              : '→ full multi-head attention (no sharing)'}
          </span>
        </div>
      </div>
    </section>
  );
}

/** The KV-cache grid: rows = layers, columns = tokens in context. */
function KvGrid({
  promptLen,
  decodedCount,
  noCache,
  frame,
}: {
  promptLen: number;
  decodedCount: number;
  noCache: boolean;
  frame: number;
}) {
  const cols = promptLen + DECODE_TOKENS.length;
  // tokens whose K/V are present in the cache right now
  const filledCols = promptLen + decodedCount;
  const newestCol = filledCols - 1;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">KV cache · rows = layers, cols = tokens</span>
        <span className="font-mono text-[0.7rem] text-faint">
          {noCache ? 'recomputed each step' : 'reused each step'}
        </span>
      </div>
      <div
        className="grid gap-0.5 rounded-md border p-1.5"
        style={{
          borderColor: COLOR.border,
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        }}
        role="img"
        aria-label={`KV cache grid, ${filledCols} of ${cols} token columns filled`}
      >
        {Array.from({ length: GRID_ROWS * cols }, (_, idx) => {
          const col = idx % cols;
          const isPrompt = col < promptLen;
          const isFilled = col < filledCols;
          // In "no cache" mode, every prior column is re-touched (recomputed) on the
          // current step, so the whole filled region flashes; with cache only the
          // newest column is written.
          const recomputing = noCache && frame >= 1 && isFilled;
          const isNewest = col === newestCol && decodedCount > 0;

          let bg = withAlpha(COLOR.faint, 0.08);
          let bd = withAlpha(COLOR.border, 0.6);
          if (isFilled) {
            if (isNewest) {
              bg = withAlpha(COLOR.activeHot, 0.55);
              bd = COLOR.activeHot;
            } else if (recomputing) {
              bg = withAlpha(COLOR.activeHot, 0.28);
              bd = withAlpha(COLOR.activeHot, 0.6);
            } else if (isPrompt) {
              bg = withAlpha(COLOR.active, 0.3);
              bd = withAlpha(COLOR.active, 0.6);
            } else {
              bg = withAlpha(COLOR.modelAccent, 0.32);
              bd = withAlpha(COLOR.modelAccent, 0.6);
            }
          }
          return (
            <div
              key={idx}
              className="h-3 rounded-[2px] border transition-colors"
              style={{ backgroundColor: bg, borderColor: bd }}
            />
          );
        })}
      </div>
    </div>
  );
}

export default PrefillDecode;
