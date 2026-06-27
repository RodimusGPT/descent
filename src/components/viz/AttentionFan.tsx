import { Token } from '@/components/scroll/Token';
import { HEADS, type Head, TOKENS, type TokenDatum, weightToGeometry } from '@/lib/attention-data';
import { COLOR, weightToColor, withAlpha } from '@/lib/encoding';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

// useLayoutEffect warns under SSR; this island only ever measures layout on the
// client, so fall back to useEffect on the server to keep the console clean.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * AttentionFan — the site centerpiece (spec 9.1).
 *
 * Renders a sentence as a row of <Token/>s. One token is the QUERY; for the
 * active head we fan SVG lines from that query to every key token, encoding each
 * key's attention weight as line color (cool→hot), opacity, and width. Click or
 * arrow-key a token to re-root the fan; switch heads to change the pattern.
 *
 * Self-contained: defaults to TOKENS/HEADS so it renders with zero props.
 */

export interface AttentionFanProps {
  tokens?: TokenDatum[];
  heads?: Head[];
}

interface Point {
  x: number;
  y: number;
}

export function AttentionFan({ tokens = TOKENS, heads = HEADS }: AttentionFanProps) {
  const reduced = usePrefersReducedMotion();

  const [queryIdx, setQueryIdx] = useState(2 % tokens.length);
  const [headIdx, setHeadIdx] = useState(0);
  const [hoverKey, setHoverKey] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const tokenRefs = useRef<Array<HTMLElement | null>>([]);
  const [centers, setCenters] = useState<Point[]>([]);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const head = heads[Math.min(headIdx, heads.length - 1)];
  const safeQuery = Math.min(queryIdx, tokens.length - 1);
  const weights = head.matrix[safeQuery] ?? [];

  // Measure token centers relative to the container so the SVG overlay can draw
  // lines between them. Recompute on layout changes and on resize.
  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const box = container.getBoundingClientRect();
    const next: Point[] = tokens.map((_, i) => {
      const el = tokenRefs.current[i];
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      return {
        x: r.left - box.left + r.width / 2,
        y: r.top - box.top + r.height / 2,
      };
    });
    setCenters(next);
    setSize({ w: box.width, h: box.height });
  }, [tokens]);

  useIsomorphicLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measure]);

  const onTokenKey = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = Math.min(tokens.length - 1, i + 1);
        setQueryIdx(next);
        tokenRefs.current[next]?.querySelector('button')?.focus();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = Math.max(0, i - 1);
        setQueryIdx(next);
        tokenRefs.current[next]?.querySelector('button')?.focus();
      }
    },
    [tokens.length],
  );

  const queryCenter = centers[safeQuery];
  const transition = reduced ? 'none' : 'opacity 200ms ease, stroke-width 200ms ease';

  const readoutKey = hoverKey ?? null;
  const readoutWeight = readoutKey !== null ? (weights[readoutKey] ?? 0) : null;

  return (
    <div className="flex w-full flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      {/* Head selector */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Attention head">
        <span className="text-xs text-faint">Head:</span>
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
                borderColor: isActive ? COLOR.active : COLOR.border,
                backgroundColor: isActive ? withAlpha(COLOR.active, 0.16) : 'transparent',
                color: isActive ? COLOR.active : COLOR.muted,
              }}
            >
              {h.name}
            </button>
          );
        })}
      </div>

      {/* Token row with SVG fan overlay */}
      <div ref={containerRef} className="relative w-full py-10">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          aria-hidden="true"
        >
          {queryCenter &&
            centers.map((c, i) => {
              if (i === safeQuery) return null;
              const w = weights[i] ?? 0;
              const { opacity, width } = weightToGeometry(w);
              const emphasized = hoverKey === i;
              return (
                <line
                  key={i}
                  x1={queryCenter.x}
                  y1={queryCenter.y}
                  x2={c.x}
                  y2={c.y}
                  stroke={weightToColor(w)}
                  strokeOpacity={emphasized ? Math.min(1, opacity + 0.25) : opacity}
                  strokeWidth={emphasized ? width + 1 : width}
                  strokeLinecap="round"
                  style={{ transition }}
                />
              );
            })}
        </svg>

        <div className="relative flex flex-wrap items-center justify-center gap-2">
          {tokens.map((t, i) => {
            const isQuery = i === safeQuery;
            const w = weights[i] ?? 0;
            return (
              // Wrapper owns measurement + hover/focus, since <Token/> exposes
              // neither a ref nor pointer handlers. onFocus/onBlur bubble here
              // from the inner <button>.
              <span
                key={t.id}
                ref={(el: HTMLSpanElement | null) => {
                  tokenRefs.current[i] = el;
                }}
                className="inline-flex"
                onMouseEnter={() => setHoverKey(isQuery ? null : i)}
                onMouseLeave={() => setHoverKey(null)}
                onFocus={() => setHoverKey(isQuery ? null : i)}
                onBlur={() => setHoverKey(null)}
              >
                <Token
                  text={t.text}
                  id={t.id}
                  weight={isQuery ? undefined : w}
                  state={isQuery ? 'active' : 'default'}
                  selected={isQuery}
                  title={isQuery ? `Query: ${t.text}` : `${t.text} — weight ${w.toFixed(3)}`}
                  ariaLabel={
                    isQuery
                      ? `Query token ${t.text}`
                      : `Key token ${t.text}, attention weight ${w.toFixed(2)}`
                  }
                  onClick={() => setQueryIdx(i)}
                  onKeyDown={(e) => onTokenKey(e, i)}
                />
              </span>
            );
          })}
        </div>
      </div>

      {/* Readout */}
      <div className="flex items-center justify-between font-mono text-xs">
        <span className="text-muted">
          Query: <span style={{ color: COLOR.active }}>{tokens[safeQuery]?.text}</span>
          <span className="text-faint"> · {head.description}</span>
        </span>
        <span aria-live="polite">
          {readoutKey !== null && readoutWeight !== null ? (
            <span style={{ color: weightToColor(readoutWeight) }}>
              {tokens[readoutKey]?.text} → {readoutWeight.toFixed(3)}
            </span>
          ) : (
            <span className="text-faint">hover or focus a key token</span>
          )}
        </span>
      </div>
    </div>
  );
}

export default AttentionFan;
