import {
  GPU_PRESETS,
  MODEL_SHAPES,
  type ModelShape,
  fits,
  kvCacheGB,
  q4RuleGB,
  weightGB,
} from '@/lib/budget';
import { COLOR, lerpColor, withAlpha } from '@/lib/encoding';
import { PRECISIONS, type PrecisionKey } from '@/lib/quant';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { useId, useMemo, useState } from 'react';

/**
 * MemoryBudget (spec 10.2) — does the model fit in VRAM?
 *
 * A horizontal STACKED bar (weights + KV cache) is measured against a VRAM
 * capacity line for the selected GPU. The bar is scaled so the capacity marker
 * sits at a fixed fraction of the track; when the stack overruns capacity, the
 * overflow segment reads HOT (over budget). Live readouts spell out the
 * arithmetic, and the "size_B x 0.6 ~= Q4 GB" rule of thumb is shown alongside.
 *
 * Self-contained: renders with zero required props.
 */

const WIDTH = 760;
const BAR_H = 56;
const TRACK_Y = 30;
/** Capacity sits this far along the track, leaving headroom to show overflow. */
const CAP_FRAC = 0.66;

/** Context-length stops (tokens) for the slider — log-ish ladder. */
const SEQ_STOPS = [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072] as const;
/** KV cache is stored fp16 (2 bytes/elem) in these presets. */
const KV_BYTES_PER_ELEM = 2;

export interface MemoryBudgetProps {
  /** Index into MODEL_SHAPES for the initial model. */
  initialModelIndex?: number;
  /** Index into GPU_PRESETS for the initial GPU. */
  initialGpuIndex?: number;
}

export function MemoryBudget({ initialModelIndex = 1, initialGpuIndex = 2 }: MemoryBudgetProps) {
  const reduced = usePrefersReducedMotion();

  const [modelIndex, setModelIndex] = useState(initialModelIndex);
  const [precision, setPrecision] = useState<PrecisionKey>('Q4');
  const [seqIndex, setSeqIndex] = useState(3); // 4096
  const [gpuIndex, setGpuIndex] = useState(initialGpuIndex);

  const baseId = useId();
  const modelGroupId = `${baseId}-model`;
  const precGroupId = `${baseId}-prec`;
  const gpuGroupId = `${baseId}-gpu`;
  const seqId = `${baseId}-seq`;

  const shape: ModelShape = MODEL_SHAPES[modelIndex];
  const gpu = GPU_PRESETS[gpuIndex];
  const seqLen = SEQ_STOPS[seqIndex];

  const wGB = weightGB(shape.params, precision);
  const kvGB = kvCacheGB(shape, seqLen, KV_BYTES_PER_ELEM);
  const total = wGB + kvGB;
  const ok = fits(total, gpu.vramGB);
  const headroom = gpu.vramGB - total;

  const ruleGB = q4RuleGB(shape.params / 1e9);

  // Pixel scale: capacity maps to CAP_FRAC of the track width. The track shows a
  // bit beyond the largest of {total, capacity} so overflow is always visible.
  const track = useMemo(() => {
    const plotW = WIDTH - 16;
    const gbPerPx = gpu.vramGB / (plotW * CAP_FRAC);
    const capX = gpu.vramGB / gbPerPx;
    const wPx = wGB / gbPerPx;
    const kvPx = kvGB / gbPerPx;
    const totalPx = wPx + kvPx;
    return { plotW, gbPerPx, capX, wPx, kvPx, totalPx };
  }, [gpu.vramGB, wGB, kvGB]);

  // Split the stack into a within-capacity portion and an over-capacity portion
  // so the overflow can be drawn hot.
  const fillStart = 8;
  const overStartPx = Math.min(track.totalPx, track.capX);
  const wWithin = Math.min(track.wPx, track.capX);
  const wOver = track.wPx - wWithin;
  const kvWithin = Math.max(0, Math.min(track.kvPx, track.capX - track.wPx));
  const kvOver = track.kvPx - kvWithin;

  const barTransition = reduced ? undefined : 'width 300ms ease, x 300ms ease, fill 300ms ease';

  const overColor = lerpColor(COLOR.active, COLOR.activeHot, 0.85);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 text-ink">
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-sm text-ink">Memory budget — does it fit in VRAM?</h3>
        <p className="text-xs text-muted">
          Weights plus a growing KV cache, stacked against your GPU&rsquo;s capacity. Overflow reads
          hot.
        </p>
      </div>

      {/* Stacked bar vs capacity line */}
      <svg
        viewBox={`0 0 ${WIDTH} ${BAR_H + TRACK_Y + 24}`}
        className="w-full"
        role="img"
        aria-label={`${shape.label} at ${precision}: ${total.toFixed(1)} gigabytes total versus ${
          gpu.vramGB
        } gigabytes on ${gpu.name} — ${ok ? `fits with ${headroom.toFixed(1)} GB to spare` : `over by ${(-headroom).toFixed(1)} GB`}`}
      >
        {/* track background */}
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

        {/* weights — within capacity (model accent) */}
        <rect
          x={fillStart}
          y={TRACK_Y}
          width={Math.max(0, wWithin)}
          height={BAR_H}
          fill={withAlpha(COLOR.modelAccent, 0.85)}
          style={barTransition ? { transition: barTransition } : undefined}
        />
        {/* KV cache — within capacity (hardware accent) */}
        <rect
          x={fillStart + wWithin}
          y={TRACK_Y}
          width={Math.max(0, kvWithin)}
          height={BAR_H}
          fill={withAlpha(COLOR.hwAccent, 0.8)}
          style={barTransition ? { transition: barTransition } : undefined}
        />
        {/* overflow portion — hot */}
        {wOver + kvOver > 0 && (
          <rect
            x={fillStart + overStartPx}
            y={TRACK_Y}
            width={wOver + kvOver}
            height={BAR_H}
            fill={withAlpha(overColor, 0.9)}
            style={barTransition ? { transition: barTransition } : undefined}
          />
        )}

        {/* capacity marker line */}
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
        <text
          x={fillStart + track.capX + 4}
          y={TRACK_Y + BAR_H + 18}
          textAnchor="start"
          fontSize={10}
          fill={COLOR.faint}
          className="font-mono"
        >
          {gpu.name}
        </text>
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-[0.7rem] text-muted">
        <Swatch color={COLOR.modelAccent} label="weights" />
        <Swatch color={COLOR.hwAccent} label="KV cache" />
        <Swatch color={overColor} label="over capacity" />
      </div>

      {/* Model-size selector */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs text-muted" id={modelGroupId}>
          Model size
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={modelGroupId}>
          {MODEL_SHAPES.map((s, i) => {
            const active = i === modelIndex;
            return (
              <button
                key={s.label}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setModelIndex(i)}
                className="rounded-md border px-3 py-1 font-mono text-sm transition-colors focus-visible:outline-none"
                style={{
                  borderColor: active ? COLOR.modelAccent : COLOR.border,
                  backgroundColor: active ? withAlpha(COLOR.modelAccent, 0.18) : 'transparent',
                  color: active ? COLOR.modelAccent : COLOR.muted,
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Precision selector */}
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
                onClick={() => setPrecision(p.key)}
                className="rounded-md border px-3 py-1 font-mono text-sm transition-colors focus-visible:outline-none"
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

      {/* Context-length slider */}
      <div className="flex flex-col gap-2">
        <label htmlFor={seqId} className="flex items-baseline justify-between text-xs text-muted">
          <span>Context length</span>
          <span className="font-mono tabular-nums" style={{ color: COLOR.hwAccent }}>
            {seqLen.toLocaleString()} tokens
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
          className="w-full accent-current"
          style={{ color: COLOR.hwAccent }}
          aria-valuetext={`${seqLen.toLocaleString()} tokens`}
        />
      </div>

      {/* GPU selector */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs text-muted" id={gpuGroupId}>
          GPU
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={gpuGroupId}>
          {GPU_PRESETS.map((g, i) => {
            const active = i === gpuIndex;
            return (
              <button
                key={g.name}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setGpuIndex(i)}
                title={g.note}
                className="rounded-md border px-3 py-1 font-mono text-sm transition-colors focus-visible:outline-none"
                style={{
                  borderColor: active ? COLOR.hwAccent : COLOR.border,
                  backgroundColor: active ? withAlpha(COLOR.hwAccent, 0.18) : 'transparent',
                  color: active ? COLOR.hwAccent : COLOR.muted,
                }}
              >
                {g.name}
                <span className="ml-1 text-[0.7em] opacity-70">{g.vramGB}GB</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Readouts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="Weights" value={`${formatGB(wGB)} GB`} color={COLOR.modelAccent} />
        <Readout label="KV cache" value={`${formatGB(kvGB)} GB`} color={COLOR.hwAccent} />
        <Readout label="Total" value={`${formatGB(total)} GB`} color={COLOR.ink} />
        <Readout
          label={ok ? 'Fits — headroom' : 'Over capacity'}
          value={ok ? `${formatGB(headroom)} GB` : `+${formatGB(-headroom)} GB`}
          color={ok ? COLOR.hwAccent : COLOR.activeHot}
        />
      </div>

      {/* Rule of thumb */}
      <div className="rounded-md border border-border bg-surface-raised p-3 text-xs text-muted">
        <span className="font-mono text-ink">Rule of thumb:</span> size<sub>B</sub> &times; 0.6
        &asymp; Q4 GB &nbsp;&rarr;&nbsp;
        <span className="font-mono tabular-nums" style={{ color: COLOR.active }}>
          {' '}
          {(shape.params / 1e9).toFixed(1)}B &times; 0.6 = {ruleGB.toFixed(1)} GB
        </span>{' '}
        <span className="text-faint">(weights only, at ~4-bit)</span>
      </div>
    </div>
  );
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

function formatGB(gb: number): string {
  const a = Math.abs(gb);
  if (a >= 100) return gb.toFixed(0);
  if (a >= 10) return gb.toFixed(1);
  return gb.toFixed(2);
}

export default MemoryBudget;
