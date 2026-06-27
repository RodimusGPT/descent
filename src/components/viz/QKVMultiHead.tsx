import { Token } from '@/components/scroll/Token';
import { COLOR, weightToColor, withAlpha } from '@/lib/encoding';
import {
  HEADS,
  HEAD_DIM,
  type Head,
  TOKENS,
  type TokenDatum,
  gqaGrouping,
  headAttention,
} from '@/lib/qkv';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import {
  type CSSProperties,
  type KeyboardEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * QKVMultiHead — spec 10.1.
 *
 * Walks one fixed, tiny example through scaled dot-product attention: every token
 * is projected (per head) into a Query, Key and Value vector; a chosen query is
 * scored against all keys ((Q·Kᵀ)/√d), softmaxed into weights, and used to take a
 * weighted sum of the values. Switching heads swaps the projections and so the
 * attention pattern. A second panel shows grouped-query / multi-query attention,
 * where several query heads SHARE one K/V group to shrink the KV cache.
 *
 * Self-contained: defaults to the HEADS/TOKENS fixed example, zero props needed.
 */

export interface QKVMultiHeadProps {
  tokens?: TokenDatum[];
  heads?: Head[];
}

/** Illustrative query-head count for the GQA/MQA panel (typical small model). */
const N_QUERY_HEADS = 8;

type GqaMode = 'mha' | 'gqa' | 'mqa';
const GQA_MODES: Array<{ id: GqaMode; label: string; groups: number; blurb: string }> = [
  { id: 'mha', label: 'MHA', groups: N_QUERY_HEADS, blurb: 'Every query head has its own K/V.' },
  { id: 'gqa', label: 'GQA', groups: 2, blurb: 'Query heads share K/V in groups.' },
  { id: 'mqa', label: 'MQA', groups: 1, blurb: 'All query heads share one K/V.' },
];

/** A small horizontal bar glyph for a fixed-dimension vector (model internals → purple). */
function VecGlyph({
  vec,
  scale,
  hue,
  label,
}: {
  vec: number[];
  scale: number;
  hue: string;
  label: string;
}) {
  return (
    <span
      className="inline-flex items-end gap-[2px]"
      role="img"
      aria-label={`${label}: [${vec.map((v) => v.toFixed(1)).join(', ')}]`}
      title={`${label} = [${vec.map((v) => v.toFixed(2)).join(', ')}]`}
    >
      {vec.map((v, i) => {
        const frac = scale === 0 ? 0 : Math.abs(v) / scale;
        const h = 4 + Math.round(frac * 14);
        return (
          <span
            key={i}
            className="w-[5px] rounded-[1px]"
            style={{
              height: `${h}px`,
              backgroundColor: withAlpha(hue, 0.25 + 0.6 * frac),
              border: `1px solid ${withAlpha(hue, 0.5)}`,
            }}
          />
        );
      })}
    </span>
  );
}

export function QKVMultiHead({ tokens = TOKENS, heads = HEADS }: QKVMultiHeadProps) {
  const reduced = usePrefersReducedMotion();

  const [headIdx, setHeadIdx] = useState(0);
  const [queryIdx, setQueryIdx] = useState(1 % tokens.length);
  const [mode, setMode] = useState<GqaMode>('gqa');

  const tokenRefs = useRef<Array<HTMLElement | null>>([]);

  const head = heads[Math.min(headIdx, heads.length - 1)];
  const safeQuery = Math.min(queryIdx, tokens.length - 1);

  const { scores, weights, output } = useMemo(
    () => headAttention(head.Q[safeQuery], head.K, head.V),
    [head, safeQuery],
  );

  // Shared display scale across this head's Q/K/V so the bar glyphs are comparable.
  const vecScale = useMemo(() => {
    let m = 0;
    for (const mat of [head.Q, head.K, head.V]) {
      for (const row of mat) for (const v of row) m = Math.max(m, Math.abs(v));
    }
    return m || 1;
  }, [head]);
  const outScale = useMemo(
    () => Math.max(vecScale, ...output.map((v) => Math.abs(v))),
    [vecScale, output],
  );

  const onTokenKey = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
      let next: number | null = null;
      if (e.key === 'ArrowRight') next = Math.min(tokens.length - 1, i + 1);
      else if (e.key === 'ArrowLeft') next = Math.max(0, i - 1);
      if (next !== null) {
        e.preventDefault();
        setQueryIdx(next);
        tokenRefs.current[next]?.querySelector('button')?.focus();
      }
    },
    [tokens.length],
  );

  const transition = reduced ? 'none' : 'width 220ms ease, background-color 220ms ease';

  const activeMode = GQA_MODES.find((m) => m.id === mode) ?? GQA_MODES[1];
  const grouping = useMemo(
    () => gqaGrouping(N_QUERY_HEADS, activeMode.groups),
    [activeMode.groups],
  );
  const shrink = N_QUERY_HEADS / activeMode.groups;

  const panel: CSSProperties = { backgroundColor: COLOR.surface, borderColor: COLOR.border };

  return (
    <section
      className="mx-auto flex w-full max-w-[860px] flex-col gap-4 rounded-xl border p-4 font-sans text-ink sm:p-5"
      style={panel}
      aria-label="Query, key, value attention across multiple heads"
    >
      {/* Head selector */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Attention head">
        <span className="font-mono text-xs text-faint">Head:</span>
        {heads.map((h, i) => {
          const isActive = i === Math.min(headIdx, heads.length - 1);
          return (
            <button
              key={h.name}
              type="button"
              onClick={() => setHeadIdx(i)}
              aria-pressed={isActive}
              title={h.description}
              className="rounded-md border px-2 py-1 font-mono text-xs transition-colors "
              style={{
                borderColor: isActive ? COLOR.modelAccent : COLOR.border,
                backgroundColor: isActive ? withAlpha(COLOR.modelAccent, 0.16) : 'transparent',
                color: isActive ? COLOR.modelAccent : COLOR.muted,
              }}
            >
              {h.name}
            </button>
          );
        })}
        <span className="ml-auto font-mono text-[0.7rem] text-faint">{head.description}</span>
      </div>

      {/* Token row + per-token Q/K/V glyphs */}
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted">
          Pick a query token — each token is projected into a Query, Key and Value (d&nbsp;=&nbsp;
          {HEAD_DIM}).
        </span>
        <div
          className="grid items-start gap-2"
          style={{ gridTemplateColumns: `repeat(${tokens.length}, minmax(0, 1fr))` }}
        >
          {tokens.map((t, i) => {
            const isQuery = i === safeQuery;
            return (
              <div key={t.id} className="flex flex-col items-center gap-1.5">
                <span
                  ref={(el: HTMLSpanElement | null) => {
                    tokenRefs.current[i] = el;
                  }}
                  className="inline-flex"
                >
                  <Token
                    text={t.text}
                    id={t.id}
                    state={isQuery ? 'active' : 'default'}
                    selected={isQuery}
                    size="md"
                    ariaLabel={isQuery ? `Query token ${t.text}` : `Set query to ${t.text}`}
                    onClick={() => setQueryIdx(i)}
                    onKeyDown={(e) => onTokenKey(e, i)}
                  />
                </span>
                <div className="flex flex-col items-center gap-1.5 rounded-md border border-border bg-bg px-2 py-1.5">
                  <GlyphRow
                    tag="Q"
                    vec={head.Q[i]}
                    scale={vecScale}
                    hue={COLOR.modelAccent}
                    dim={!isQuery}
                    token={t.text}
                  />
                  <GlyphRow
                    tag="K"
                    vec={head.K[i]}
                    scale={vecScale}
                    hue={COLOR.hwAccent}
                    token={t.text}
                  />
                  <GlyphRow
                    tag="V"
                    vec={head.V[i]}
                    scale={vecScale}
                    hue={COLOR.active}
                    token={t.text}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Attention pipeline for the selected query */}
      <div
        className="flex flex-col gap-2 rounded-lg border p-3"
        style={{ borderColor: COLOR.border, backgroundColor: withAlpha(COLOR.faint, 0.06) }}
      >
        <div className="font-mono text-xs text-muted">
          Query <span style={{ color: COLOR.modelAccent }}>{tokens[safeQuery]?.text}</span> · scores
          = (Q·Kᵀ)/√d → softmax → Σ&nbsp;wᵢ·Vᵢ
        </div>

        {/* per-key rows: token · score · weight bar */}
        <div className="flex flex-col gap-1">
          {tokens.map((t, i) => {
            const w = weights[i] ?? 0;
            const s = scores[i] ?? 0;
            return (
              <div key={t.id} className="grid grid-cols-[5rem_4.5rem_1fr_3rem] items-center gap-2">
                <span className="justify-self-start">
                  <Token text={t.text} id={t.id} weight={w} size="sm" />
                </span>
                <span
                  className="text-right font-mono text-xs tabular-nums text-faint"
                  title="scaled score"
                >
                  {s >= 0 ? '+' : ''}
                  {s.toFixed(2)}
                </span>
                <span
                  className="h-3 w-full overflow-hidden rounded-sm"
                  style={{ backgroundColor: withAlpha(COLOR.faint, 0.12) }}
                >
                  <span
                    className="block h-full rounded-sm"
                    style={{
                      width: `${Math.max(2, w * 100)}%`,
                      backgroundColor: weightToColor(w),
                      transition,
                    }}
                  />
                </span>
                <span
                  className="text-right font-mono text-xs tabular-nums"
                  style={{ color: weightToColor(w) }}
                >
                  {(w * 100).toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>

        {/* output vector */}
        <div
          className="mt-1 flex items-center gap-3 border-t pt-2"
          style={{ borderColor: COLOR.border }}
        >
          <span className="font-mono text-xs text-muted">output =</span>
          <VecGlyph vec={output} scale={outScale} hue={COLOR.active} label="attention output" />
          <span className="font-mono text-xs tabular-nums text-faint">
            [{output.map((v) => v.toFixed(2)).join(', ')}]
          </span>
          <span className="ml-auto font-mono text-[0.7rem] text-faint">
            weighted blend of the V&apos;s
          </span>
        </div>
      </div>

      {/* GQA / MQA panel */}
      <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: COLOR.border }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-faint">KV sharing:</span>
          <div className="flex gap-1" role="group" aria-label="KV sharing scheme">
            {GQA_MODES.map((m) => {
              const on = m.id === mode;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  aria-pressed={on}
                  title={m.blurb}
                  className="rounded-md border px-2 py-1 font-mono text-xs transition-colors "
                  style={{
                    borderColor: on ? COLOR.hwAccent : COLOR.border,
                    backgroundColor: on ? withAlpha(COLOR.hwAccent, 0.16) : 'transparent',
                    color: on ? COLOR.hwAccent : COLOR.muted,
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <span className="ml-auto font-mono text-[0.7rem] text-faint">{activeMode.blurb}</span>
        </div>

        {/* group cards: each KV group holds the query heads that share it */}
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${Math.min(activeMode.groups, 4)}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: activeMode.groups }, (_, g) => {
            const members = grouping.flatMap((grp, h) => (grp === g ? [h] : []));
            return (
              <div
                key={g}
                className="flex flex-col gap-1 rounded-md border p-1.5"
                style={{
                  borderColor: withAlpha(COLOR.hwAccent, 0.7),
                  backgroundColor: withAlpha(COLOR.hwAccent, 0.07),
                }}
              >
                <span className="font-mono text-[0.65rem]" style={{ color: COLOR.hwAccent }}>
                  K/V {g}
                </span>
                <div className="flex flex-wrap gap-1">
                  {members.map((h) => (
                    <span
                      key={h}
                      className="rounded px-1 py-0.5 font-mono text-[0.65rem] tabular-nums"
                      style={{
                        color: COLOR.modelAccent,
                        backgroundColor: withAlpha(COLOR.modelAccent, 0.16),
                        border: `1px solid ${withAlpha(COLOR.modelAccent, 0.5)}`,
                      }}
                      title={`Query head Q${h}`}
                    >
                      Q{h}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <p className="font-mono text-[0.7rem] text-faint">
          {N_QUERY_HEADS} query heads ·{' '}
          <span style={{ color: COLOR.hwAccent }}>{activeMode.groups}</span> K/V{' '}
          {activeMode.groups === 1 ? 'set' : 'sets'}
          {shrink > 1 ? (
            <>
              {' → '}
              <span className="text-ink">{shrink.toFixed(0)}× smaller</span> KV cache (the saving
              pays off in Part 3).
            </>
          ) : (
            <> → a full, unshared KV cache (sharing K/V shrinks it — pays off in Part 3).</>
          )}
        </p>
      </div>
    </section>
  );
}

/** A labelled glyph row (Q / K / V) used inside each token's projection card. */
function GlyphRow({
  tag,
  vec,
  scale,
  hue,
  dim,
  token,
}: {
  tag: string;
  vec: number[];
  scale: number;
  hue: string;
  dim?: boolean;
  token: string;
}) {
  return (
    <span className="flex items-center gap-1" style={{ opacity: dim ? 0.85 : 1 }}>
      <span className="w-3 font-mono text-[0.72rem]" style={{ color: hue }}>
        {tag}
      </span>
      <VecGlyph vec={vec} scale={scale} hue={hue} label={`${token} ${tag}`} />
    </span>
  );
}

export default QKVMultiHead;
