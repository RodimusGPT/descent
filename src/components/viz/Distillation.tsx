import { EXAMPLE_PRESETS, STUDENT, TEACHER, transferProxy } from '@/lib/distill';
import { COLOR, clamp01, weightToColor, withAlpha } from '@/lib/encoding';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { useId, useState } from 'react';

/**
 * Distillation (spec 10.2) — a sidebar diagram for the OTHER route to small
 * models. A big TEACHER model produces outputs / reasoning traces on prompts;
 * arrows feed those traces as training data into a small STUDENT. A slider for
 * the number of examples drives an ILLUSTRATIVE capability-transfer readout.
 *
 * The point: this is capability TRANSFER (training the student to imitate the
 * teacher), distinct from quantization, which COMPRESSES an existing model's
 * numbers. Even a modest set of examples (~1K) transfers a surprising amount.
 *
 * Self-contained: renders with zero required props.
 */

const MIN_EXAMPLES = 10;
const MAX_EXAMPLES = 100_000;

// Slider runs over the log10 of the example count, so each notch is a roughly
// equal multiplicative step — the natural scale for "10 vs 100 vs 1000".
const MIN_LOG = Math.log10(MIN_EXAMPLES);
const MAX_LOG = Math.log10(MAX_EXAMPLES);
const STEP = 0.01;

function snapExamples(n: number): number {
  if (n >= 10_000) return Math.round(n / 1000) * 1000;
  if (n >= 1000) return Math.round(n / 100) * 100;
  if (n >= 100) return Math.round(n / 10) * 10;
  return Math.round(n);
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return `${n}`;
}

export interface DistillationProps {
  /** Initial number of teacher examples shown on first render. */
  initialExamples?: number;
}

export function Distillation({ initialExamples = 1000 }: DistillationProps) {
  const reduced = usePrefersReducedMotion();
  const baseId = useId();
  const sliderId = `${baseId}-examples`;

  const [logExamples, setLogExamples] = useState<number>(
    () =>
      clamp01((Math.log10(initialExamples) - MIN_LOG) / (MAX_LOG - MIN_LOG)) * (MAX_LOG - MIN_LOG) +
      MIN_LOG,
  );

  const examples = snapExamples(10 ** logExamples);
  const score = transferProxy(examples);
  const scoreColor = weightToColor(score / 100);

  // A few flowing "trace" particles between teacher and student. The COUNT of
  // visible traces scales gently with the example count to reinforce the slider.
  const traceCount = Math.min(
    5,
    1 + Math.floor(((logExamples - MIN_LOG) / (MAX_LOG - MIN_LOG)) * 4),
  );

  const barTransition = reduced ? undefined : 'width 320ms ease, background-color 320ms ease';

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 text-ink">
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-sm text-ink">
          Distillation — the other route to small models
        </h3>
        <p className="text-xs text-muted">
          Train a small <span style={{ color: COLOR.active }}>student</span> on a big{' '}
          <span style={{ color: COLOR.modelAccent }}>teacher</span>&rsquo;s answers and reasoning
          traces. This <em>transfers capability</em> — distinct from quantization, which only{' '}
          <em>compresses</em> an existing model&rsquo;s numbers.
        </p>
      </div>

      {/* Teacher -> traces -> student diagram */}
      <svg
        viewBox="0 0 560 180"
        className="w-full"
        role="img"
        aria-label={`A ${TEACHER.paramsB} billion parameter teacher produces ${formatCount(
          examples,
        )} reasoning-trace examples that train a ${STUDENT.paramsB} billion parameter student`}
      >
        <defs>
          <marker
            id={`${baseId}-arrow`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={COLOR.muted} />
          </marker>
        </defs>

        {/* Teacher box (large) */}
        <g>
          <rect
            x={16}
            y={28}
            width={150}
            height={124}
            rx={10}
            fill={withAlpha(COLOR.modelAccent, 0.16)}
            stroke={COLOR.modelAccent}
            strokeWidth={1.5}
          />
          <text
            x={91}
            y={70}
            textAnchor="middle"
            className="font-mono"
            fontSize={13}
            fill={COLOR.ink}
          >
            {TEACHER.name}
          </text>
          <text
            x={91}
            y={92}
            textAnchor="middle"
            className="font-mono"
            fontSize={11}
            fill={COLOR.muted}
          >
            {TEACHER.paramsB}B params
          </text>
          <text x={91} y={120} textAnchor="middle" fontSize={10} fill={COLOR.faint}>
            big model
          </text>
        </g>

        {/* Prompt -> teacher produces traces. Animated flowing particles. */}
        {Array.from({ length: traceCount }).map((_, i) => {
          const y = 56 + i * (68 / Math.max(1, traceCount - 1 || 1));
          const dur = 1.6 + i * 0.25;
          const begin = `${i * 0.3}s`;
          return (
            <g key={i}>
              <line
                x1={166}
                y1={y}
                x2={394}
                y2={y}
                stroke={withAlpha(COLOR.muted, 0.3)}
                strokeWidth={1}
                strokeDasharray="3 4"
              />
              <circle r={3} fill={COLOR.active}>
                {!reduced && (
                  <animate
                    attributeName="cx"
                    from={172}
                    to={388}
                    dur={`${dur}s`}
                    begin={begin}
                    repeatCount="indefinite"
                  />
                )}
                {reduced && <set attributeName="cx" to={280} />}
                <set attributeName="cy" to={y} />
              </circle>
            </g>
          );
        })}

        {/* Label on the trace channel */}
        <text x={280} y={150} textAnchor="middle" fontSize={10} fill={COLOR.muted}>
          {formatCount(examples)} outputs / reasoning traces
        </text>

        {/* Arrow head into student */}
        <line
          x1={388}
          y1={90}
          x2={406}
          y2={90}
          stroke={COLOR.muted}
          strokeWidth={1.5}
          markerEnd={`url(#${baseId}-arrow)`}
        />

        {/* Student box (small) */}
        <g>
          <rect
            x={414}
            y={58}
            width={92}
            height={66}
            rx={8}
            fill={withAlpha(COLOR.active, 0.16)}
            stroke={COLOR.active}
            strokeWidth={1.5}
          />
          <text
            x={460}
            y={86}
            textAnchor="middle"
            className="font-mono"
            fontSize={12}
            fill={COLOR.ink}
          >
            {STUDENT.name}
          </text>
          <text
            x={460}
            y={104}
            textAnchor="middle"
            className="font-mono"
            fontSize={10}
            fill={COLOR.muted}
          >
            {STUDENT.paramsB}B params
          </text>
        </g>
      </svg>

      {/* Examples slider — real labeled range input */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor={sliderId}
          className="flex items-baseline justify-between text-xs text-muted"
        >
          <span>Training examples from teacher</span>
          <span className="font-mono tabular-nums" style={{ color: COLOR.active }}>
            {formatCount(examples)}
          </span>
        </label>
        <input
          id={sliderId}
          type="range"
          min={MIN_LOG}
          max={MAX_LOG}
          step={STEP}
          value={logExamples}
          onChange={(e) => setLogExamples(Number(e.target.value))}
          className="w-full accent-active"
          aria-valuetext={`${examples} examples`}
        />
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_PRESETS.map((preset) => {
            const active = examples === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => setLogExamples(Math.log10(preset))}
                className="rounded-md border px-2.5 py-1 font-mono text-xs transition-colors "
                style={{
                  borderColor: active ? COLOR.active : COLOR.border,
                  backgroundColor: active ? withAlpha(COLOR.active, 0.18) : 'transparent',
                  color: active ? COLOR.active : COLOR.muted,
                }}
              >
                {formatCount(preset)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Transfer score readout + bar */}
      <div className="rounded-md border border-border bg-surface-raised p-3">
        <div className="flex items-baseline justify-between">
          <div className="text-xs text-muted">Capability transferred (illustrative)</div>
          <div className="font-mono text-lg tabular-nums" style={{ color: scoreColor }}>
            {score.toFixed(0)}
          </div>
        </div>
        <div
          className="mt-2 h-2.5 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: withAlpha(COLOR.muted, 0.18) }}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(score)}
          aria-label="Illustrative capability transfer score"
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${score}%`,
              backgroundColor: scoreColor,
              transition: barTransition,
            }}
          />
        </div>
        <div className="mt-1.5 text-[0.7rem] text-faint">
          illustrative curve — saturating, with diminishing returns. Not a benchmark.
        </div>
      </div>
    </div>
  );
}

export default Distillation;
