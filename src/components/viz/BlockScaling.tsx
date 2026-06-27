import {
  BLOCK_SIZE,
  generateVaryingSample,
  quantizePerBlock,
  quantizePerTensor,
} from '@/lib/blockscale';
import { COLOR, weightToColor, withAlpha } from '@/lib/encoding';
import { moveRadioFocus } from '@/lib/roving';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { useId, useMemo, useState } from 'react';

/**
 * BlockScaling (spec 10.2 / 9.3) — an illustration of why low-bit formats like
 * MXFP4 / NVFP4 share ONE scale per BLOCK of values rather than one scale for
 * the whole tensor. We lay an illustrative tensor out as a grid of blocks (4
 * blocks of 8 shown for legibility; real MXFP4 blocks hold 32 values), and let
 * the reader toggle between a single per-tensor scale and a per-block scale.
 *
 * Each cell is colored by its quantization ERROR (warm = more error). With one
 * global scale, the loudest block forces a coarse step everywhere, so the quiet
 * blocks light up with error; switching to per-block scales cools them down. The
 * error readout for each mode makes per-block's win explicit.
 *
 * Self-contained: renders with zero required props.
 */

const SHOWN_BLOCKS = 4;
const SHOWN_BLOCK_SIZE = 8;
const BITS = 4;

export interface BlockScalingProps {
  /** How many illustrative blocks to show. */
  blocks?: number;
  /** Values per shown block (illustrative; real MXFP4 uses 32). */
  blockSize?: number;
  /** PRNG seed for the deterministic varying-magnitude sample. */
  seed?: number;
}

type Mode = 'tensor' | 'block';

const MODES: { key: Mode; label: string }[] = [
  { key: 'tensor', label: 'One scale for the whole tensor' },
  { key: 'block', label: 'One scale per block' },
];

export function BlockScaling({
  blocks = SHOWN_BLOCKS,
  blockSize = SHOWN_BLOCK_SIZE,
  seed = 0x5eed1234,
}: BlockScalingProps) {
  const reduced = usePrefersReducedMotion();
  const [mode, setMode] = useState<Mode>('tensor');
  const baseId = useId();
  const modeGroupId = `${baseId}-mode`;

  const values = useMemo(
    () => generateVaryingSample(blocks, blockSize, seed),
    [blocks, blockSize, seed],
  );

  const perTensor = useMemo(() => quantizePerTensor(values, BITS), [values]);
  const perBlock = useMemo(() => quantizePerBlock(values, blockSize, BITS), [values, blockSize]);

  const active = mode === 'tensor' ? perTensor : perBlock;

  // Per-value absolute error, and a shared normalization so colors are
  // comparable across the two modes (the per-tensor max sets the hot end).
  const { perValueError, maxError } = useMemo(() => {
    const errs = values.map((v, i) => Math.abs(v - active.quantized[i]));
    // Normalize against the worst per-tensor error so switching modes visibly cools.
    let mx = 0;
    for (let i = 0; i < values.length; i++) {
      mx = Math.max(mx, Math.abs(values[i] - perTensor.quantized[i]));
    }
    return { perValueError: errs, maxError: mx || 1 };
  }, [values, active, perTensor]);

  const cellTransition = reduced ? undefined : 'fill 320ms ease';

  const fmt = (x: number) => x.toFixed(4);
  const winPct = perTensor.error > 0 ? (1 - perBlock.error / perTensor.error) * 100 : 0;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 text-ink">
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-sm text-ink">Block scaling (MXFP4 / NVFP4)</h3>
        <p className="text-xs text-muted">
          Low-bit formats give each <span className="text-ink">block</span> of values its own shared
          scale instead of one scale for the whole tensor. Cells are colored by quantization error —
          warmer means more error.
        </p>
      </div>

      {/* Mode selector — real radio group */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs text-muted" id={modeGroupId}>
          Scale granularity
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={modeGroupId}>
          {MODES.map((opt, i) => {
            const on = opt.key === mode;
            return (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => setMode(opt.key)}
                onKeyDown={(e) => moveRadioFocus(e, i, MODES.length, (n) => setMode(MODES[n].key))}
                className="rounded-md border px-3 py-1 font-mono text-xs transition-colors "
                style={{
                  borderColor: on ? COLOR.active : COLOR.border,
                  backgroundColor: on ? withAlpha(COLOR.active, 0.18) : 'transparent',
                  color: on ? COLOR.active : COLOR.muted,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Tensor grid: blocks of cells */}
      <div
        className="flex flex-col gap-2"
        role="img"
        aria-label={`Illustrative tensor of ${values.length} values in ${blocks} blocks, quantized to ${BITS} bits with ${
          mode === 'tensor' ? 'a single per-tensor scale' : 'one scale per block'
        }. Mean absolute error ${fmt(active.error)}.`}
      >
        {Array.from({ length: blocks }, (_, b) => {
          const start = b * blockSize;
          const scaleLabel = mode === 'tensor' ? perTensor.scale : (perBlock.scales[b] ?? 0);
          return (
            <div key={b} className="flex items-center gap-2">
              <div
                className="flex flex-1 gap-1 rounded-md border p-1"
                style={{
                  borderColor: mode === 'block' ? withAlpha(COLOR.modelAccent, 0.55) : COLOR.border,
                  backgroundColor: withAlpha(COLOR.modelAccent, mode === 'block' ? 0.06 : 0),
                }}
              >
                {Array.from({ length: blockSize }, (_, i) => {
                  const idx = start + i;
                  // Quantization error scaled to [0,1] across the shown values, so
                  // low error reads cool (inert) and high error reads hot (amber→coral)
                  // along the project's clean ramp — no muddy midband.
                  const normalizedError = perValueError[idx] / maxError;
                  return (
                    <div
                      key={i}
                      className="aspect-square flex-1 rounded-sm"
                      title={`value ${values[idx].toFixed(3)} · error ${perValueError[idx].toFixed(4)}`}
                      style={{
                        backgroundColor: weightToColor(normalizedError),
                        transition: cellTransition,
                      }}
                    />
                  );
                })}
              </div>
              <div className="w-28 shrink-0 text-right font-mono text-[0.65rem] text-faint tabular-nums">
                scale {scaleLabel.toExponential(1)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Error color legend — reads the cool→warm ramp used for the cells */}
      <div className="flex flex-col gap-1">
        <div
          className="h-2 w-full rounded-full"
          role="img"
          aria-label="Color scale: cool (low) to warm (high) quantization error"
          style={{
            background: `linear-gradient(to right, ${COLOR.inert}, ${COLOR.active}, ${COLOR.activeHot})`,
          }}
        />
        <div className="flex justify-between font-mono text-[0.65rem] text-muted">
          <span>low</span>
          <span aria-hidden="true">← error →</span>
          <span>high</span>
        </div>
      </div>

      <p className="text-[0.7rem] text-faint">
        Shown: {blocks} blocks of {blockSize} values. Real MXFP4 blocks hold {BLOCK_SIZE} values.
      </p>

      {/* Error readouts — both modes, so per-block's win is explicit */}
      <div className="grid grid-cols-2 gap-3">
        <ErrorCard
          label="Per-tensor error"
          value={fmt(perTensor.error)}
          highlight={mode === 'tensor'}
          accent={COLOR.active}
        />
        <ErrorCard
          label="Per-block error"
          value={fmt(perBlock.error)}
          highlight={mode === 'block'}
          accent={COLOR.modelAccent}
        />
      </div>

      <p className="text-xs text-muted">
        Block scaling cuts mean error by{' '}
        <span className="font-mono tabular-nums" style={{ color: COLOR.modelAccent }}>
          {winPct.toFixed(0)}%
        </span>{' '}
        here, because each block's scale tracks its own local magnitude instead of being dragged
        coarse by the loudest region of the tensor.
      </p>
    </div>
  );
}

function ErrorCard({
  label,
  value,
  highlight,
  accent,
}: {
  label: string;
  value: string;
  highlight: boolean;
  accent: string;
}) {
  return (
    <div
      className="rounded-md border bg-surface-raised p-3"
      style={{
        borderColor: highlight ? accent : COLOR.border,
        backgroundColor: highlight ? withAlpha(accent, 0.1) : undefined,
      }}
    >
      <div className="text-xs text-muted">{label}</div>
      <div className="font-mono text-lg tabular-nums" style={{ color: accent }}>
        {value}
      </div>
      <div className="text-[0.7rem] text-faint">mean abs error</div>
    </div>
  );
}

export default BlockScaling;
