import { COLOR, weightToColor, withAlpha } from '@/lib/encoding';
import {
  PARAM_PRESETS,
  PRECISIONS,
  type PrecisionKey,
  bucketHistogram,
  generateWeights,
  modelSizeBytes,
  qualityProxy,
  quantize,
} from '@/lib/quant';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import type { CSSProperties, KeyboardEvent } from 'react';
import { useId, useMemo, useRef, useState } from 'react';

/**
 * Selected-state styling for the radio pills — a filled tint, a colored border
 * doubled by an inset ring, and a brightened/bolder label make the active option
 * unmistakable. Mirrors FloatExploder's format toggle.
 */
function pillStyle(active: boolean, accent: string): CSSProperties {
  return {
    borderColor: active ? accent : COLOR.border,
    backgroundColor: active ? withAlpha(accent, 0.22) : 'transparent',
    color: active ? accent : COLOR.muted,
    boxShadow: active ? `inset 0 0 0 1px ${accent}` : undefined,
    fontWeight: active ? 600 : 400,
  };
}

/**
 * Roving-tabindex arrow-key navigation for a radio group: arrows (and Home/End)
 * move both selection and focus, wrapping at the ends. Only the selected option
 * is in the tab order.
 */
function handleRovingKey(
  e: KeyboardEvent<HTMLButtonElement>,
  index: number,
  length: number,
  refs: { current: (HTMLButtonElement | null)[] },
  select: (i: number) => void,
): void {
  let next = index;
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      next = (index + 1) % length;
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      next = (index - 1 + length) % length;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = length - 1;
      break;
    default:
      return;
  }
  e.preventDefault();
  select(next);
  refs.current[next]?.focus();
}

/**
 * QuantizationSlider (spec 9.3) — an interactive showing how dropping numeric
 * precision shrinks a model on disk while coarsening its weight distribution
 * into ever-fewer discrete levels. The histogram visibly STAIR-STEPS: as
 * precision falls, neighbouring bins collapse onto the nearest representable
 * value, so the smooth bell snaps into a few tall spikes.
 *
 * The quality readout is an ILLUSTRATIVE proxy derived from quantization error,
 * not a benchmark — it only conveys the precision/quality tradeoff.
 *
 * Self-contained: renders with zero required props.
 */

const BIN_COUNT = 48;
const WIDTH = 560;
const HEIGHT = 200;
const PAD = { top: 12, right: 12, bottom: 22, left: 12 };

export interface QuantizationSliderProps {
  /** Number of synthetic weights to sample. */
  sampleCount?: number;
  /** PRNG seed for the deterministic weight distribution. */
  seed?: number;
}

export function QuantizationSlider({
  sampleCount = 4096,
  seed = 0x9e3779b9,
}: QuantizationSliderProps) {
  const reduced = usePrefersReducedMotion();
  const [precision, setPrecision] = useState<PrecisionKey>('FP16');
  const [params, setParams] = useState<number>(PARAM_PRESETS[0].params);

  const baseId = useId();
  const precGroupId = `${baseId}-prec`;
  const paramGroupId = `${baseId}-param`;

  const precRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const paramRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const values = useMemo(() => generateWeights(sampleCount, seed), [sampleCount, seed]);

  const { quantized } = useMemo(() => quantize(values, precision), [values, precision]);

  // Histogram of the quantized values: as precision drops, counts pile onto the
  // few surviving levels, producing the stair-stepped spikes.
  const hist = useMemo(() => bucketHistogram(quantized, BIN_COUNT), [quantized]);
  const maxCount = useMemo(() => Math.max(1, ...hist), [hist]);

  const sizeGB = modelSizeBytes(params, precision) / 1e9;
  const quality = qualityProxy(values, precision);

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const barW = plotW / BIN_COUNT;

  // Reduced motion: snap (no CSS transition). Otherwise tween bar heights.
  const barTransition = reduced ? undefined : 'height 320ms ease, y 320ms ease, fill 320ms ease';

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 text-ink">
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-sm text-ink">Weight quantization</h3>
        <p className="text-xs text-muted">
          Lower precision snaps every weight onto a few discrete levels — smaller files, coarser
          values.
        </p>
      </div>

      {/* Histogram */}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Histogram of model weights quantized to ${precision}, showing ${
          new Set(quantized).size
        } distinct levels`}
      >
        {/* baseline */}
        <line
          x1={PAD.left}
          y1={PAD.top + plotH}
          x2={PAD.left + plotW}
          y2={PAD.top + plotH}
          stroke={COLOR.border}
          strokeWidth={1}
        />
        {hist.map((count, i) => {
          const h = (count / maxCount) * plotH;
          const x = PAD.left + i * barW;
          const y = PAD.top + plotH - h;
          // Encode bar energy: tall bins read hot (active), sparse bins cool (inert).
          const t = count / maxCount;
          const fill = count === 0 ? COLOR.inert : weightToColor(t);
          return (
            <rect
              key={i}
              x={x + 0.5}
              y={y}
              width={Math.max(0.5, barW - 1)}
              height={h}
              fill={withAlpha(fill, count === 0 ? 0.25 : 0.85)}
              style={barTransition ? { transition: barTransition } : undefined}
            />
          );
        })}
      </svg>

      {/* Precision selector — real radio group */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs text-muted" id={precGroupId}>
          Precision
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={precGroupId}>
          {PRECISIONS.map((p, i) => {
            const active = p.key === precision;
            return (
              <button
                key={p.key}
                ref={(el) => {
                  precRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setPrecision(p.key)}
                onKeyDown={(e) =>
                  handleRovingKey(e, i, PRECISIONS.length, precRefs, (n) =>
                    setPrecision(PRECISIONS[n].key),
                  )
                }
                className="rounded-md border px-3 py-1 font-mono text-sm transition-colors "
                style={pillStyle(active, COLOR.active)}
              >
                {p.label}
                <span className="ml-1 text-[0.7em]" style={{ opacity: active ? 0.85 : 0.7 }}>
                  {p.bits}b
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Param-count selector — real radio group */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs text-muted" id={paramGroupId}>
          Model size
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={paramGroupId}>
          {PARAM_PRESETS.map((preset, i) => {
            const active = preset.params === params;
            return (
              <button
                key={preset.key}
                ref={(el) => {
                  paramRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setParams(preset.params)}
                onKeyDown={(e) =>
                  handleRovingKey(e, i, PARAM_PRESETS.length, paramRefs, (n) =>
                    setParams(PARAM_PRESETS[n].params),
                  )
                }
                className="rounded-md border px-3 py-1 font-mono text-sm transition-colors "
                style={pillStyle(active, COLOR.modelAccent)}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Readouts */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border bg-surface-raised p-3">
          <div className="text-xs text-muted">On-disk size</div>
          <div className="font-mono text-lg tabular-nums" style={{ color: COLOR.active }}>
            {formatGB(sizeGB)} GB
          </div>
          <div className="text-[0.7rem] text-faint">
            {PRECISIONS.find((p) => p.key === precision)?.bytesPerParam} bytes / param
          </div>
        </div>
        <div className="rounded-md border border-border bg-surface-raised p-3">
          <div className="text-xs text-muted">Quality (illustrative)</div>
          <div
            className="font-mono text-lg tabular-nums"
            style={{ color: weightToColor(quality / 100) }}
          >
            {quality.toFixed(1)}
          </div>
          <div className="text-[0.7rem] text-faint">proxy — not a benchmark</div>
        </div>
      </div>
    </div>
  );
}

function formatGB(gb: number): string {
  if (gb >= 100) return gb.toFixed(0);
  if (gb >= 10) return gb.toFixed(1);
  return gb.toFixed(2);
}

export default QuantizationSlider;
