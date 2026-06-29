import {
  ACCELERATORS,
  SRAM_OUTLIERS,
  bytesPerToken,
  decodeTokPerSec,
  fitsInMemory,
} from '@/lib/accelerators';
import { COLOR, withAlpha } from '@/lib/encoding';
import { moveRadioFocus } from '@/lib/roving';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { scaleLinear } from 'd3-scale';
import { type CSSProperties, useId, useMemo, useState } from 'react';

/**
 * AcceleratorLandscape (Part 4) — today's inference accelerators plotted on the
 * two specs that decide everything:
 *   x = memory CAPACITY (GB)  — does the model fit?
 *   y = memory BANDWIDTH (TB/s) — how fast does it decode?
 *
 * The site's law: decode tok/s ≈ bandwidth ÷ bytes-read-per-token. Capacity gates
 * whether a model loads at all; bandwidth sets the decode ceiling once it does.
 * Pick a chip to read its specs against a fixed reference workload — a 70B model.
 *
 * The SVG is a non-interactive role="img" picture; selection lives in the HTML
 * radiogroup below it, so there is no nested-interactive control. Numbers are
 * illustrative public specs (~2026), not benchmarks.
 *
 * Self-contained: renders with zero required props.
 */

const WIDTH = 760;
const HEIGHT = 420;
const PAD_L = 56;
const PAD_R = 72;
const PAD_T = 24;
const PAD_B = 48;

/** Plot domains. Capacity tops out near the biggest unified-memory parts. */
const MEM_MAX = 300;
const BW_MAX = 8.5;

/** The fixed reference workload the readout teaches against. */
const REF_PARAMS_B = 70; // a 70B model

/** Weight precision for the reference model — sets bytes per parameter. */
const PRECISIONS = [
  { key: 'FP16', label: 'FP16', bytesPerParam: 2 },
  { key: 'FP8', label: 'FP8', bytesPerParam: 1 },
  { key: 'FP4', label: 'FP4', bytesPerParam: 0.5 },
] as const;
/** Default to FP8 — the reference "70B ≈ 70 GB of weights". */
const DEFAULT_PREC_INDEX = 1;

/**
 * Hand-placed label offsets so the dot labels read without heavy overlap. The
 * landscape is a fixed dataset, so fixed offsets are the clearest tool: parts that
 * cluster (H200/Trainium3) or sit dead-on top of each other (MI355X/B300, both
 * 288 GB @ 8 TB/s) get pulled apart, and parts near the right edge label leftward.
 */
const LABEL_OFFSET: Record<string, { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' }> =
  {
    'M3 Ultra': { dx: 0, dy: -12, anchor: 'middle' },
    'RTX 5090': { dx: 10, dy: 4, anchor: 'start' },
    H100: { dx: 10, dy: 4, anchor: 'start' },
    H200: { dx: -10, dy: -7, anchor: 'end' },
    Trainium3: { dx: 10, dy: 12, anchor: 'start' },
    MI300X: { dx: 10, dy: 4, anchor: 'start' },
    'TPU v7': { dx: 10, dy: 4, anchor: 'start' },
    B200: { dx: -10, dy: -7, anchor: 'end' },
    MI355X: { dx: -10, dy: -7, anchor: 'end' },
    B300: { dx: -10, dy: 15, anchor: 'end' },
  };

/**
 * Selected-state styling for the radio pills — a teal/amber tint, a colored border
 * doubled by an inset ring, and a brightened/bolder label. Mirrors the site's other
 * chip groups (QuantizationSlider). Active label uses ink, not the accent, so it
 * clears AA against its own tint.
 */
function pillStyle(active: boolean, accent: string): CSSProperties {
  return {
    borderColor: active ? accent : COLOR.border,
    backgroundColor: active ? withAlpha(accent, 0.22) : 'transparent',
    color: active ? COLOR.ink : COLOR.muted,
    boxShadow: active ? `inset 0 0 0 1px ${accent}` : undefined,
    fontWeight: active ? 600 : 400,
  };
}

export function AcceleratorLandscape() {
  const reduced = usePrefersReducedMotion();
  const baseId = useId();
  const chipGroupId = `${baseId}-chip`;
  const precGroupId = `${baseId}-prec`;

  const [selectedIndex, setSelectedIndex] = useState(2); // H100 — the workhorse baseline
  const [precIndex, setPrecIndex] = useState(DEFAULT_PREC_INDEX);

  const sel = ACCELERATORS[selectedIndex];
  const prec = PRECISIONS[precIndex];

  // Scales.
  const xScale = useMemo(
    () =>
      scaleLinear()
        .domain([0, MEM_MAX])
        .range([PAD_L, WIDTH - PAD_R]),
    [],
  );
  const yScale = useMemo(
    () =>
      scaleLinear()
        .domain([0, BW_MAX])
        .range([HEIGHT - PAD_B, PAD_T]),
    [],
  );

  // Reference-workload derivations against the selected chip.
  const weightGB = REF_PARAMS_B * prec.bytesPerParam;
  const fits = fitsInMemory(weightGB, sel.memGB);
  const bpt = bytesPerToken(REF_PARAMS_B, prec.bytesPerParam);
  const ceiling = Math.round(decodeTokPerSec(sel.bandwidthTBs, bpt));

  // Draw the selected dot last so its warm ring sits on top of any overlapping part.
  const renderOrder = useMemo(() => {
    const idx = ACCELERATORS.map((_, i) => i).filter((i) => i !== selectedIndex);
    idx.push(selectedIndex);
    return idx;
  }, [selectedIndex]);

  const xTicks = [0, 100, 200, 300] as const;
  const yTicks = [0, 2, 4, 6, 8] as const;

  const dotTransition = reduced ? undefined : 'r 180ms ease, fill 180ms ease, opacity 180ms ease';

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 text-ink">
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-sm text-ink">The accelerator landscape</h3>
        <p className="text-xs text-muted">
          Two specs decide everything — capacity (x) says whether a model fits; bandwidth (y) sets
          the decode ceiling, since tok/s ≈ bandwidth ÷ bytes read per token.
        </p>
      </div>

      {/* Capacity × bandwidth scatter */}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Scatter of inference accelerators: memory capacity in gigabytes on the x-axis (0 to ${MEM_MAX}) versus memory bandwidth in terabytes per second on the y-axis (0 to ${BW_MAX}). ${ACCELERATORS.length} parts plotted, from the Apple M3 Ultra at ${ACCELERATORS[0].memGB} GB and ${ACCELERATORS[0].bandwidthTBs} TB/s up to Blackwell and CDNA4 parts near 288 GB and 8 TB/s. ${sel.name} is selected at ${sel.memGB} GB and ${sel.bandwidthTBs} TB/s.`}
      >
        {/* grid + axis ticks */}
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line
              x1={xScale(t)}
              y1={PAD_T}
              x2={xScale(t)}
              y2={HEIGHT - PAD_B}
              stroke={withAlpha(COLOR.border, 0.6)}
              strokeWidth={1}
            />
            <text
              x={xScale(t)}
              y={HEIGHT - PAD_B + 16}
              textAnchor="middle"
              fontSize={10}
              fill={COLOR.faint}
              className="font-mono"
            >
              {t}
            </text>
          </g>
        ))}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line
              x1={PAD_L}
              y1={yScale(t)}
              x2={WIDTH - PAD_R}
              y2={yScale(t)}
              stroke={withAlpha(COLOR.border, 0.6)}
              strokeWidth={1}
            />
            <text
              x={PAD_L - 8}
              y={yScale(t) + 3}
              textAnchor="end"
              fontSize={10}
              fill={COLOR.faint}
              className="font-mono"
            >
              {t}
            </text>
          </g>
        ))}

        {/* axis labels */}
        <text
          x={(PAD_L + WIDTH - PAD_R) / 2}
          y={HEIGHT - 8}
          textAnchor="middle"
          fontSize={11}
          fill={COLOR.muted}
          className="font-mono"
        >
          memory capacity — GB
        </text>
        <text
          x={16}
          y={(PAD_T + HEIGHT - PAD_B) / 2}
          textAnchor="middle"
          fontSize={11}
          fill={COLOR.muted}
          className="font-mono"
          transform={`rotate(-90 16 ${(PAD_T + HEIGHT - PAD_B) / 2})`}
        >
          memory bandwidth — TB/s
        </text>

        {/* dots + labels */}
        {renderOrder.map((i) => {
          const a = ACCELERATORS[i];
          const active = i === selectedIndex;
          const cx = xScale(a.memGB);
          const cy = yScale(a.bandwidthTBs);
          const off = LABEL_OFFSET[a.name] ?? { dx: 10, dy: 4, anchor: 'start' as const };
          return (
            <g key={a.name}>
              {active && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={11}
                  fill="none"
                  stroke={COLOR.active}
                  strokeWidth={2}
                  style={dotTransition ? { transition: dotTransition } : undefined}
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={active ? 7 : 5}
                fill={withAlpha(COLOR.hwAccent, active ? 1 : 0.85)}
                stroke={withAlpha(COLOR.ink, active ? 0.5 : 0.25)}
                strokeWidth={1}
                style={dotTransition ? { transition: dotTransition } : undefined}
              >
                <title>{`${a.name} — ${a.memGB} GB, ${a.bandwidthTBs} TB/s`}</title>
              </circle>
              <text
                x={cx + off.dx}
                y={cy + off.dy}
                textAnchor={off.anchor}
                fontSize={active ? 11 : 9}
                fontWeight={active ? 600 : 400}
                fill={active ? COLOR.active : COLOR.faint}
                className="font-mono"
              >
                {a.name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Accelerator selector — real radio group */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs text-muted" id={chipGroupId}>
          Accelerator
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={chipGroupId}>
          {ACCELERATORS.map((a, i) => {
            const active = i === selectedIndex;
            return (
              <button
                key={a.name}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setSelectedIndex(i)}
                onKeyDown={(e) => moveRadioFocus(e, i, ACCELERATORS.length, setSelectedIndex)}
                className="rounded-md border px-3 py-1 font-mono text-xs transition-colors"
                style={pillStyle(active, COLOR.hwAccent)}
              >
                {a.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Precision toggle for the reference workload — real radio group */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs text-muted" id={precGroupId}>
          Reference weights precision
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={precGroupId}>
          {PRECISIONS.map((p, i) => {
            const active = i === precIndex;
            return (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setPrecIndex(i)}
                onKeyDown={(e) => moveRadioFocus(e, i, PRECISIONS.length, setPrecIndex)}
                className="rounded-md border px-3 py-1 font-mono text-xs transition-colors"
                style={pillStyle(active, COLOR.active)}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Readout + teaching line — the detail panel that updates on selection */}
      <div className="flex flex-col gap-3">
        {/* Live region is the COMPACT stat grid only — selection-follows-focus would
            otherwise re-announce the whole teaching paragraph on every arrow key. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-live="polite">
          <div className="rounded-md border border-border bg-surface-raised p-3">
            <div className="text-xs text-muted">Vendor</div>
            <div className="font-mono text-base" style={{ color: COLOR.ink }}>
              {sel.vendor}
            </div>
            <div className="text-[0.7rem] text-faint">{sel.name}</div>
          </div>
          <div className="rounded-md border border-border bg-surface-raised p-3">
            <div className="text-xs text-muted">Capacity</div>
            <div className="font-mono text-lg tabular-nums" style={{ color: COLOR.hwAccent }}>
              {sel.memGB} GB
            </div>
            <div className="text-[0.7rem] text-faint">does it fit?</div>
          </div>
          <div className="rounded-md border border-border bg-surface-raised p-3">
            <div className="text-xs text-muted">Bandwidth</div>
            <div className="font-mono text-lg tabular-nums" style={{ color: COLOR.hwAccent }}>
              {sel.bandwidthTBs} TB/s
            </div>
            <div className="text-[0.7rem] text-faint">how fast it decodes</div>
          </div>
          <div className="rounded-md border border-border bg-surface-raised p-3">
            <div className="text-xs text-muted">Decode ceiling</div>
            <div
              className="font-mono text-lg tabular-nums"
              style={{ color: fits ? COLOR.active : COLOR.muted }}
            >
              ~{ceiling} tok/s
            </div>
            <div className="text-[0.7rem] text-faint">single stream</div>
          </div>
        </div>

        {/* Teaching line against the fixed reference workload */}
        <div className="rounded-md border border-border bg-surface-raised p-3 text-xs text-muted">
          <span className="font-mono text-ink">Reference</span> — a {REF_PARAMS_B}B model at{' '}
          {prec.label} ≈ {weightGB} GB of weights.{' '}
          {fits ? (
            <span>
              Fits — {weightGB} GB ≤ {sel.memGB} GB, so it loads on one {sel.name}, and bandwidth
              caps decode near <span className="font-mono text-ink">~{ceiling} tok/s</span>.
            </span>
          ) : (
            <span>
              Too big — {weightGB} GB &gt; {sel.memGB} GB, so a single {sel.name} can&apos;t hold
              it; you&apos;d shard across more chips before the{' '}
              <span className="font-mono text-ink">~{ceiling} tok/s</span> ceiling even applies.
            </span>
          )}
        </div>
      </div>

      {/* SRAM / wafer-scale outliers — a different bet, off this chart */}
      <div className="rounded-md border border-border bg-surface-raised p-3 text-xs text-muted">
        <div className="mb-1">
          A different bet, off this chart — SRAM, tiny memory, blistering single-stream speed:
        </div>
        <ul className="flex flex-col gap-1">
          {SRAM_OUTLIERS.map((o) => (
            <li key={o.name}>
              <span className="font-mono text-ink">{o.name}</span>{' '}
              <span className="text-faint">({o.vendor})</span> — {o.note}
            </li>
          ))}
        </ul>
      </div>

      <p className="font-mono text-[0.7rem] leading-relaxed text-faint">
        illustrative public specs, ~2026 — not benchmarks.
      </p>
    </div>
  );
}

export default AcceleratorLandscape;
