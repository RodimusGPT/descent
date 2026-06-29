import { MODEL_OPTIONS } from '@/lib/config';
import { BATCH_STEPS, GPU_COSTS, costAtBatch, decodeThroughputBatched } from '@/lib/cost';
import { COLOR, withAlpha } from '@/lib/encoding';
import { moveRadioFocus } from '@/lib/roving';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { type KeyboardEvent, useId, useMemo, useState } from 'react';

/**
 * CostModel — what a token costs, and why batching is the lever (Part 5).
 *
 * Cost per token = the GPU's price per hour ÷ the tokens it produces. Pick a GPU
 * and a model; the bars show cost per million tokens at rising batch sizes. One
 * stream leaves the GPU idle (memory-bound) and is dear; batch many and each
 * weight read serves them all, so cost collapses ~1/batch — until the compute
 * roof (the roofline ridge), where the bars stop shrinking. Best-case arithmetic
 * at FP8; the shape, not the absolute, is the lesson.
 *
 * Two radiogroups (GPU, model) via the shared moveRadioFocus; aria-live results;
 * reduced-motion safe. Self-contained: renders with zero required props.
 */

function fmtCost(c: number): string {
  if (!Number.isFinite(c)) return '—';
  if (c >= 10) return `$${Math.round(c)}`;
  if (c >= 1) return `$${c.toFixed(2)}`;
  return `$${c.toFixed(3)}`;
}

function fmtTok(t: number): string {
  if (t >= 1000) return `${(t / 1000).toFixed(1)}k`;
  return t >= 10 ? Math.round(t).toString() : t.toFixed(1);
}

export function CostModel() {
  const reduced = usePrefersReducedMotion();
  const baseId = useId();
  const gpuGroupId = `${baseId}-gpu`;
  const modelGroupId = `${baseId}-model`;
  const barsId = `${baseId}-bars`;

  const [gpuIndex, setGpuIndex] = useState(1); // H100
  const [modelIndex, setModelIndex] = useState(1); // 70B dense

  const gpu = GPU_COSTS[Math.min(gpuIndex, GPU_COSTS.length - 1)];
  const model = MODEL_OPTIONS[Math.min(modelIndex, MODEL_OPTIONS.length - 1)];

  const rows = useMemo(
    () =>
      BATCH_STEPS.map((batch) => ({
        batch,
        tok: decodeThroughputBatched(model.activeParamsB, gpu, batch),
        cost: costAtBatch(model.activeParamsB, gpu, batch),
      })),
    [model.activeParamsB, gpu],
  );

  // Cost spans orders of magnitude, so length is log-scaled (longer = dearer).
  const maxCost = rows[0].cost;
  const minCost = rows[rows.length - 1].cost;
  const logSpan = Math.log(maxCost) - Math.log(minCost) || 1;
  const barFrac = (cost: number) => 0.06 + 0.94 * ((Math.log(cost) - Math.log(minCost)) / logSpan);

  const dearest = rows[0];
  const cheapest = rows[rows.length - 1];
  const drop = cheapest.cost > 0 ? dearest.cost / cheapest.cost : 0;

  const accent = COLOR.active;
  const barTransition = reduced ? undefined : 'width 320ms ease';

  const radio = (
    on: boolean,
    onClick: () => void,
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void,
    label: string,
    key: string,
  ) => (
    <button
      key={key}
      type="button"
      role="radio"
      aria-checked={on}
      aria-controls={barsId}
      tabIndex={on ? 0 : -1}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className="rounded-md border px-3 py-1 font-mono text-xs transition-colors"
      style={{
        borderColor: on ? accent : COLOR.border,
        backgroundColor: on ? withAlpha(accent, 0.18) : 'transparent',
        color: on ? COLOR.ink : COLOR.muted,
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="flex w-full max-w-[900px] flex-col gap-4 rounded-lg border border-border bg-surface p-4 text-ink">
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-sm text-ink">What a token costs</h3>
        <p className="text-xs text-muted">
          Cost per token ={' '}
          <span style={{ color: accent }}>GPU price per hour ÷ tokens produced</span>. The lever is
          batching — pack more sequences in and each weight read is shared, so cost collapses.
        </p>
      </div>

      {/* GPU selector */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs text-muted" id={gpuGroupId}>
          GPU (illustrative $/hr)
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={gpuGroupId}>
          {GPU_COSTS.map((g, i) =>
            radio(
              i === gpuIndex,
              () => setGpuIndex(i),
              (e) => moveRadioFocus(e, i, GPU_COSTS.length, setGpuIndex),
              `${g.name} · $${g.costPerHour}/hr`,
              g.name,
            ),
          )}
        </div>
      </fieldset>

      {/* Model selector */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs text-muted" id={modelGroupId}>
          Model (weights at FP8)
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={modelGroupId}>
          {MODEL_OPTIONS.map((m, i) =>
            radio(
              i === modelIndex,
              () => setModelIndex(i),
              (e) => moveRadioFocus(e, i, MODEL_OPTIONS.length, setModelIndex),
              m.name,
              m.name,
            ),
          )}
        </div>
      </fieldset>

      {/* Cost-per-million-tokens bars across batch sizes */}
      <ul
        id={barsId}
        aria-live="polite"
        aria-label={`Cost per million tokens for ${model.name} on ${gpu.name} across batch sizes`}
        className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-raised p-3"
      >
        {rows.map((r) => (
          <li key={r.batch} className="flex items-center gap-3">
            <span className="w-20 shrink-0 font-mono text-xs text-muted">batch {r.batch}</span>
            <div
              className="h-3 flex-1 overflow-hidden rounded-full"
              style={{ backgroundColor: withAlpha(COLOR.muted, 0.14) }}
              role="meter"
              aria-valuemin={0}
              aria-valuemax={Math.round(maxCost * 1000)}
              aria-valuenow={Math.round(r.cost * 1000)}
              aria-label={`batch ${r.batch}: ${fmtCost(r.cost)} per million tokens`}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${barFrac(r.cost) * 100}%`,
                  backgroundColor: withAlpha(accent, 0.9),
                  transition: barTransition,
                }}
              />
            </div>
            <span className="flex w-32 shrink-0 items-baseline justify-end gap-1 font-mono text-xs tabular-nums">
              <span className="text-ink">{fmtCost(r.cost)}</span>
              <span className="text-faint">/Mtok</span>
              <span className="ml-1 text-faint">{fmtTok(r.tok)} tok/s</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="text-xs text-faint">
        Batching {model.name} on {gpu.name} takes it from {fmtCost(dearest.cost)} per million tokens
        at batch 1 to {fmtCost(cheapest.cost)} batched —{' '}
        <span className="text-muted">~{Math.round(drop)}× cheaper</span> — until the compute roof,
        where the last bars stop shrinking. (Real batch is also capped by KV-cache memory.)
        Best-case arithmetic at FP8; real utilization is lower, so real prices run higher.
        Illustrative, ~2026.
      </p>
    </div>
  );
}

export default CostModel;
