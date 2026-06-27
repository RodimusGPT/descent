import { COLOR, weightToColor, withAlpha } from '@/lib/encoding';
import {
  BASE_LOGITS,
  type Candidate,
  PROMPT,
  VOCAB,
  applySampling,
  sampleIndex,
} from '@/lib/sampling';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { useMemo, useState } from 'react';

/**
 * SamplingPlayground — final projection → probability → sampled token (spec 10.1).
 *
 * The decoder's last step: a logit per candidate word becomes a probability
 * distribution, which temperature / top-k / top-p reshape before we draw a token.
 * A live horizontal bar chart shows each candidate's probability; the three
 * sliders re-shape the distribution in real time (kept tokens glow warm, filtered
 * ones grey out); the Sample button draws one token under the current settings and
 * highlights it.
 *
 * Self-contained: defaults to the built-in candidate vocabulary, zero props.
 */

export interface SamplingPlaygroundProps {
  vocab?: readonly Candidate[];
  logits?: number[];
}

const BAR_W = 320;

export function SamplingPlayground({
  vocab = VOCAB,
  logits = BASE_LOGITS,
}: SamplingPlaygroundProps) {
  const reduced = usePrefersReducedMotion();
  const n = vocab.length;

  const [temperature, setTemperature] = useState(0.8);
  const [topK, setTopK] = useState(n);
  const [topP, setTopP] = useState(1);
  const [chosen, setChosen] = useState<number | null>(null);

  const { probs, kept } = useMemo(
    () => applySampling(logits, { temperature, topK, topP }),
    [logits, temperature, topK, topP],
  );

  const maxProb = useMemo(() => Math.max(1e-6, ...probs), [probs]);
  const keptCount = useMemo(() => kept.filter(Boolean).length, [kept]);

  const transition = reduced ? 'none' : 'width 220ms ease, background-color 220ms ease';

  const onSample = () => {
    setChosen(sampleIndex(probs, Math.random));
  };

  // Render rows in descending-probability order so the chart reads top-down.
  const order = useMemo(
    () => probs.map((_, i) => i).sort((a, b) => probs[b] - probs[a] || a - b),
    [probs],
  );

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      {/* Prompt + sampled token */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 font-mono text-sm">
        <span className="text-muted">
          {PROMPT.replace('___', '')}
          {chosen !== null ? (
            <span
              className="rounded-md border px-1.5 py-0.5"
              style={{
                color: COLOR.ink,
                borderColor: COLOR.active,
                backgroundColor: withAlpha(COLOR.active, 0.18),
              }}
            >
              {vocab[chosen]?.token}
            </span>
          ) : (
            <span className="text-faint">___</span>
          )}
        </span>
        <span className="text-xs text-faint" aria-live="polite">
          {keptCount} of {n} tokens kept
        </span>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SliderControl
          label="Temperature"
          value={temperature}
          min={0.1}
          max={2}
          step={0.05}
          display={temperature.toFixed(2)}
          onChange={setTemperature}
        />
        <SliderControl
          label="Top-k"
          value={topK}
          min={1}
          max={n}
          step={1}
          display={String(topK)}
          onChange={(v) => setTopK(Math.round(v))}
        />
        <SliderControl
          label="Top-p"
          value={topP}
          min={0}
          max={1}
          step={0.01}
          display={topP.toFixed(2)}
          onChange={setTopP}
        />
      </div>

      {/* Bar chart */}
      <ul className="flex flex-col gap-1.5" aria-label="Next-token probabilities">
        {order.map((i) => {
          const p = probs[i];
          const isKept = kept[i];
          const isChosen = chosen === i;
          const barColor = isKept ? weightToColor(p / maxProb) : COLOR.inert;
          const widthPct = isKept ? (p / maxProb) * 100 : 0;
          return (
            <li key={vocab[i]?.token ?? i} className="flex items-center gap-2">
              <span
                className="w-24 shrink-0 text-right font-mono text-xs"
                style={{ color: isKept ? COLOR.ink : COLOR.faint }}
              >
                {vocab[i]?.token}
              </span>
              <span
                className="relative h-5 grow overflow-hidden rounded-sm"
                style={{ maxWidth: BAR_W, backgroundColor: withAlpha(COLOR.border, 0.4) }}
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-sm"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: barColor,
                    boxShadow: isChosen ? `0 0 0 2px ${withAlpha(COLOR.active, 0.7)}` : undefined,
                    transition,
                  }}
                />
              </span>
              <span
                className="w-12 shrink-0 text-right font-mono text-xs tabular-nums"
                style={{ color: isKept ? COLOR.muted : COLOR.faint }}
              >
                {isKept ? `${(p * 100).toFixed(1)}%` : '—'}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Sample action */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onSample}
          className="rounded-md border px-3 py-1.5 font-mono text-sm transition-colors "
          style={{
            borderColor: COLOR.active,
            backgroundColor: withAlpha(COLOR.active, 0.16),
            color: COLOR.active,
          }}
        >
          Sample a token
        </button>
        <span className="font-mono text-xs text-faint">
          {chosen !== null ? (
            <span style={{ color: COLOR.ink }}>
              drew <span style={{ color: COLOR.active }}>{vocab[chosen]?.token}</span>
            </span>
          ) : (
            'draws one token under the current distribution'
          )}
        </span>
      </div>
    </div>
  );
}

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}

function SliderControl({ label, value, min, max, step, display, onChange }: SliderControlProps) {
  const id = `samp-${label.toLowerCase().replace(/[^a-z]/g, '')}`;
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between font-mono text-xs">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums" style={{ color: COLOR.active }}>
          {display}
        </span>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: COLOR.active }}
        aria-label={label}
      />
    </label>
  );
}

export default SamplingPlayground;
