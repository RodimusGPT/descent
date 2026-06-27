import { Token } from '@/components/scroll/Token';
import {
  GPU_OPTIONS,
  type GpuOption,
  MODEL_OPTIONS,
  type ModelOption,
  estimateTokensPerSec,
  estimateVramGB,
  fits,
} from '@/lib/config';
import { COLOR, clamp01, lerpColor, withAlpha } from '@/lib/encoding';
import { PRECISIONS, type PrecisionKey } from '@/lib/quant';
import { useInView } from '@/lib/use-in-view';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * ConfigSandbox (spec 10.5) — the Part 5 capstone.
 *
 * Pick a model + a precision + a GPU, set context length and batch, and watch
 * two numbers fall out: the VRAM the setup needs (weights + KV cache, measured
 * against the card's capacity) and the decode throughput in tokens/sec. The
 * tok/s number is bandwidth ÷ bytes-read-per-token, so it makes the Mixture-of-
 * Experts payoff visible — the 120B MoE reads only ~5B active params per token,
 * so its decode "tape" of Tokens streams far faster than a 70B dense model that
 * is actually smaller on disk.
 *
 * Self-contained: renders with zero required props.
 */

const WIDTH = 760;
const BAR_H = 48;
const TRACK_Y = 26;
/** Capacity sits this far along the track, leaving headroom to show overflow. */
const CAP_FRAC = 0.68;

/** Context-length stops (tokens) for the slider — log-ish ladder. */
const SEQ_STOPS = [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072] as const;
/** Batch-size stops for the slider. */
const BATCH_STOPS = [1, 2, 4, 8, 16, 32] as const;

/** Number of Token cells in the decode tape. */
const TAPE_SLOTS = 16;

export interface ConfigSandboxProps {
  /** Index into MODEL_OPTIONS for the initial model. */
  initialModelIndex?: number;
  /** Index into GPU_OPTIONS for the initial GPU. */
  initialGpuIndex?: number;
}

export function ConfigSandbox({ initialModelIndex = 2, initialGpuIndex = 2 }: ConfigSandboxProps) {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(rootRef);

  const [modelIndex, setModelIndex] = useState(initialModelIndex);
  const [precision, setPrecision] = useState<PrecisionKey>('FP16');
  const [gpuIndex, setGpuIndex] = useState(initialGpuIndex);
  const [seqIndex, setSeqIndex] = useState(3); // 4096
  const [batchIndex, setBatchIndex] = useState(0); // 1

  const baseId = useId();
  const modelGroupId = `${baseId}-model`;
  const precGroupId = `${baseId}-prec`;
  const gpuGroupId = `${baseId}-gpu`;
  const seqId = `${baseId}-seq`;
  const batchId = `${baseId}-batch`;

  const modelMeta: ModelOption = MODEL_OPTIONS[modelIndex];
  const gpu: GpuOption = GPU_OPTIONS[gpuIndex];
  const seqLen = SEQ_STOPS[seqIndex];
  const batch = BATCH_STOPS[batchIndex];

  const vram = estimateVramGB(modelMeta, precision, seqLen, batch);
  const tokPerSec = estimateTokensPerSec(modelMeta, precision, gpu);
  const ok = fits(vram.totalGB, gpu.vramGB);
  const headroom = gpu.vramGB - vram.totalGB;

  const precIndex = PRECISIONS.findIndex((p) => p.key === precision);

  // ---- Pixel scale for the VRAM bar: capacity maps to CAP_FRAC of the track.
  const track = useMemo(() => {
    const plotW = WIDTH - 16;
    const gbPerPx = gpu.vramGB / (plotW * CAP_FRAC);
    const capX = gpu.vramGB / gbPerPx;
    const wPx = vram.weightGB / gbPerPx;
    const kvPx = vram.kvGB / gbPerPx;
    return { plotW, gbPerPx, capX, wPx, kvPx, totalPx: wPx + kvPx };
  }, [gpu.vramGB, vram.weightGB, vram.kvGB]);

  const fillStart = 8;
  const wWithin = Math.min(track.wPx, track.capX);
  const wOver = track.wPx - wWithin;
  const kvWithin = Math.max(0, Math.min(track.kvPx, track.capX - track.wPx));
  const kvOver = track.kvPx - kvWithin;
  const overStartPx = Math.min(track.totalPx, track.capX);
  const overRawPx = wOver + kvOver;
  const overMaxPx = Math.max(0, track.plotW - overStartPx);
  const overPx = Math.min(overRawPx, overMaxPx);
  const overClipped = overRawPx > overMaxPx + 0.5;
  const overColor = lerpColor(COLOR.active, COLOR.activeHot, 0.85);
  const barTransition = reduced ? undefined : 'width 300ms ease, x 300ms ease';

  // ---- Decode tape: a continuous "phase" advances at a rate proportional to
  // tok/s, lighting Token cells in sequence so faster decode reads as a faster
  // sweep. The real rate is scaled to a calm visual cadence.
  const visualHz = useMemo(() => {
    const raw = tokPerSec / 80;
    return Math.min(Math.max(raw, 0.6), 10);
  }, [tokPerSec]);

  const [phase, setPhase] = useState(reduced ? TAPE_SLOTS - 1 : 0);

  useEffect(() => {
    if (reduced || !inView) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setPhase((p) => p + dt * visualHz);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, inView, visualHz]);

  // Static frame (reduced motion / off-screen): a fixed lit head with a trail.
  const staticHead = TAPE_SLOTS - 1;
  const head = reduced ? staticHead : Math.floor(phase) % TAPE_SLOTS;

  // Per-cell warmth: the head is hottest, with a short decaying trail behind it.
  const tapeWeights = useMemo(() => {
    const out: number[] = new Array(TAPE_SLOTS).fill(0);
    const trail = 4;
    for (let t = 0; t <= trail; t++) {
      const idx = (((head - t) % TAPE_SLOTS) + TAPE_SLOTS) % TAPE_SLOTS;
      out[idx] = clamp01(1 - t / (trail + 1));
    }
    return out;
  }, [head]);

  return (
    <div
      ref={rootRef}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 text-ink"
    >
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-sm text-ink">Config sandbox — will it run, and how fast?</h3>
        <p className="text-xs text-muted">
          Model &times; precision &times; GPU &rarr; the VRAM it needs and the tokens/sec it
          decodes. Decode is memory-bound: tok/s &asymp; bandwidth &divide; bytes read per token.
        </p>
      </div>

      {/* Model selector (model accent) */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs text-muted" id={modelGroupId}>
          Model
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={modelGroupId}>
          {MODEL_OPTIONS.map((m, i) => {
            const active = i === modelIndex;
            return (
              <button
                key={m.name}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setModelIndex(i)}
                onKeyDown={(e) =>
                  moveRadioFocus(e, modelIndex, MODEL_OPTIONS.length, setModelIndex)
                }
                title={m.note}
                className="rounded-md border px-3 py-1 font-mono text-sm transition-colors "
                style={{
                  borderColor: active ? COLOR.modelAccent : COLOR.border,
                  backgroundColor: active ? withAlpha(COLOR.modelAccent, 0.18) : 'transparent',
                  color: active ? COLOR.modelAccent : COLOR.muted,
                }}
              >
                {m.name}
                <span className="ml-1 text-[0.7em] opacity-70">
                  {m.activeParamsB < m.paramsB ? `${m.activeParamsB}B active` : `${m.paramsB}B`}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Precision selector (active amber) */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs text-muted" id={precGroupId}>
          Precision
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={precGroupId}>
          {PRECISIONS.map((p) => {
            const active = p.key === precision;
            return (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setPrecision(p.key)}
                onKeyDown={(e) =>
                  moveRadioFocus(e, precIndex, PRECISIONS.length, (i) =>
                    setPrecision(PRECISIONS[i].key),
                  )
                }
                className="rounded-md border px-3 py-1 font-mono text-sm transition-colors "
                style={{
                  borderColor: active ? COLOR.active : COLOR.border,
                  backgroundColor: active ? withAlpha(COLOR.active, 0.18) : 'transparent',
                  color: active ? COLOR.active : COLOR.muted,
                }}
              >
                {p.label}
                <span className="ml-1 text-[0.7em] opacity-70">{p.bits}b</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* GPU selector (hardware accent) */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs text-muted" id={gpuGroupId}>
          GPU
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={gpuGroupId}>
          {GPU_OPTIONS.map((g, i) => {
            const active = i === gpuIndex;
            return (
              <button
                key={g.name}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setGpuIndex(i)}
                onKeyDown={(e) => moveRadioFocus(e, gpuIndex, GPU_OPTIONS.length, setGpuIndex)}
                title={g.note}
                className="rounded-md border px-3 py-1 font-mono text-sm transition-colors "
                style={{
                  borderColor: active ? COLOR.hwAccent : COLOR.border,
                  backgroundColor: active ? withAlpha(COLOR.hwAccent, 0.18) : 'transparent',
                  color: active ? COLOR.hwAccent : COLOR.muted,
                }}
              >
                {g.name}
                <span className="ml-1 text-[0.7em] opacity-70">
                  {g.vramGB}GB · {g.bandwidthTBs}TB/s
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Context + batch sliders */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor={seqId} className="flex items-baseline justify-between text-xs text-muted">
            <span>Context length</span>
            <span className="font-mono tabular-nums" style={{ color: COLOR.hwAccent }}>
              {seqLen.toLocaleString()} tok
            </span>
          </label>
          <input
            id={seqId}
            type="range"
            min={0}
            max={SEQ_STOPS.length - 1}
            step={1}
            value={seqIndex}
            onChange={(e) => setSeqIndex(Number(e.target.value))}
            className="w-full"
            style={{ accentColor: COLOR.hwAccent }}
            aria-valuetext={`${seqLen.toLocaleString()} tokens`}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label
            htmlFor={batchId}
            className="flex items-baseline justify-between text-xs text-muted"
          >
            <span>Batch (concurrent sequences)</span>
            <span className="font-mono tabular-nums" style={{ color: COLOR.hwAccent }}>
              &times;{batch}
            </span>
          </label>
          <input
            id={batchId}
            type="range"
            min={0}
            max={BATCH_STOPS.length - 1}
            step={1}
            value={batchIndex}
            onChange={(e) => setBatchIndex(Number(e.target.value))}
            className="w-full"
            style={{ accentColor: COLOR.hwAccent }}
            aria-valuetext={`batch ${batch}`}
          />
        </div>
      </div>

      {/* VRAM bar vs capacity */}
      <svg
        viewBox={`0 0 ${WIDTH} ${BAR_H + TRACK_Y + 26}`}
        className="w-full"
        role="img"
        aria-label={`${modelMeta.name} at ${precision}: ${vram.totalGB.toFixed(1)} gigabytes total (${vram.weightGB.toFixed(1)} weights plus ${vram.kvGB.toFixed(1)} KV cache) versus ${gpu.vramGB} gigabytes on ${gpu.name} — ${ok ? `fits with ${headroom.toFixed(1)} GB to spare` : `over by ${(-headroom).toFixed(1)} GB`}`}
      >
        <rect
          x={fillStart}
          y={TRACK_Y}
          width={track.plotW}
          height={BAR_H}
          rx={6}
          fill={withAlpha(COLOR.surface, 0.6)}
          stroke={COLOR.border}
          strokeWidth={1}
        />
        {/* weights — model accent */}
        <rect
          x={fillStart}
          y={TRACK_Y}
          width={Math.max(0, wWithin)}
          height={BAR_H}
          fill={withAlpha(COLOR.modelAccent, 0.85)}
          style={barTransition ? { transition: barTransition } : undefined}
        />
        {/* KV cache — hardware accent */}
        <rect
          x={fillStart + wWithin}
          y={TRACK_Y}
          width={Math.max(0, kvWithin)}
          height={BAR_H}
          fill={withAlpha(COLOR.hwAccent, 0.8)}
          style={barTransition ? { transition: barTransition } : undefined}
        />
        {/* overflow — hot */}
        {overPx > 0 && (
          <rect
            x={fillStart + overStartPx}
            y={TRACK_Y}
            width={overPx}
            height={BAR_H}
            fill={withAlpha(overColor, 0.9)}
            style={barTransition ? { transition: barTransition } : undefined}
          />
        )}
        {overClipped && (
          <polygon
            points={`${fillStart + track.plotW - 11},${TRACK_Y + BAR_H / 2 - 8} ${
              fillStart + track.plotW - 2
            },${TRACK_Y + BAR_H / 2} ${fillStart + track.plotW - 11},${TRACK_Y + BAR_H / 2 + 8}`}
            fill={withAlpha(COLOR.surface, 0.85)}
          />
        )}
        {/* capacity marker */}
        <line
          x1={fillStart + track.capX}
          y1={TRACK_Y - 8}
          x2={fillStart + track.capX}
          y2={TRACK_Y + BAR_H + 8}
          stroke={ok ? COLOR.muted : COLOR.activeHot}
          strokeWidth={2}
          strokeDasharray="4 3"
        />
        <text
          x={fillStart + track.capX}
          y={TRACK_Y - 12}
          textAnchor="middle"
          fontSize={11}
          fill={ok ? COLOR.muted : COLOR.activeHot}
          className="font-mono"
        >
          {gpu.vramGB} GB
        </text>
        {!ok && (
          <text
            x={fillStart + track.plotW}
            y={TRACK_Y + BAR_H + 18}
            textAnchor="end"
            fontSize={11}
            fill={COLOR.activeHot}
            className="font-mono"
          >
            over by {formatGB(-headroom)} GB
          </text>
        )}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-[0.7rem] text-muted">
        <Swatch color={COLOR.modelAccent} label="weights" />
        <Swatch color={COLOR.hwAccent} label="KV cache" />
        <Swatch color={overColor} label="over capacity" />
      </div>

      {/* Readouts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout
          label="Weights"
          value={`${formatGB(vram.weightGB)} GB`}
          color={COLOR.modelAccent}
        />
        <Readout label="KV cache" value={`${formatGB(vram.kvGB)} GB`} color={COLOR.hwAccent} />
        <Readout
          label={ok ? 'Fits — headroom' : 'Over capacity'}
          value={ok ? `${formatGB(headroom)} GB` : `+${formatGB(-headroom)} GB`}
          color={ok ? COLOR.hwAccent : COLOR.activeHot}
        />
        <Readout label="Throughput" value={`${formatTps(tokPerSec)} tok/s`} color={COLOR.active} />
      </div>

      {/* Decode tape — the Token motif, streaming at the throughput cadence */}
      <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-raised p-3">
        <div className="flex items-baseline justify-between text-xs text-muted">
          <span>Decode tape — one Token per step</span>
          <span className="font-mono tabular-nums" style={{ color: COLOR.active }}>
            reads {modelMeta.activeParamsB}B &times; {bytesPerParamLabel(precision)} per token
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tapeWeights.map((w, i) => {
            const ch = String.fromCharCode(97 + i);
            return <Token key={ch} text={ch} size="sm" weight={w} />;
          })}
        </div>
        <p className="text-[0.7rem] text-faint">
          {modelMeta.activeParamsB < modelMeta.paramsB
            ? `MoE: ${modelMeta.paramsB}B on disk, but only ${modelMeta.activeParamsB}B fire per token — the tape flies.`
            : 'Dense: every parameter is streamed per token, so throughput tracks total size.'}
        </p>
      </div>
    </div>
  );
}

/** Standard ARIA radiogroup keyboard nav with wraparound; selection follows focus. */
function moveRadioFocus(
  e: KeyboardEvent<HTMLButtonElement>,
  currentIndex: number,
  count: number,
  setIndex: (i: number) => void,
): void {
  let next: number;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (currentIndex + 1) % count;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (currentIndex - 1 + count) % count;
  else return;
  e.preventDefault();
  setIndex(next);
  const radios = e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]');
  radios?.[next]?.focus();
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-sm"
        style={{ backgroundColor: withAlpha(color, 0.85) }}
      />
      {label}
    </span>
  );
}

function Readout({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-raised p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="font-mono text-lg tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function bytesPerParamLabel(key: PrecisionKey): string {
  const p = PRECISIONS.find((x) => x.key === key);
  const b = p ? p.bytesPerParam : 0;
  return b >= 1 ? `${b} byte${b === 1 ? '' : 's'}` : `${b} byte`;
}

function formatGB(gb: number): string {
  const a = Math.abs(gb);
  if (a >= 100) return gb.toFixed(0);
  if (a >= 10) return gb.toFixed(1);
  return gb.toFixed(2);
}

function formatTps(tps: number): string {
  if (tps >= 100) return tps.toFixed(0);
  if (tps >= 10) return tps.toFixed(1);
  return tps.toFixed(2);
}

export default ConfigSandbox;
