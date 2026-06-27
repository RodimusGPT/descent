import { COLOR, weightToColor, withAlpha } from '@/lib/encoding';
import { FORMATS } from '@/lib/float';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import {
  HIGHLIGHT,
  HIGHLIGHT_VALUE,
  LAYER_COUNT,
  LAYER_MATRICES,
  SAMPLE_MATRIX,
  ZOOM_LEVELS,
  type ZoomLevel,
  highlightBits,
  matrixExtent,
  normalize,
} from '@/lib/zoom';
import { useId, useMemo, useState } from 'react';

/**
 * ZoomToWeight (spec 10.2) — the opening "it is all just numbers" visual.
 *
 * A stepped zoom that drills from the whole model down to a single floating-point
 * weight: model → layer → matrix → weight. A breadcrumb tracks the path and
 * "Zoom in" / "Zoom out" buttons move between levels. The matrix level renders
 * the deterministic SAMPLE_MATRIX as a colored grid; the weight level blows up
 * one highlighted cell into its value and FP16 bit pattern.
 *
 * Reduced motion: levels swap discretely (no continuous zoom tween).
 *
 * Self-contained: renders with zero required props.
 */

const VIEW = 360;
const LAYER_HIGHLIGHT = 4; // which layer block we "enter" from the model stack
const MATRIX_TARGET = 0; // the Q matrix is the one we drill into

export interface ZoomToWeightProps {
  /** Initial zoom level index (0 = model … 3 = weight). */
  initialLevel?: number;
}

export function ZoomToWeight({ initialLevel = 0 }: ZoomToWeightProps) {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(ZOOM_LEVELS.length - 1, Math.trunc(initialLevel))),
  );
  const baseId = useId();

  const level = ZOOM_LEVELS[index];
  const atStart = index === 0;
  const atEnd = index === ZOOM_LEVELS.length - 1;

  const zoomIn = () => setIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1));
  const zoomOut = () => setIndex((i) => Math.max(0, i - 1));

  const { min, max } = useMemo(() => matrixExtent(SAMPLE_MATRIX), []);

  const swap = reduced ? undefined : 'opacity 240ms ease';

  return (
    <div className="flex w-full max-w-[760px] flex-col gap-4 rounded-lg border border-border bg-surface p-4 text-ink">
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-sm text-ink">It is all just numbers</h3>
        <p className="text-xs text-muted">
          A model is billions of numbers in matrices. Zoom in until a single weight is just one
          float.
        </p>
      </div>

      {/* Breadcrumb */}
      <nav aria-label="Zoom path">
        <ol className="flex flex-wrap items-center gap-1 font-mono text-xs">
          {ZOOM_LEVELS.map((l, i) => {
            const reached = i <= index;
            const current = i === index;
            return (
              <li key={l.id} className="flex items-center gap-1">
                {i > 0 && (
                  <span aria-hidden className="text-faint">
                    ›
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-current={current ? 'step' : undefined}
                  className="rounded px-1.5 py-0.5 transition-colors "
                  style={{
                    color: current ? COLOR.active : reached ? COLOR.ink : COLOR.faint,
                    backgroundColor: current ? withAlpha(COLOR.active, 0.16) : 'transparent',
                  }}
                >
                  {l.label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Stage */}
      <div
        className="relative flex items-center justify-center rounded-md border border-border bg-surface-raised"
        style={{ minHeight: VIEW + 40 }}
      >
        <svg
          key={reduced ? undefined : level.id}
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          className="h-auto w-full max-w-[360px]"
          role="img"
          aria-label={`${level.label} view — ${level.note}`}
          style={swap ? { transition: swap } : undefined}
        >
          {level.id === 'model' && <ModelStage />}
          {level.id === 'layer' && <LayerStage />}
          {level.id === 'matrix' && <MatrixStage min={min} max={max} />}
          {level.id === 'weight' && <WeightStage idPrefix={baseId} />}
        </svg>
      </div>

      {/* Note */}
      <p className="min-h-[2.5rem] text-sm text-muted" aria-live="polite">
        {level.note}
      </p>

      {/* Controls */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={zoomOut}
          disabled={atStart}
          className="rounded-md border border-border px-3 py-1.5 font-mono text-sm text-ink transition-colors disabled:opacity-40"
        >
          ← Zoom out
        </button>
        <span className="font-mono text-xs text-faint">
          {index + 1} / {ZOOM_LEVELS.length}
        </span>
        <button
          type="button"
          onClick={zoomIn}
          disabled={atEnd}
          className="rounded-md border px-3 py-1.5 font-mono text-sm transition-colors disabled:opacity-40"
          style={{
            borderColor: atEnd ? COLOR.border : COLOR.active,
            color: atEnd ? COLOR.muted : COLOR.active,
            backgroundColor: atEnd ? 'transparent' : withAlpha(COLOR.active, 0.14),
          }}
        >
          Zoom in →
        </button>
      </div>
    </div>
  );
}

/** Level 1 — a tall stack of layer blocks; one is marked as the next target. */
function ModelStage() {
  const blockH = (VIEW - 40) / LAYER_COUNT;
  const w = VIEW * 0.46;
  const x = (VIEW - w) / 2;
  return (
    <g>
      {Array.from({ length: LAYER_COUNT }, (_, i) => {
        const y = 20 + i * blockH;
        const target = i === LAYER_HIGHLIGHT;
        return (
          <rect
            key={i}
            x={x}
            y={y + 1}
            width={w}
            height={blockH - 2}
            rx={3}
            fill={target ? withAlpha(COLOR.modelAccent, 0.32) : withAlpha(COLOR.inert, 0.22)}
            stroke={target ? COLOR.modelAccent : COLOR.border}
            strokeWidth={target ? 1.6 : 1}
          />
        );
      })}
      <text
        x={VIEW / 2}
        y={12}
        textAnchor="middle"
        fontSize={11}
        fontFamily="monospace"
        fill={COLOR.muted}
      >
        {LAYER_COUNT} layers
      </text>
    </g>
  );
}

/** Level 2 — one layer's weight matrices (Q / K / V / FFN boxes). */
function LayerStage() {
  const cols = 2;
  const gap = 18;
  const pad = 36;
  const cell = (VIEW - pad * 2 - gap) / cols;
  return (
    <g>
      {LAYER_MATRICES.map((m, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = pad + c * (cell + gap);
        const y = pad + r * (cell + gap);
        const target = i === MATRIX_TARGET;
        return (
          <g key={m.key}>
            <rect
              x={x}
              y={y}
              width={cell}
              height={cell}
              rx={6}
              fill={target ? withAlpha(COLOR.active, 0.2) : withAlpha(COLOR.inert, 0.16)}
              stroke={target ? COLOR.active : COLOR.border}
              strokeWidth={target ? 1.8 : 1}
            />
            <text
              x={x + cell / 2}
              y={y + cell / 2 + 5}
              textAnchor="middle"
              fontSize={18}
              fontFamily="monospace"
              fill={target ? COLOR.active : COLOR.muted}
            >
              {m.label}
            </text>
          </g>
        );
      })}
      <text
        x={VIEW / 2}
        y={20}
        textAnchor="middle"
        fontSize={11}
        fontFamily="monospace"
        fill={COLOR.muted}
      >
        weight matrices in one layer
      </text>
    </g>
  );
}

/** Level 3 — the SAMPLE_MATRIX as a grid of cells colored by normalized value. */
function MatrixStage({ min, max }: { min: number; max: number }) {
  const rows = SAMPLE_MATRIX.length;
  const cols = SAMPLE_MATRIX[0].length;
  const pad = 24;
  const grid = VIEW - pad * 2;
  const cw = grid / cols;
  const ch = grid / rows;
  return (
    <g>
      {SAMPLE_MATRIX.map((row, r) =>
        row.map((v, c) => {
          const target = r === HIGHLIGHT.row && c === HIGHLIGHT.col;
          const t = normalize(v, min, max);
          return (
            <rect
              key={`${r}-${c}`}
              x={pad + c * cw + 0.5}
              y={pad + r * ch + 0.5}
              width={cw - 1}
              height={ch - 1}
              rx={2}
              fill={withAlpha(weightToColor(t), 0.85)}
              stroke={target ? COLOR.ink : 'transparent'}
              strokeWidth={target ? 2 : 0}
            />
          );
        }),
      )}
      <text
        x={VIEW / 2}
        y={16}
        textAnchor="middle"
        fontSize={11}
        fontFamily="monospace"
        fill={COLOR.muted}
      >
        {rows}×{cols} weights — one cell is outlined
      </text>
    </g>
  );
}

/** Level 4 — the single highlighted float, big, with its FP16 bit pattern. */
function WeightStage({ idPrefix }: { idPrefix: string }) {
  const fmt = FORMATS.fp16;
  const { sign, exponent, mantissa } = highlightBits(HIGHLIGHT_VALUE, fmt);
  const groups: { label: string; bits: number[]; color: string }[] = [
    { label: 'sign', bits: sign, color: COLOR.activeHot },
    { label: 'exponent', bits: exponent, color: COLOR.modelAccent },
    { label: 'mantissa', bits: mantissa, color: COLOR.hwAccent },
  ];
  const all = [...sign, ...exponent, ...mantissa];
  const cellW = (VIEW - 32) / all.length;

  return (
    <g>
      <text
        x={VIEW / 2}
        y={48}
        textAnchor="middle"
        fontSize={11}
        fontFamily="monospace"
        fill={COLOR.muted}
      >
        one weight ({fmt.label})
      </text>
      <text
        x={VIEW / 2}
        y={130}
        textAnchor="middle"
        fontSize={46}
        fontFamily="monospace"
        fill={COLOR.active}
      >
        {HIGHLIGHT_VALUE.toFixed(5)}
      </text>

      {/* bit cells */}
      {all.map((bit, i) => {
        const inSign = i < sign.length;
        const inExp = i >= sign.length && i < sign.length + exponent.length;
        const color = inSign ? COLOR.activeHot : inExp ? COLOR.modelAccent : COLOR.hwAccent;
        const x = 16 + i * cellW;
        return (
          <g key={`${idPrefix}-bit-${i}`}>
            <rect
              x={x + 0.5}
              y={180}
              width={cellW - 1}
              height={28}
              rx={2}
              fill={bit ? withAlpha(color, 0.85) : withAlpha(COLOR.inert, 0.18)}
              stroke={withAlpha(color, 0.6)}
              strokeWidth={0.75}
            />
            <text
              x={x + cellW / 2}
              y={199}
              textAnchor="middle"
              fontSize={11}
              fontFamily="monospace"
              fill={bit ? COLOR.ink : COLOR.faint}
            >
              {bit}
            </text>
          </g>
        );
      })}

      {/* group labels */}
      {(() => {
        let offset = 0;
        return groups.map((g) => {
          const start = 16 + offset * cellW;
          const width = g.bits.length * cellW;
          offset += g.bits.length;
          return (
            <text
              key={g.label}
              x={start + width / 2}
              y={228}
              textAnchor="middle"
              fontSize={10}
              fontFamily="monospace"
              fill={g.color}
            >
              {g.label}
            </text>
          );
        });
      })()}
    </g>
  );
}

export default ZoomToWeight;
