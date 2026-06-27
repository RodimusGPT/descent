import {
  ANALOGY,
  CLUSTERS,
  EMBEDDINGS,
  type WordVec,
  analogyPoint,
  distance,
  nearest,
  vec,
} from '@/lib/embeddings';
import { COLOR, withAlpha } from '@/lib/encoding';
import { cosineSimilarity } from '@/lib/nn';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { scaleLinear } from 'd3-scale';
import { type KeyboardEvent, useMemo, useState } from 'react';

/**
 * EmbeddingSpace — a 2D scatter of word embeddings (spec 10.1).
 *
 * Each word is a labelled, focusable point coloured by its semantic cluster.
 * Selecting a point draws faint links to its k nearest neighbours and reads out
 * their (centroid-relative) cosine similarity — making "similar meanings
 * cluster" and "directions encode relationships" visible. A toggle overlays the
 * classic analogy king − man + woman ≈ queen as a pair of parallel vectors.
 *
 * Self-contained: renders from EMBEDDINGS with zero required props.
 */

export interface EmbeddingSpaceProps {
  words?: WordVec[];
  /** Number of nearest neighbours to highlight on selection. */
  k?: number;
  /** Initially selected word (defaults to none — the clustered scatter itself). */
  initialWord?: string;
}

const WIDTH = 820;
const HEIGHT = 460;
const PAD = 44;

/** Categorical palette — one entry per cluster (kept to <= 5). */
const CLUSTER_PALETTE = [
  COLOR.active,
  COLOR.modelAccent,
  COLOR.hwAccent,
  COLOR.activeHot,
  COLOR.inert,
];

function clusterColor(cluster: string): string {
  const i = CLUSTERS.indexOf(cluster);
  return CLUSTER_PALETTE[(i < 0 ? 0 : i) % CLUSTER_PALETTE.length];
}

export function EmbeddingSpace({ words = EMBEDDINGS, k = 4, initialWord }: EmbeddingSpaceProps) {
  const reduced = usePrefersReducedMotion();
  const [selected, setSelected] = useState<string | null>(initialWord ?? null);
  const [showAnalogy, setShowAnalogy] = useState(false);

  // Pixel scales: data lives in [0,100]², padded to a clean inset rectangle.
  const { sx, sy, centroid } = useMemo(() => {
    const xs = words.map((w) => w.x);
    const ys = words.map((w) => w.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const px = (xMax - xMin) * 0.12 || 1;
    const py = (yMax - yMin) * 0.12 || 1;
    const scaleX = scaleLinear()
      .domain([xMin - px, xMax + px])
      .range([PAD, WIDTH - PAD]);
    // y inverted so larger data-y reads "up" on screen.
    const scaleY = scaleLinear()
      .domain([yMin - py, yMax + py])
      .range([HEIGHT - PAD, PAD]);
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
    return { sx: scaleX, sy: scaleY, centroid: { x: cx, y: cy } };
  }, [words]);

  const selectedVec = selected ? vec(selected) : undefined;
  const neighbours = useMemo(
    () => (selectedVec ? nearest(selectedVec.word, k) : []),
    [selectedVec, k],
  );
  const neighbourWords = useMemo(() => new Set(neighbours.map((n) => n.word)), [neighbours]);

  // Centroid-relative cosine similarity: words pointing the same DIRECTION from
  // the cloud's centre share meaning. Reuses the shared nn.cosineSimilarity.
  function simTo(target: WordVec): number {
    if (!selectedVec) return 0;
    return cosineSimilarity(
      [selectedVec.x - centroid.x, selectedVec.y - centroid.y],
      [target.x - centroid.x, target.y - centroid.y],
    );
  }

  const analogyPt = useMemo(() => analogyPoint(ANALOGY.a, ANALOGY.b, ANALOGY.c), []);
  const aVec = vec(ANALOGY.a);
  const bVec = vec(ANALOGY.b);
  const cVec = vec(ANALOGY.c);
  const expectedVec = vec(ANALOGY.expected);

  const lineTransition = reduced ? undefined : 'opacity 200ms ease';

  function onPointKey(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (idx + 1) % words.length;
      setSelected(words[next].word);
      document.getElementById(`emb-pt-${next}`)?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = (idx - 1 + words.length) % words.length;
      setSelected(words[next].word);
      document.getElementById(`emb-pt-${next}`)?.focus();
    } else if (e.key === 'Escape') {
      setSelected(null);
    }
  }

  return (
    <div className="flex w-full max-w-[860px] flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" aria-hidden="true">
          {CLUSTERS.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 font-mono text-xs text-muted">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: clusterColor(c) }}
              />
              {c}
            </span>
          ))}
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 font-mono text-xs text-muted">
          <input
            type="checkbox"
            checked={showAnalogy}
            onChange={(e) => setShowAnalogy(e.target.checked)}
            className="h-3.5 w-3.5 accent-current"
            style={{ color: COLOR.active }}
          />
          show analogy: king − man + woman
        </label>
      </div>

      {/* Scatter */}
      <div className="relative w-full" style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}>
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="Two-dimensional scatter plot of word embeddings, grouped into semantic clusters."
        >
          <defs>
            <marker
              id="emb-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={COLOR.active} />
            </marker>
          </defs>

          {/* Neighbour links from the selected word */}
          {selectedVec &&
            neighbours.map((n) => (
              <line
                key={`link-${n.word}`}
                x1={sx(selectedVec.x)}
                y1={sy(selectedVec.y)}
                x2={sx(n.x)}
                y2={sy(n.y)}
                stroke={withAlpha(COLOR.active, 0.55)}
                strokeWidth={1.5}
                strokeLinecap="round"
                style={{ transition: lineTransition }}
              />
            ))}

          {/* Analogy overlay: two parallel offset vectors (man→king, woman→queen) */}
          {showAnalogy && aVec && bVec && cVec && expectedVec && analogyPt && (
            <g style={{ transition: lineTransition }}>
              <line
                x1={sx(bVec.x)}
                y1={sy(bVec.y)}
                x2={sx(aVec.x)}
                y2={sy(aVec.y)}
                stroke={withAlpha(COLOR.active, 0.7)}
                strokeWidth={2}
                strokeDasharray="4 3"
                markerEnd="url(#emb-arrow)"
              />
              <line
                x1={sx(cVec.x)}
                y1={sy(cVec.y)}
                x2={sx(expectedVec.x)}
                y2={sy(expectedVec.y)}
                stroke={COLOR.active}
                strokeWidth={2}
                markerEnd="url(#emb-arrow)"
              />
              <circle
                cx={sx(analogyPt.x)}
                cy={sy(analogyPt.y)}
                r={11}
                fill="none"
                stroke={COLOR.active}
                strokeWidth={1.5}
              />
            </g>
          )}

          {/* Word labels (decorative; the interactive points are HTML buttons) */}
          {words.map((w) => {
            const dim = selectedVec
              ? selectedVec.word !== w.word && !neighbourWords.has(w.word)
              : false;
            return (
              <text
                key={`lbl-${w.word}`}
                x={sx(w.x) + 8}
                y={sy(w.y) + 3}
                fontFamily="ui-monospace, monospace"
                fontSize={11}
                fill={dim ? COLOR.faint : COLOR.ink}
                style={{ transition: lineTransition }}
              >
                {w.word}
              </text>
            );
          })}
        </svg>

        {/* Interactive points: real, labelled, keyboard-operable buttons. */}
        {words.map((w, i) => {
          const isSelected = selectedVec?.word === w.word;
          const isNeighbour = neighbourWords.has(w.word);
          const dim = selectedVec ? !isSelected && !isNeighbour : false;
          const color = clusterColor(w.cluster);
          const r = isSelected ? 9 : isNeighbour ? 7 : 6;
          const leftPct = (sx(w.x) / WIDTH) * 100;
          const topPct = (sy(w.y) / HEIGHT) * 100;
          return (
            <button
              key={w.word}
              id={`emb-pt-${i}`}
              type="button"
              onClick={() => setSelected(isSelected ? null : w.word)}
              onFocus={() => setSelected(w.word)}
              onKeyDown={(e) => onPointKey(e, i)}
              aria-pressed={isSelected}
              aria-label={`${w.word}, cluster ${w.cluster}`}
              title={`${w.word} · ${w.cluster}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-none"
              style={{
                left: `${leftPct}%`,
                top: `${topPct}%`,
                width: r * 2,
                height: r * 2,
                backgroundColor: dim ? withAlpha(color, 0.3) : color,
                border: isSelected
                  ? `2px solid ${COLOR.ink}`
                  : `1px solid ${withAlpha(color, 0.5)}`,
                boxShadow: isSelected ? `0 0 0 3px ${withAlpha(COLOR.active, 0.45)}` : undefined,
                opacity: dim ? 0.6 : 1,
                transition: reduced
                  ? undefined
                  : 'width 150ms ease, height 150ms ease, opacity 150ms ease',
              }}
            />
          );
        })}
      </div>

      {/* Readout */}
      <div className="min-h-[2.5rem] font-mono text-xs" aria-live="polite">
        {selectedVec ? (
          <div className="flex flex-col gap-1">
            <span className="text-muted">
              Nearest to{' '}
              <span style={{ color: clusterColor(selectedVec.cluster) }}>{selectedVec.word}</span>
              <span className="text-faint"> · cosine similarity (direction from centre)</span>
            </span>
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {neighbours.map((n) => (
                <span key={n.word} className="text-ink">
                  {n.word}{' '}
                  <span style={{ color: clusterColor(n.cluster) }}>{simTo(n).toFixed(2)}</span>
                  <span className="text-faint"> (d {distance(selectedVec, n).toFixed(1)})</span>
                </span>
              ))}
            </span>
          </div>
        ) : (
          <span className="text-faint">
            Select a word to highlight its nearest neighbours, or toggle the analogy.
          </span>
        )}
      </div>
    </div>
  );
}

export default EmbeddingSpace;
