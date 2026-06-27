import { Token } from '@/components/scroll/Token';
import { COLOR, weightToColor, withAlpha } from '@/lib/encoding';
import { MOE_PRESET, type MoePreset, activeParamsB, route } from '@/lib/moe';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { type KeyboardEvent, useId, useMemo, useState } from 'react';

/**
 * MoERouter (spec 10.1) — how a mixture-of-experts layer routes a token.
 *
 * A token enters a small router that scores every expert FFN; the gate (a
 * softmax over those scores) is drawn as a bar per expert. Only the top-k
 * experts actually RUN — they light up warm (active) while the rest stay cool
 * (dormant). A live readout contrasts the ACTIVE parameters per token with the
 * TOTAL parameters stored, the whole point of MoE: cheap to run, huge to store.
 *
 * Self-contained: renders with zero required props.
 */

/** A demo token plus the per-expert router logits it produces. */
interface TokenDatum {
  text: string;
  id: number;
  logits: number[];
}

const EXPERT_COUNT = MOE_PRESET.totalExperts;

/**
 * Deterministic logits for one demo token: a couple of strong "specialist"
 * experts plus a smooth background, so routing visibly differs per token without
 * any randomness. `peaks` are [expertIndex, strength] pairs.
 */
function makeLogits(peaks: Array<[number, number]>, phase: number): number[] {
  const out = new Array<number>(EXPERT_COUNT);
  for (let i = 0; i < EXPERT_COUNT; i++) {
    // Gentle deterministic ripple as the baseline.
    out[i] = 0.6 * Math.sin((i + phase) * 0.7) + 0.5 * Math.cos((i + phase) * 0.23);
  }
  for (const [idx, strength] of peaks) {
    const e = ((idx % EXPERT_COUNT) + EXPERT_COUNT) % EXPERT_COUNT;
    out[e] += strength;
    // Spill a little onto neighbours so peaks read as soft bumps.
    out[(e + 1) % EXPERT_COUNT] += strength * 0.4;
    out[(e + EXPERT_COUNT - 1) % EXPERT_COUNT] += strength * 0.4;
  }
  return out;
}

const TOKENS: TokenDatum[] = [
  {
    text: 'def',
    id: 312,
    logits: makeLogits(
      [
        [12, 4.2],
        [47, 3.1],
        [88, 2.4],
      ],
      0,
    ),
  },
  {
    text: ' "café"',
    id: 904,
    logits: makeLogits(
      [
        [3, 3.8],
        [61, 3.6],
        [102, 2.2],
      ],
      7,
    ),
  },
  {
    text: ' 42',
    id: 55,
    logits: makeLogits(
      [
        [120, 4.5],
        [73, 2.9],
        [9, 2.0],
      ],
      19,
    ),
  },
  {
    text: ' 中文',
    id: 781,
    logits: makeLogits(
      [
        [34, 4.0],
        [99, 3.4],
        [50, 2.6],
      ],
      31,
    ),
  },
];

const K_CHOICES = [1, 2, 4, 8];

const WIDTH = 760;
const HEIGHT = 150;
const PAD = { top: 10, right: 8, bottom: 8, left: 8 };

function formatB(b: number): string {
  return b >= 10 ? b.toFixed(0) : b.toFixed(1);
}

export interface MoERouterProps {
  tokens?: TokenDatum[];
  preset?: MoePreset;
}

export function MoERouter({ tokens = TOKENS, preset = MOE_PRESET }: MoERouterProps) {
  const reduced = usePrefersReducedMotion();
  const [tokenIdx, setTokenIdx] = useState(0);
  const [k, setK] = useState(preset.topK);

  const baseId = useId();
  const tokenGroupId = `${baseId}-tok`;
  const kGroupId = `${baseId}-k`;

  const token = tokens[Math.min(tokenIdx, tokens.length - 1)];
  const { gate, chosen, weights } = useMemo(() => route(token.logits, k), [token.logits, k]);

  const chosenSet = useMemo(() => new Set(chosen), [chosen]);
  const weightByExpert = useMemo(() => {
    const m = new Map<number, number>();
    for (const w of weights) m.set(w.expert, w.weight);
    return m;
  }, [weights]);

  const { activeB, totalB } = useMemo(() => activeParamsB(preset, k), [preset, k]);
  const activeFrac = totalB === 0 ? 0 : activeB / totalB;

  const n = gate.length;
  const maxGate = useMemo(() => Math.max(1e-9, ...gate), [gate]);

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const barW = plotW / Math.max(1, n);

  const barTransition = reduced ? undefined : 'height 280ms ease, y 280ms ease, fill 280ms ease';

  const onTokenKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const delta = e.key === 'ArrowRight' ? 1 : -1;
      setTokenIdx((i + delta + tokens.length) % tokens.length);
    }
  };

  return (
    <div className="flex w-full flex-col gap-4 rounded-lg border border-border bg-surface p-4 text-ink">
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-sm text-ink">Mixture-of-experts router</h3>
        <p className="text-xs text-muted">
          The router scores every expert; only the top-k actually run for this token. Most
          parameters sit dormant.
        </p>
      </div>

      {/* Token selector — render each via the shared Token motif */}
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted" id={tokenGroupId}>
          Input token
        </span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={tokenGroupId}>
          {tokens.map((t, i) => {
            const active = i === Math.min(tokenIdx, tokens.length - 1);
            return (
              <Token
                key={t.id}
                text={t.text}
                id={t.id}
                state={active ? 'active' : 'default'}
                selected={active}
                ariaLabel={`Route token ${t.text}`}
                ariaPressed={active}
                onClick={() => setTokenIdx(i)}
                onKeyDown={(e) => onTokenKey(e, i)}
              />
            );
          })}
        </div>
      </div>

      {/* Gate bar chart over all experts */}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Router gate over ${n} experts for token ${token.text}; ${chosen.length} experts active.`}
      >
        <line
          x1={PAD.left}
          y1={PAD.top + plotH}
          x2={PAD.left + plotW}
          y2={PAD.top + plotH}
          stroke={COLOR.border}
          strokeWidth={1}
        />
        {gate.map((g, i) => {
          const isChosen = chosenSet.has(i);
          const h = (g / maxGate) * plotH;
          const x = PAD.left + i * barW;
          const y = PAD.top + plotH - h;
          // Active experts read warm (energy ∝ gate); dormant experts stay cool/dim.
          const fill = isChosen ? weightToColor(0.55 + 0.45 * (g / maxGate)) : COLOR.inert;
          return (
            <rect
              key={i}
              x={x + 0.5}
              y={y}
              width={Math.max(0.5, barW - 1)}
              height={Math.max(0, h)}
              fill={withAlpha(fill, isChosen ? 0.95 : 0.3)}
              style={barTransition ? { transition: barTransition } : undefined}
            >
              <title>{`Expert ${i} · gate ${(g * 100).toFixed(1)}%${
                isChosen ? ' · ACTIVE' : ' · dormant'
              }`}</title>
            </rect>
          );
        })}
      </svg>

      {/* k selector — real radio group */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs text-muted" id={kGroupId}>
          Experts per token (top-k)
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={kGroupId}>
          {K_CHOICES.filter((c) => c <= n).map((c) => {
            const active = c === k;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setK(c)}
                className="rounded-md border px-3 py-1 font-mono text-sm transition-colors "
                style={{
                  borderColor: active ? COLOR.active : COLOR.border,
                  backgroundColor: active ? withAlpha(COLOR.active, 0.18) : 'transparent',
                  color: active ? COLOR.active : COLOR.muted,
                }}
              >
                top-{c}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Chosen experts + renormalized weights */}
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
        <span className="text-faint">routed →</span>
        {chosen.map((e) => {
          const w = weightByExpert.get(e) ?? 0;
          return (
            <span
              key={e}
              className="rounded-md border px-2 py-0.5 tabular-nums"
              style={{
                borderColor: withAlpha(COLOR.active, 0.5),
                backgroundColor: withAlpha(weightToColor(0.5 + 0.5 * w), 0.18),
                color: COLOR.ink,
              }}
            >
              E{e}
              <span className="ml-1 text-faint">{(w * 100).toFixed(0)}%</span>
            </span>
          );
        })}
      </div>

      {/* Active vs total params readout */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border bg-surface-raised p-3">
          <div className="text-xs text-muted">Active params / token</div>
          <div className="font-mono text-lg tabular-nums" style={{ color: COLOR.active }}>
            ~{formatB(activeB)}B
          </div>
          <div className="text-[0.7rem] text-faint">
            {k} of {preset.totalExperts} experts run
          </div>
        </div>
        <div className="rounded-md border border-border bg-surface-raised p-3">
          <div className="text-xs text-muted">Total params stored</div>
          <div className="font-mono text-lg tabular-nums" style={{ color: COLOR.modelAccent }}>
            ~{formatB(totalB)}B
          </div>
          <div className="text-[0.7rem] text-faint">
            {(activeFrac * 100).toFixed(1)}% active per token
          </div>
        </div>
      </div>

      {/* Active fraction bar */}
      <div
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: withAlpha(COLOR.inert, 0.35) }}
        role="img"
        aria-label={`${(activeFrac * 100).toFixed(1)} percent of parameters active for this token`}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(1, activeFrac * 100)}%`,
            backgroundColor: COLOR.active,
            transition: reduced ? undefined : 'width 280ms ease',
          }}
        />
      </div>
    </div>
  );
}

export default MoERouter;
