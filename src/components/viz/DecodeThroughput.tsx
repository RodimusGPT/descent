import { type ChipThroughput, DECODE_PRECISIONS, throughputAcrossChips } from '@/lib/accelerators';
import { MODEL_OPTIONS } from '@/lib/config';
import { COLOR, weightToColor, withAlpha } from '@/lib/encoding';
import { moveRadioFocus } from '@/lib/roving';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { type KeyboardEvent, useId, useMemo, useState } from 'react';

/**
 * DecodeThroughput — the bandwidth law, made concrete across the field (Part 4).
 *
 * Decode is memory-bound, so a chip's token rate is just bandwidth ÷ bytes read
 * per token. Pick a model and a precision; each accelerator gets a bar of its
 * decode ceiling, sorted fastest-first. Two lessons fall straight out: more
 * bandwidth → more tokens/sec, and an MoE (few active params) flies — though its
 * full weights still have to FIT, so chips it overflows are flagged "won't fit".
 *
 * The model and precision selectors are real radiogroups (shared moveRadioFocus).
 * Reduced-motion safe: the only animation is the bar-width tween, gated off.
 *
 * Self-contained: renders with zero required props.
 */

/** Round tokens/sec to a friendly integer (or one decimal when small). */
function fmtTok(t: number): string {
  return t >= 10 ? Math.round(t).toString() : t.toFixed(1);
}

export function DecodeThroughput() {
  const reduced = usePrefersReducedMotion();
  const baseId = useId();
  const modelGroupId = `${baseId}-model`;
  const precGroupId = `${baseId}-prec`;
  const barsId = `${baseId}-bars`;

  const [modelIndex, setModelIndex] = useState(1); // 70B dense — a telling spread
  const [precIndex, setPrecIndex] = useState(1); // FP8

  const model = MODEL_OPTIONS[Math.min(modelIndex, MODEL_OPTIONS.length - 1)];
  const prec = DECODE_PRECISIONS[Math.min(precIndex, DECODE_PRECISIONS.length - 1)];

  const rows = useMemo<ChipThroughput[]>(
    () => throughputAcrossChips(model.paramsB, model.activeParamsB, prec.bytesPerParam),
    [model.paramsB, model.activeParamsB, prec.bytesPerParam],
  );
  const maxTok = useMemo(() => Math.max(1e-9, ...rows.map((r) => r.tokPerSec)), [rows]);

  /** GB streamed per decoded token = active params × bytes/param. */
  const gbPerToken = model.activeParamsB * prec.bytesPerParam;

  const accent = COLOR.hwAccent;
  const barTransition = reduced ? undefined : 'width 320ms ease, background-color 320ms ease';

  return (
    <div className="flex w-full max-w-[900px] flex-col gap-4 rounded-lg border border-border bg-surface p-4 text-ink">
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-sm text-ink">Decode speed across the field</h3>
        <p className="text-xs text-muted">
          Decode is memory-bound:{' '}
          <span style={{ color: accent }}>tokens/sec ≈ bandwidth ÷ bytes</span> read per token. Pick
          a model and a precision — each bar is that chip's decode ceiling.
        </p>
      </div>

      {/* Model selector — a radiogroup */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs text-muted" id={modelGroupId}>
          Model
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={modelGroupId}>
          {MODEL_OPTIONS.map((m, i) => {
            const on = i === modelIndex;
            return (
              <button
                key={m.name}
                type="button"
                role="radio"
                aria-checked={on}
                aria-controls={barsId}
                tabIndex={on ? 0 : -1}
                onClick={() => setModelIndex(i)}
                onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) =>
                  moveRadioFocus(e, i, MODEL_OPTIONS.length, setModelIndex)
                }
                className="rounded-md border px-3 py-1 font-mono text-xs transition-colors"
                style={{
                  borderColor: on ? accent : COLOR.border,
                  backgroundColor: on ? withAlpha(accent, 0.18) : 'transparent',
                  color: on ? COLOR.ink : COLOR.muted,
                }}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Precision selector — a radiogroup */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs text-muted" id={precGroupId}>
          Weights precision
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={precGroupId}>
          {DECODE_PRECISIONS.map((p, i) => {
            const on = i === precIndex;
            return (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={on}
                aria-controls={barsId}
                tabIndex={on ? 0 : -1}
                onClick={() => setPrecIndex(i)}
                onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) =>
                  moveRadioFocus(e, i, DECODE_PRECISIONS.length, setPrecIndex)
                }
                className="rounded-md border px-3 py-1 font-mono text-xs transition-colors"
                style={{
                  borderColor: on ? accent : COLOR.border,
                  backgroundColor: on ? withAlpha(accent, 0.18) : 'transparent',
                  color: on ? COLOR.ink : COLOR.muted,
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Bars: one per accelerator, sorted fastest-first */}
      <ul
        id={barsId}
        aria-live="polite"
        aria-label={`Decode tokens per second for ${model.name} at ${prec.label}`}
        className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-raised p-3"
      >
        {rows.map((r) => {
          // Speed reads as warmth (fast = hot); a chip the model overflows is inert/grey.
          const frac = r.tokPerSec / maxTok;
          const color = r.fits ? weightToColor(0.2 + 0.8 * frac) : COLOR.inert;
          return (
            <li key={r.accel.name} className="flex items-center gap-3">
              <span
                className="w-24 shrink-0 truncate font-mono text-xs"
                style={{ color: r.fits ? COLOR.muted : COLOR.faint }}
                title={`${r.accel.name} — ${r.accel.memGB} GB, ${r.accel.bandwidthTBs} TB/s`}
              >
                {r.accel.name}
              </span>
              <div
                className="h-3 flex-1 overflow-hidden rounded-full"
                style={{ backgroundColor: withAlpha(COLOR.muted, 0.14) }}
                role="meter"
                aria-valuemin={0}
                aria-valuemax={Math.round(maxTok)}
                aria-valuenow={Math.round(r.tokPerSec)}
                aria-label={`${r.accel.name}: ${fmtTok(r.tokPerSec)} tokens per second${
                  r.fits ? '' : ', model does not fit'
                }`}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(1, frac * 100)}%`,
                    backgroundColor: withAlpha(color, r.fits ? 0.95 : 0.45),
                    transition: barTransition,
                  }}
                />
              </div>
              <span className="flex w-28 shrink-0 items-baseline justify-end gap-1 font-mono text-xs tabular-nums">
                <span style={{ color: r.fits ? COLOR.ink : COLOR.faint }}>
                  {fmtTok(r.tokPerSec)}
                </span>
                <span className="text-faint">tok/s</span>
                {!r.fits && (
                  <span
                    className="ml-1 rounded px-1 text-xs"
                    style={{
                      color: COLOR.activeHot,
                      backgroundColor: withAlpha(COLOR.activeHot, 0.14),
                    }}
                  >
                    won't fit
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-faint">
        {model.name} at {prec.label} streams ~{gbPerToken.toFixed(gbPerToken >= 10 ? 0 : 1)} GB per
        token. Grey bars are chips the full weights overflow — fast, but it won't load.
        Illustrative, ~2026 — not benchmarks.
      </p>
    </div>
  );
}

export default DecodeThroughput;
