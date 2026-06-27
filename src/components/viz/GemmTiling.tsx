import { COLOR, withAlpha } from '@/lib/encoding';
import { flops, tileArithmeticIntensity, tileCount } from '@/lib/gemm';
import { moveRadioFocus } from '@/lib/roving';
import { useInView } from '@/lib/use-in-view';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * GemmTiling (spec 10.4) — the tiled matrix multiply that runs on tensor cores.
 *
 * Q/K/V projections, the FFN, and the LM head are all GEMMs: C[M×N] = A[M×K]·B[K×N].
 * A GPU computes C one TILE at a time. Each T×T output tile is a small dense
 * matmul of a row-strip of A (T rows × K) by a column-strip of B (K × T cols).
 *
 * We render C as a grid of output tiles. Selecting (or auto-sweeping) a tile
 * highlights the A row-strip and B column-strip it consumes, and a tile-size
 * control drives a live arithmetic-intensity readout: bigger tiles reuse each
 * loaded value across more multiply-accumulates, so flops-per-byte rises. Tensor
 * cores compute these tiles natively in low precision (FP16 / FP8 / FP4).
 *
 * Self-contained: renders with zero required props.
 */

/** Illustrative C dimensions (a square M×N output) and contraction length K. */
const M = 256;
const N = 256;
const K = 1024;

/** Selectable tensor-core tile sides. */
const TILE_SIZES = [32, 64, 128] as const;
type TileSize = (typeof TILE_SIZES)[number];

/** Native tensor-core precisions and their bytes-per-element. */
const PRECISIONS = [
  { key: 'fp16', label: 'FP16', bytes: 2 },
  { key: 'fp8', label: 'FP8', bytes: 1 },
  { key: 'fp4', label: 'FP4', bytes: 0.5 },
] as const;
type PrecisionKey = (typeof PRECISIONS)[number]['key'];

const SWEEP_MS = 700;

export interface GemmTilingProps {
  /** Output rows (M). */
  rows?: number;
  /** Output columns (N). */
  cols?: number;
  /** Contraction length (K). */
  contraction?: number;
}

export function GemmTiling({ rows = M, cols = N, contraction = K }: GemmTilingProps) {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef);

  const [tile, setTile] = useState<TileSize>(64);
  const [precision, setPrecision] = useState<PrecisionKey>('fp16');
  const [selected, setSelected] = useState(0);
  const [sweeping, setSweeping] = useState(!reduced);

  const baseId = useId();
  const precGroupId = `${baseId}-prec`;

  const tilesAcross = Math.ceil(cols / tile);
  const tilesDown = Math.ceil(rows / tile);
  const nTiles = tileCount(rows, cols, tile);

  const bytesPerElem = useMemo(
    () => PRECISIONS.find((p) => p.key === precision)?.bytes ?? 2,
    [precision],
  );

  const ai = tileArithmeticIntensity(tile, contraction, bytesPerElem);
  // Reuse factor: how many flops each loaded byte serves, relative to the
  // smallest tile at this precision — an intuitive "this many× more reuse".
  const baseAi = tileArithmeticIntensity(TILE_SIZES[0], contraction, bytesPerElem);
  const reuse = baseAi > 0 ? ai / baseAi : 1;

  const totalFlops = flops(rows, cols, contraction);

  // Clamp/reset the selected tile whenever the grid shape changes.
  useEffect(() => {
    setSelected((s) => (s >= nTiles ? 0 : s));
  }, [nTiles]);

  // Auto-sweep the selected tile across the grid. Gated on reduced motion,
  // the play toggle, AND visibility (don't animate off-screen).
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (reduced || !sweeping || !inView) return;
    timer.current = setInterval(() => {
      setSelected((s) => (s + 1) % nTiles);
    }, SWEEP_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [reduced, sweeping, inView, nTiles]);

  const selRow = Math.floor(selected / tilesAcross);
  const selCol = selected % tilesAcross;

  const select = useCallback((index: number) => {
    setSweeping(false);
    setSelected(index);
  }, []);

  // Keyboard navigation across the tile grid (arrow keys move the selection).
  const onGridKey = useCallback(
    (e: ReactKeyboardEvent) => {
      let next = selected;
      if (e.key === 'ArrowRight') next = selCol < tilesAcross - 1 ? selected + 1 : selected;
      else if (e.key === 'ArrowLeft') next = selCol > 0 ? selected - 1 : selected;
      else if (e.key === 'ArrowDown')
        next = selRow < tilesDown - 1 ? selected + tilesAcross : selected;
      else if (e.key === 'ArrowUp') next = selRow > 0 ? selected - tilesAcross : selected;
      else return;
      e.preventDefault();
      select(next);
    },
    [selected, selCol, selRow, tilesAcross, tilesDown, select],
  );

  const teal = COLOR.hwAccent;

  return (
    <div
      ref={rootRef}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 text-ink"
    >
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-sm text-ink">Tiled matmul on tensor cores</h3>
        <p className="text-xs text-muted">
          Q/K/V, the FFN, and the LM head are all GEMMs:{' '}
          <span className="font-mono text-ink">C = A·B</span>. The GPU computes the output one{' '}
          <span style={{ color: teal }}>tile</span> at a time — each tile multiplies a row-strip of
          A by a column-strip of B.
        </p>
      </div>

      {/* The A · B = C diagram */}
      <GemmDiagram
        rows={rows}
        cols={cols}
        contraction={contraction}
        tile={tile}
        tilesAcross={tilesAcross}
        tilesDown={tilesDown}
        nTiles={nTiles}
        selected={selected}
        selRow={selRow}
        selCol={selCol}
        teal={teal}
        reduced={reduced}
        onSelect={select}
        onGridKey={onGridKey}
      />

      {/* Tile-size control */}
      <div className="flex flex-col gap-2">
        <label className="text-xs text-muted" htmlFor={`${baseId}-tile`}>
          Tile size{' '}
          <span className="font-mono text-ink">
            {tile}×{tile}
          </span>{' '}
          — {nTiles} output tiles
        </label>
        <input
          id={`${baseId}-tile`}
          type="range"
          min={0}
          max={TILE_SIZES.length - 1}
          step={1}
          value={TILE_SIZES.indexOf(tile)}
          onChange={(e) => setTile(TILE_SIZES[Number(e.target.value)])}
          className="w-full"
          style={{ accentColor: teal }}
          aria-valuetext={`${tile} by ${tile}`}
        />
        <div className="flex justify-between font-mono text-[0.65rem] text-faint">
          {TILE_SIZES.map((t) => (
            <span key={t} style={{ color: t === tile ? teal : undefined }}>
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Precision selector — tensor cores eat low precision natively */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs text-muted" id={precGroupId}>
          Tensor-core precision
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={precGroupId}>
          {PRECISIONS.map((p, i) => {
            const on = p.key === precision;
            return (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => setPrecision(p.key)}
                onKeyDown={(e) =>
                  moveRadioFocus(e, i, PRECISIONS.length, (n) => setPrecision(PRECISIONS[n].key))
                }
                className="rounded-md border px-3 py-1 font-mono text-xs transition-colors"
                style={{
                  borderColor: on ? teal : COLOR.border,
                  backgroundColor: on ? withAlpha(teal, 0.18) : 'transparent',
                  color: on ? teal : COLOR.muted,
                }}
              >
                {p.label}
                <span className="ml-1 text-muted">{p.bytes}B</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Reuse / arithmetic-intensity readout */}
      <div className="grid grid-cols-2 gap-3">
        <Readout
          label="Arithmetic intensity"
          value={ai.toFixed(0)}
          unit="flops / byte"
          accent={teal}
        />
        <Readout
          label="Reuse vs smallest tile"
          value={`${reuse.toFixed(1)}×`}
          unit="per loaded value"
          accent={teal}
        />
      </div>

      <p className="text-xs text-muted">
        Bigger tiles reuse each loaded value across more multiply-accumulates, so{' '}
        <span className="font-mono" style={{ color: teal }}>
          flops / byte
        </span>{' '}
        rises — pushing the kernel off the memory wall toward compute-bound. Narrower elements (FP8
        / FP4) lift it further. Total work for this GEMM:{' '}
        <span className="font-mono tabular-nums text-ink">{formatFlops(totalFlops)}</span>.
      </p>

      {/* Play / pause auto-sweep (only meaningful when motion is allowed) */}
      {!reduced && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSweeping((s) => !s)}
            className="rounded-md border px-3 py-1 font-mono text-xs"
            style={{ borderColor: COLOR.border, color: COLOR.muted }}
          >
            {sweeping ? 'Pause sweep' : 'Sweep tiles'}
          </button>
          <span className="font-mono text-[0.65rem] text-faint">
            tile {selRow + 1},{selCol + 1} of {tilesDown}×{tilesAcross}
          </span>
        </div>
      )}

      <p className="text-[0.7rem] text-faint">
        Tensor cores compute each tile natively in low precision (FP16 / FP8 / FP4), accumulating in
        higher precision. Shown: a {rows}×{cols} output over K={contraction}.
      </p>
    </div>
  );
}

/** The A·B=C panel with highlighted row-strip, column-strip, and output tile. */
function GemmDiagram({
  rows,
  cols,
  contraction,
  tile,
  tilesAcross,
  tilesDown,
  nTiles,
  selected,
  selRow,
  selCol,
  teal,
  reduced,
  onSelect,
  onGridKey,
}: {
  rows: number;
  cols: number;
  contraction: number;
  tile: number;
  tilesAcross: number;
  tilesDown: number;
  nTiles: number;
  selected: number;
  selRow: number;
  selCol: number;
  teal: string;
  reduced: boolean;
  onSelect: (i: number) => void;
  onGridKey: (e: ReactKeyboardEvent) => void;
}) {
  // Layout (viewBox units). A is rows×K, B is K×cols, C is rows×cols. We render
  // K compressed to a fixed strip width so the diagram stays readable.
  const cSide = 150;
  const kStrip = 70;
  const gap = 26;
  const labelPad = 16;

  const aX = 0;
  const cyTop = labelPad;
  const aW = kStrip;
  const aH = cSide;

  const bX = aX + aW + gap;
  const bW = cSide;
  const bH = kStrip;

  const cX = bX;
  const cY = cyTop + bH + gap;
  const w = bX + bW;
  const h = cY + cSide + 4;

  const cellW = cSide / tilesAcross;
  const cellH = cSide / tilesDown;

  const transition = reduced ? undefined : 'all 260ms ease';

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full"
      role="group"
      aria-label={`Tiled matrix multiply C equals A times B. A is ${rows} by ${contraction}, B is ${contraction} by ${cols}, C is ${rows} by ${cols}, split into ${nTiles} tiles of ${tile} by ${tile}. The highlighted output tile at row ${selRow + 1}, column ${selCol + 1} multiplies a row-strip of A by a column-strip of B.`}
    >
      <title>Tiled GEMM: highlighted output tile, A row-strip, and B column-strip</title>

      {/* labels */}
      <text x={aX} y={cyTop - 5} fill={COLOR.faint} fontSize={9} fontFamily="monospace">
        B [K×N]
      </text>
      <text x={aX} y={cY - 5} fill={COLOR.faint} fontSize={9} fontFamily="monospace">
        A [M×K]
      </text>
      <text
        x={cX + cSide}
        y={cY - 5}
        fill={teal}
        fontSize={9}
        fontFamily="monospace"
        textAnchor="end"
      >
        C [M×N]
      </text>

      {/* B matrix — highlight the selected column-strip */}
      <rect
        x={bX}
        y={cyTop}
        width={bW}
        height={bH}
        fill={withAlpha(COLOR.inert, 0.14)}
        stroke={COLOR.border}
        strokeWidth={1}
      />
      <rect
        x={bX + selCol * cellW}
        y={cyTop}
        width={cellW}
        height={bH}
        fill={withAlpha(teal, 0.28)}
        stroke={teal}
        strokeWidth={1.25}
        style={{ transition }}
      />

      {/* A matrix — highlight the selected row-strip */}
      <rect
        x={aX}
        y={cY}
        width={aW}
        height={aH}
        fill={withAlpha(COLOR.inert, 0.14)}
        stroke={COLOR.border}
        strokeWidth={1}
      />
      <rect
        x={aX}
        y={cY + selRow * cellH}
        width={aW}
        height={cellH}
        fill={withAlpha(teal, 0.28)}
        stroke={teal}
        strokeWidth={1.25}
        style={{ transition }}
      />

      {/* C matrix — the grid of output tiles (each a real button) */}
      <rect
        x={cX}
        y={cY}
        width={cSide}
        height={cSide}
        fill={withAlpha(COLOR.surface, 0.5)}
        stroke={COLOR.border}
        strokeWidth={1}
      />
      <g onKeyDown={onGridKey}>
        {Array.from({ length: nTiles }, (_, i) => {
          const r = Math.floor(i / tilesAcross);
          const c = i % tilesAcross;
          const on = i === selected;
          return (
            <rect
              key={i}
              x={cX + c * cellW}
              y={cY + r * cellH}
              width={cellW - 1}
              height={cellH - 1}
              rx={1.5}
              role="button"
              tabIndex={on ? 0 : -1}
              aria-label={`Output tile row ${r + 1} column ${c + 1}${on ? ', selected' : ''}`}
              aria-pressed={on}
              onClick={() => onSelect(i)}
              fill={on ? withAlpha(teal, 0.5) : withAlpha(teal, 0.1)}
              stroke={on ? teal : withAlpha(teal, 0.3)}
              strokeWidth={on ? 1.5 : 0.75}
              style={{ cursor: 'pointer', transition }}
            />
          );
        })}
      </g>
    </svg>
  );
}

function Readout({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent: string;
}) {
  const style: CSSProperties = { color: accent };
  return (
    <div className="rounded-md border border-border bg-surface-raised p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="font-mono text-lg tabular-nums" style={style}>
        {value}
      </div>
      <div className="text-[0.7rem] text-faint">{unit}</div>
    </div>
  );
}

/** Human-readable flop count (GFLOP/TFLOP). */
function formatFlops(f: number): string {
  if (f >= 1e12) return `${(f / 1e12).toFixed(1)} TFLOP`;
  if (f >= 1e9) return `${(f / 1e9).toFixed(1)} GFLOP`;
  if (f >= 1e6) return `${(f / 1e6).toFixed(1)} MFLOP`;
  return `${f} FLOP`;
}

export default GemmTiling;
