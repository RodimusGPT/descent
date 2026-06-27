import { Token } from '@/components/scroll/Token';
import { COLOR, clamp01, weightToColor, withAlpha } from '@/lib/encoding';
import {
  type RoundToken,
  expectedAcceptedTokens,
  makeRng,
  simulateRound,
  speedup,
} from '@/lib/speculative';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { useEffect, useId, useMemo, useState } from 'react';

/**
 * SpeculativeDecoding (spec 10.3) — draft + verify.
 *
 * A small, cheap DRAFT model proposes `k` tokens; the big TARGET verifies all `k`
 * in ONE forward pass. Rejection sampling keeps the accepted prefix exactly (the
 * target distribution is preserved), resamples the first rejected token, and
 * grants a free bonus token when the whole draft survives. This converts decode's
 * spare compute into fewer serial target passes. The win rides on the acceptance
 * rate alpha and on the draft being far cheaper than the target — it can be a
 * SLOWDOWN (speedup < 1) when the draft is too costly or alpha too low.
 *
 * Self-contained: renders with zero required props.
 */

const MIN_K = 1;
const MAX_K = 8;

// A small bank of plausible-looking decoded tokens so the row reads like text.
const SAMPLE_TOKENS = [
  'the',
  ' model',
  ' drafts',
  ' a',
  ' few',
  ' tokens',
  ' ahead',
  ' and',
  ' the',
  ' target',
  ' checks',
  ' them',
];

export interface SpeculativeDecodingProps {
  /** Initial per-token acceptance probability (0..1). */
  initialAlpha?: number;
  /** Initial draft length k. */
  initialK?: number;
  /** Draft forward-pass cost as a fraction of one target pass. */
  draftCostRatio?: number;
}

function tokenWeight(t: RoundToken): number {
  if (t.accepted) return 0.85; // warm: kept
  if (t.bonus) return 0.6; // warm-ish: free bonus
  return 0; // rejected/resampled: cool
}

export function SpeculativeDecoding({
  initialAlpha = 0.7,
  initialK = 5,
  draftCostRatio = 0.15,
}: SpeculativeDecodingProps) {
  const reduced = usePrefersReducedMotion();
  const baseId = useId();
  const alphaId = `${baseId}-alpha`;
  const kId = `${baseId}-k`;

  const [alpha, setAlpha] = useState<number>(() => clamp01(initialAlpha));
  const [k, setK] = useState<number>(() => Math.max(MIN_K, Math.min(MAX_K, Math.round(initialK))));
  // Re-roll the illustrative single round on demand; seed keeps it deterministic.
  const [seed, setSeed] = useState(1);

  const round = useMemo(() => simulateRound(k, alpha, makeRng(seed)), [k, alpha, seed]);

  const expected = expectedAcceptedTokens(k, alpha);
  const sp = speedup(k, alpha, draftCostRatio);
  const isSlowdown = sp < 1;

  // Staggered reveal of the verification result. Static (all shown) when reduced.
  const [revealed, setRevealed] = useState(round.tokens.length);
  useEffect(() => {
    if (reduced) {
      setRevealed(round.tokens.length);
      return;
    }
    setRevealed(0);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setRevealed(i);
      if (i >= round.tokens.length) window.clearInterval(id);
    }, 280);
    return () => window.clearInterval(id);
  }, [round, reduced]);

  const spColor = isSlowdown ? COLOR.inert : weightToColor(clamp01((sp - 1) / 3));

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4 rounded-lg border border-border bg-surface p-4 text-ink">
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-sm text-ink">Speculative decoding — draft + verify</h3>
        <p className="text-xs text-muted">
          A cheap <span style={{ color: COLOR.hwAccent }}>draft</span> model proposes{' '}
          <span className="font-mono">k</span> tokens; the big{' '}
          <span style={{ color: COLOR.modelAccent }}>target</span> verifies all{' '}
          <span className="font-mono">k</span> in <em>one</em> forward pass. Rejection sampling
          keeps the accepted prefix (preserving the target&rsquo;s exact distribution), resamples
          the first miss, and adds a free bonus token when every draft token survives.
        </p>
      </div>

      {/* Draft row: the k proposed tokens */}
      <div className="flex flex-col gap-1.5">
        <div className="text-[0.7rem] uppercase tracking-wide text-faint">
          <span style={{ color: COLOR.hwAccent }}>Draft</span> proposes {k} token
          {k === 1 ? '' : 's'}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {Array.from({ length: k }).map((_, i) => (
            <Token
              key={i}
              text={SAMPLE_TOKENS[i % SAMPLE_TOKENS.length]}
              state="ghost"
              size="sm"
              title={`Draft proposal ${i + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Verify row: the target's one-pass verdict */}
      <div className="flex flex-col gap-1.5">
        <div className="text-[0.7rem] uppercase tracking-wide text-faint">
          <span style={{ color: COLOR.modelAccent }}>Target</span> verifies in one pass
        </div>
        <div className="flex flex-wrap items-center gap-1.5" aria-live="polite">
          {round.tokens.map((t, i) => {
            const shown = i < revealed;
            const label = t.bonus
              ? 'bonus'
              : t.rejected
                ? 'resample'
                : SAMPLE_TOKENS[t.index % SAMPLE_TOKENS.length];
            const verdict = t.accepted
              ? 'accepted'
              : t.rejected
                ? 'rejected — resampled by target'
                : 'free bonus token';
            return (
              <span
                key={i}
                className="inline-flex flex-col items-center gap-0.5"
                style={{
                  opacity: shown ? 1 : 0.15,
                  transition: reduced ? undefined : 'opacity 220ms ease',
                }}
              >
                <Token
                  text={label}
                  size="sm"
                  weight={shown ? tokenWeight(t) : undefined}
                  state={shown ? 'default' : 'ghost'}
                  selected={shown && t.rejected}
                  title={verdict}
                  ariaLabel={`${label}: ${verdict}`}
                />
                <span
                  className="text-[0.6rem] leading-none"
                  style={{
                    color: t.accepted ? COLOR.active : t.bonus ? COLOR.hwAccent : COLOR.faint,
                  }}
                  aria-hidden="true"
                >
                  {t.accepted ? '✓' : t.rejected ? '↻' : '★'}
                </span>
              </span>
            );
          })}
        </div>
        <div className="text-[0.7rem] text-muted">
          Accepted prefix:{' '}
          <span className="font-mono tabular-nums" style={{ color: COLOR.active }}>
            {round.acceptedCount}
          </span>{' '}
          of {k}
          {round.tokens.at(-1)?.bonus
            ? ' — whole draft accepted, +1 bonus.'
            : ' — first miss resampled by the target.'}{' '}
          <button
            type="button"
            onClick={() => setSeed((s) => s + 1)}
            className="rounded border border-border px-1.5 py-0.5 font-mono text-[0.65rem] text-muted transition-colors hover:text-ink "
          >
            re-roll
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={alphaId}
            className="flex items-baseline justify-between text-xs text-muted"
          >
            <span>Acceptance rate α</span>
            <span className="font-mono tabular-nums" style={{ color: weightToColor(alpha) }}>
              {alpha.toFixed(2)}
            </span>
          </label>
          <input
            id={alphaId}
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={alpha}
            onChange={(e) => setAlpha(clamp01(Number(e.target.value)))}
            className="w-full accent-active"
            aria-valuetext={`acceptance rate ${alpha.toFixed(2)}`}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={kId} className="flex items-baseline justify-between text-xs text-muted">
            <span>Draft length k</span>
            <span className="font-mono tabular-nums" style={{ color: COLOR.hwAccent }}>
              {k}
            </span>
          </label>
          <input
            id={kId}
            type="range"
            min={MIN_K}
            max={MAX_K}
            step={1}
            value={k}
            onChange={(e) => setK(Math.round(Number(e.target.value)))}
            className="w-full accent-active"
            aria-valuetext={`${k} draft tokens`}
          />
        </div>
      </div>

      {/* Readouts */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-surface-raised p-3">
          <div className="text-xs text-muted">Expected tokens / target pass</div>
          <div className="font-mono text-lg tabular-nums" style={{ color: COLOR.active }}>
            {expected.toFixed(2)}
          </div>
          <div className="mt-0.5 text-[0.7rem] text-faint">
            includes the bonus token (1 → {(MAX_K + 1).toFixed(0)} possible)
          </div>
        </div>
        <div className="rounded-md border border-border bg-surface-raised p-3">
          <div className="flex items-baseline justify-between text-xs text-muted">
            <span>Speedup vs. plain decode</span>
            {isSlowdown && (
              <span className="text-[0.65rem]" style={{ color: COLOR.activeHot }}>
                slowdown
              </span>
            )}
          </div>
          <div className="font-mono text-lg tabular-nums" style={{ color: spColor }}>
            {sp.toFixed(2)}×
          </div>
          <div className="mt-0.5 text-[0.7rem] text-faint">
            draft costs {(draftCostRatio * 100).toFixed(0)}% of a target pass; &lt; 1× means
            speculation hurts.
          </div>
        </div>
      </div>

      <p className="text-[0.7rem] leading-relaxed text-faint">
        Variants make the draft nearly free: <span className="text-muted">Medusa</span> adds extra
        prediction heads, <span className="text-muted">EAGLE</span> drafts in feature space, and{' '}
        <span className="text-muted">MTP</span> (multi-token prediction) trains the target to
        propose its own continuations. Lower draft cost or higher α both push the speedup up.
      </p>
    </div>
  );
}

export default SpeculativeDecoding;
