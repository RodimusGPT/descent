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
import { useId, useMemo, useState } from 'react';

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
          {PRECISIONS.map((p) => {
            const active = p.key === precision;
            return (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPrecision(p.key)}
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

      {/* Param-count selector — real radio group */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs text-muted" id={paramGroupId}>
          Model size
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={paramGroupId}>
          {PARAM_PRESETS.map((preset) => {
            const active = preset.params === params;
            return (
              <button
                key={preset.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setParams(preset.params)}
                className="rounded-md border px-3 py-1 font-mono text-sm transition-colors "
                style={{
                  borderColor: active ? COLOR.modelAccent : COLOR.border,
                  backgroundColor: active ? withAlpha(COLOR.modelAccent, 0.18) : 'transparent',
                  color: active ? COLOR.modelAccent : COLOR.muted,
                }}
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
