import { COLOR, clamp01, lerpColor, withAlpha } from '@/lib/encoding';
import {
  HARDWARE,
  attainableFlops,
  decodeIntensity,
  isMemoryBound,
  prefillIntensity,
  ridgeIntensity,
} from '@/lib/roofline';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { scaleLog } from 'd3-scale';
import { type CSSProperties, useCallback, useId, useMemo, useState } from 'react';

/**
 * Roofline — the roofline model on a log-log plot (spec 10.4).
 *
 * x = arithmetic intensity (FLOPs/byte), y = attainable throughput (FLOP/s).
 * Two roofs meet at the ridge point: a sloped MEMORY roof (`ai * bandwidth`) and
 * a flat COMPUTE roof (`peak`). Left of the ridge a kernel is memory-bound; right
 * of it, compute-bound.
 *
 * PREFILL sits far right (compute-bound). DECODE starts at batch 1 deep in the
 * memory-bound region; the batch-size slider drags the decode operating point
 * right along the roofline — amortising each weight load over more tokens — until
 * it crosses the ridge and turns compute-bound.
 *
 * Self-contained: renders with zero required props.
 */

const WIDTH = 760;
const HEIGHT = 440;
const PAD_L = 64;
const PAD_R = 24;
const PAD_T = 28;
const PAD_B = 56;

/** Plot domain (log). */
const AI_MIN = 0.5;
const AI_MAX = 4096;

/** Batch-size ladder for the slider (log-spaced). */
const BATCH_STOPS = [1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512] as const;
/** Default points at a memory-bound batch — the static / reduced-motion frame. */
const DEFAULT_BATCH_INDEX = 6; // batch 32

export interface RooflineProps {
  /** The accelerator whose roofs are drawn. */
  hardware?: typeof HARDWARE;
  /** Initial index into BATCH_STOPS. */
  initialBatchIndex?: number;
}

export function Roofline({
  hardware = HARDWARE,
  initialBatchIndex = DEFAULT_BATCH_INDEX,
}: RooflineProps) {
  const reduced = usePrefersReducedMotion();
  const baseId = useId();
  const batchId = `${baseId}-batch`;

  const [batchIndex, setBatchIndex] = useState(initialBatchIndex);
  const batch = BATCH_STOPS[batchIndex];

  const { peakFlops, bandwidthBytesPerSec: bw } = hardware;
  const ridge = useMemo(() => ridgeIntensity(peakFlops, bw), [peakFlops, bw]);

  // Operating points.
  const decodeAi = decodeIntensity(batch);
  const decodeFlops = attainableFlops(decodeAi, peakFlops, bw);
  const decodeMemBound = isMemoryBound(decodeAi, ridge);

  const prefillAi = prefillIntensity();
  const prefillFlops = attainableFlops(prefillAi, peakFlops, bw);

  // Scales (log-log).
  const xScale = useMemo(
    () =>
      scaleLog()
        .domain([AI_MIN, AI_MAX])
        .range([PAD_L, WIDTH - PAD_R]),
    [],
  );
  const yMin = AI_MIN * bw; // the memory roof at the left edge
  const yMax = peakFlops * 2;
  const yScale = useMemo(
    () =>
      scaleLog()
        .domain([yMin, yMax])
        .range([HEIGHT - PAD_B, PAD_T]),
    [yMin, yMax],
  );

  const x = useCallback((ai: number) => xScale(ai), [xScale]);
  const y = useCallback((f: number) => yScale(f), [yScale]);

  // Roof polyline: sloped memory roof up to the ridge, then a flat compute roof.
  const roofPath = useMemo(() => {
    const startX = x(AI_MIN);
    const startY = y(attainableFlops(AI_MIN, peakFlops, bw));
    const ridgeX = x(ridge);
    const ridgeY = y(peakFlops);
    const endX = x(AI_MAX);
    return `M ${startX} ${startY} L ${ridgeX} ${ridgeY} L ${endX} ${ridgeY}`;
  }, [x, y, ridge, peakFlops, bw]);

  // Decode color: cool (memory-starved) → warm (compute-saturated) by ai/ridge.
  const decodeColor = lerpColor(COLOR.inert, COLOR.active, clamp01(decodeAi / ridge));

  const xTicks = [1, 10, 100, 1000] as const;
  const yTicks = [1e12, 1e13, 1e14, 1e15] as const;

  const panel: CSSProperties = { backgroundColor: COLOR.surface, borderColor: COLOR.border };
  const pointTransition = reduced ? undefined : 'transform 320ms cubic-bezier(0.22,1,0.36,1)';

  return (
    <section
      className="mx-auto flex w-full max-w-[900px] flex-col gap-4 rounded-xl border p-4 font-sans text-ink sm:p-6"
      style={panel}
      aria-label="Roofline model: arithmetic intensity versus attainable throughput"
    >
      <header className="flex flex-col gap-1">
        <h3 className="font-mono text-sm text-ink">Roofline — what bounds the kernel?</h3>
        <p className="text-xs text-muted">
          Arithmetic intensity (FLOPs per byte) decides the bottleneck. Below the ridge:
          memory-bound. Above it: compute-bound. Raise the decode batch to slide right toward the
          roof.
        </p>
      </header>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Log-log roofline for ${hardware.name}. Ridge point at ${formatAi(
          ridge,
        )} FLOPs per byte. Prefill is compute-bound at ${formatAi(
          prefillAi,
        )} FLOPs per byte. Decode at batch ${batch} is ${
          decodeMemBound ? 'memory-bound' : 'compute-bound'
        } at ${formatAi(decodeAi)} FLOPs per byte, reaching ${formatFlops(decodeFlops)}.`}
      >
        {/* region shading: memory-bound (left) cool, compute-bound (right) teal */}
        <rect
          x={PAD_L}
          y={PAD_T}
          width={x(ridge) - PAD_L}
          height={HEIGHT - PAD_B - PAD_T}
          fill={withAlpha(COLOR.inert, 0.1)}
        />
        <rect
          x={x(ridge)}
          y={PAD_T}
          width={WIDTH - PAD_R - x(ridge)}
          height={HEIGHT - PAD_B - PAD_T}
          fill={withAlpha(COLOR.hwAccent, 0.07)}
        />

        {/* grid + axis ticks */}
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line
              x1={x(t)}
              y1={PAD_T}
              x2={x(t)}
              y2={HEIGHT - PAD_B}
              stroke={withAlpha(COLOR.border, 0.6)}
              strokeWidth={1}
            />
            <text
              x={x(t)}
              y={HEIGHT - PAD_B + 16}
              textAnchor="middle"
              fontSize={12}
              fill={COLOR.faint}
              className="font-mono"
            >
              {t.toLocaleString()}
            </text>
          </g>
        ))}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line
              x1={PAD_L}
              y1={y(t)}
              x2={WIDTH - PAD_R}
              y2={y(t)}
              stroke={withAlpha(COLOR.border, 0.6)}
              strokeWidth={1}
            />
            <text
              x={PAD_L - 8}
              y={y(t) + 3}
              textAnchor="end"
              fontSize={12}
              fill={COLOR.faint}
              className="font-mono"
            >
              {formatFlops(t)}
            </text>
          </g>
        ))}

        {/* axis labels */}
        <text
          x={(PAD_L + WIDTH - PAD_R) / 2}
          y={HEIGHT - 8}
          textAnchor="middle"
          fontSize={12}
          fill={COLOR.muted}
          className="font-mono"
        >
          arithmetic intensity — FLOPs / byte
        </text>
        <text
          x={16}
          y={(PAD_T + HEIGHT - PAD_B) / 2}
          textAnchor="middle"
          fontSize={12}
          fill={COLOR.muted}
          className="font-mono"
          transform={`rotate(-90 16 ${(PAD_T + HEIGHT - PAD_B) / 2})`}
        >
          attainable — FLOP/s
        </text>

        {/* ridge line */}
        <line
          x1={x(ridge)}
          y1={PAD_T}
          x2={x(ridge)}
          y2={HEIGHT - PAD_B}
          stroke={withAlpha(COLOR.hwAccent, 0.7)}
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
        <text
          x={x(ridge) + 6}
          y={PAD_T + 12}
          textAnchor="start"
          fontSize={12}
          fill={COLOR.hwAccent}
          className="font-mono"
        >
          ridge {formatAi(ridge)}
        </text>

        {/* the two roofs */}
        <path
          d={roofPath}
          fill="none"
          stroke={COLOR.hwAccent}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* prefill operating point (static, compute-bound) */}
        <OperatingPoint
          px={x(prefillAi)}
          py={y(prefillFlops)}
          color={COLOR.active}
          label="prefill"
          sublabel="compute-bound"
          baseY={HEIGHT - PAD_B}
        />

        {/* decode operating point (slides with batch) */}
        <g
          style={{ transition: pointTransition }}
          transform={`translate(${x(decodeAi)} ${y(decodeFlops)})`}
        >
          {/* drop line to x-axis */}
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={HEIGHT - PAD_B - y(decodeFlops)}
            stroke={withAlpha(decodeColor, 0.5)}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <circle r={7} fill={decodeColor} stroke={COLOR.ink} strokeWidth={1.5} />
          <text
            x={0}
            y={-14}
            textAnchor="middle"
            fontSize={12}
            fill={decodeColor}
            className="font-mono"
            fontWeight={600}
          >
            decode ×{batch}
          </text>
        </g>
      </svg>

      {/* batch slider */}
      <div className="flex flex-col gap-2">
        <label htmlFor={batchId} className="flex items-baseline justify-between text-xs text-muted">
          <span>Decode batch size</span>
          <span className="font-mono tabular-nums" style={{ color: COLOR.ink }}>
            {batch} {batch === 1 ? 'sequence' : 'sequences'}
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
          className="w-full accent-current"
          style={{ color: decodeColor }}
          aria-valuetext={`batch ${batch}, arithmetic intensity ${formatAi(decodeAi)} FLOPs per byte, ${
            decodeMemBound ? 'memory-bound' : 'compute-bound'
          }`}
        />
      </div>

      {/* readouts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Readout
          label="Arithmetic intensity"
          value={`${formatAi(decodeAi)} F/B`}
          color={COLOR.ink}
        />
        <Readout label="Attainable" value={formatFlops(decodeFlops)} color={COLOR.ink} />
        <Readout
          label="Bottleneck"
          value={decodeMemBound ? 'memory-bound' : 'compute-bound'}
          color={decodeMemBound ? COLOR.muted : COLOR.active}
        />
      </div>

      {/* legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <Swatch color={COLOR.hwAccent} label="roofline (memory + compute roofs)" />
        <Swatch color={COLOR.active} label="prefill — compute-bound" />
        <Swatch color={COLOR.inert} label="decode — memory-bound at low batch" />
      </div>

      <p className="font-mono text-xs leading-relaxed text-faint">
        Decode reuses each loaded weight for just one token per sequence, so batch 1 sits at ~1
        FLOP/byte — starved for bandwidth. Bigger batches amortise the same weight load over more
        tokens, sliding decode up the memory roof toward the ridge, where the compute roof takes
        over.
      </p>
    </section>
  );
}

/** A labeled static operating point with a faint drop line to the x-axis. */
function OperatingPoint({
  px,
  py,
  color,
  label,
  sublabel,
  baseY,
}: {
  px: number;
  py: number;
  color: string;
  label: string;
  sublabel: string;
  baseY: number;
}) {
  return (
    <g>
      <line
        x1={px}
        y1={py}
        x2={px}
        y2={baseY}
        stroke={withAlpha(color, 0.4)}
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <circle cx={px} cy={py} r={6} fill={color} stroke={COLOR.ink} strokeWidth={1.5} />
      <text
        x={px}
        y={py - 22}
        textAnchor="middle"
        fontSize={12}
        fill={color}
        className="font-mono"
        fontWeight={600}
      >
        {label}
      </text>
      <text
        x={px}
        y={py - 10}
        textAnchor="middle"
        fontSize={12}
        fill={COLOR.faint}
        className="font-mono"
      >
        {sublabel}
      </text>
    </g>
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

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-sm"
        style={{ backgroundColor: withAlpha(color, 0.9) }}
      />
      {label}
    </span>
  );
}

/** Format an arithmetic intensity (FLOPs/byte) compactly. */
function formatAi(ai: number): string {
  if (ai >= 1000) return `${(ai / 1000).toFixed(1)}k`;
  if (ai >= 100) return ai.toFixed(0);
  if (ai >= 10) return ai.toFixed(0);
  if (ai >= 1) return ai.toFixed(0);
  return ai.toFixed(2);
}

/** Format a throughput in FLOP/s as TFLOP/s or PFLOP/s. */
function formatFlops(f: number): string {
  if (f >= 1e15) return `${(f / 1e15).toFixed(f / 1e15 >= 10 ? 0 : 2)} PFLOP/s`;
  if (f >= 1e12) return `${(f / 1e12).toFixed(f / 1e12 >= 100 ? 0 : 0)} TFLOP/s`;
  if (f >= 1e9) return `${(f / 1e9).toFixed(0)} GFLOP/s`;
  return `${f.toExponential(1)} FLOP/s`;
}

export default Roofline;
