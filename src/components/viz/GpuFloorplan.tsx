import { COLOR, lerpColor, withAlpha } from '@/lib/encoding';
import { GPU_SPEC, MEMORY_TIERS, type MemoryTier, totalTensorCores } from '@/lib/gpu';
import { useInView } from '@/lib/use-in-view';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * GpuFloorplan (spec 10.4) — the chip, and the steep memory hierarchy that feeds it.
 *
 * Left: a 2-D floorplan of the die — a grid of streaming multiprocessors (each
 * hinting its tensor cores), flanked by HBM stacks at the edges. Right: the
 * memory pyramid — a wide HBM base narrowing to a registers tip, each tier
 * labelled with its size and bandwidth relative to HBM. The teaching is the
 * inversion: the higher (faster) the tier, the SMALLER it is, and the whole job
 * of fast inference is keeping the cores fed across that gap.
 *
 * Pick the SM array or any memory tier (radiogroup, or hover/click the diagram)
 * to highlight it and read its stats. Teal hardware accent throughout. Keyboard-
 * operable and reduced-motion safe; the "data flowing into the cores" shimmer
 * pauses off-screen and under reduced motion.
 *
 * Self-contained: renders with zero required props.
 */

/** A selectable focus: the compute array, or one named memory tier. */
type Selection = 'sm' | string;

const COMPUTE: Selection = 'sm';

/** Floorplan SM grid dimensions (cols x rows ≈ GPU_SPEC.sms). */
const COLS = 12;
const ROWS = Math.ceil(GPU_SPEC.sms / COLS);

/** Floorplan SVG geometry. */
const FP_W = 360;
const FP_H = 320;
const HBM_W = 30; // width of each flanking HBM stack column
const HBM_STACKS = 5; // stacks per side
const DIE_PAD = 10;
const DIE_X = HBM_W + 14;
const DIE_W = FP_W - 2 * (HBM_W + 14);

/** Pyramid SVG geometry. */
const PY_W = 360;
const PY_H = 320;
const PY_MAXW = 300;
const PY_TIPW = 64;
const PY_TOP = 18;
const PY_BOTTOM = 300;

export interface GpuFloorplanProps {
  /** Initial selection: 'sm' or a MEMORY_TIERS name. */
  initialSelection?: Selection;
}

/** The ordered list of selectable items: compute first, then the tiers tip→base reads top→bottom. */
const ITEMS: { key: Selection; label: string }[] = [
  { key: COMPUTE, label: 'SM array (compute)' },
  ...MEMORY_TIERS.map((t) => ({ key: t.name, label: t.name })),
];

export function GpuFloorplan({ initialSelection = 'HBM' }: GpuFloorplanProps) {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef);

  const baseId = useId();
  const groupId = `${baseId}-items`;

  const startIndex = Math.max(
    0,
    ITEMS.findIndex((it) => it.key === initialSelection),
  );
  const [index, setIndex] = useState<number>(startIndex);
  const [hovered, setHovered] = useState<Selection | null>(null);

  const selected: Selection = ITEMS[Math.min(index, ITEMS.length - 1)]?.key ?? COMPUTE;
  /** Hover takes visual precedence so the diagram feels live, falling back to selection. */
  const active: Selection = hovered ?? selected;

  // "Cores being fed" shimmer — a wave sweeping across the SM grid. Paused when
  // reduced-motion is requested or the visual is scrolled off-screen.
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (reduced || !inView) return;
    const id = setInterval(() => setPhase((p) => p + 0.32), 90);
    return () => clearInterval(id);
  }, [reduced, inView]);

  const activeTier: MemoryTier | undefined = useMemo(
    () => MEMORY_TIERS.find((t) => t.name === active),
    [active],
  );

  // Precompute SM cell rects within the die.
  const cells = useMemo(() => {
    const gap = 3;
    const innerX = DIE_X + DIE_PAD;
    const innerY = DIE_PAD + 8;
    const innerW = DIE_W - 2 * DIE_PAD;
    const innerH = FP_H - 2 * (DIE_PAD + 8);
    const cw = (innerW - (COLS - 1) * gap) / COLS;
    const ch = (innerH - (ROWS - 1) * gap) / ROWS;
    const out: { x: number; y: number; w: number; h: number; i: number }[] = [];
    for (let i = 0; i < GPU_SPEC.sms; i++) {
      const r = Math.floor(i / COLS);
      const c = i % COLS;
      out.push({ x: innerX + c * (cw + gap), y: innerY + r * (ch + gap), w: cw, h: ch, i });
    }
    return out;
  }, []);

  const smActive = active === COMPUTE;
  const hbmActive = active === 'HBM';

  const cardTransition = reduced
    ? undefined
    : 'border-color 180ms ease, background-color 180ms ease';

  return (
    <div
      ref={rootRef}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 text-ink"
    >
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-sm text-ink">
          A GPU — many cores, fed by a steep memory hierarchy
        </h3>
        <p className="text-xs text-muted">
          {GPU_SPEC.name}: {GPU_SPEC.sms} SMs &times; {GPU_SPEC.tensorCoresPerSm} tensor cores ={' '}
          {totalTensorCores()} cores, behind {GPU_SPEC.hbmGB} GB of HBM. The higher up the memory
          pyramid, the faster &mdash; and the smaller. Keeping the cores fed is the whole game.
        </p>
      </div>

      <div className="flex flex-col gap-4 md:flex-row">
        {/* ── Floorplan ─────────────────────────────────────────────── */}
        <figure className="m-0 flex-1">
          <svg
            viewBox={`0 0 ${FP_W} ${FP_H}`}
            className="w-full"
            role="img"
            aria-label={`Chip floorplan: ${GPU_SPEC.sms} streaming multiprocessors in a ${COLS} by ${ROWS} grid, flanked by HBM memory stacks.`}
          >
            {/* die substrate */}
            <rect
              x={DIE_X}
              y={DIE_PAD}
              width={DIE_W}
              height={FP_H - 2 * DIE_PAD}
              rx={8}
              fill={withAlpha(COLOR.hwAccent, smActive ? 0.08 : 0.04)}
              stroke={smActive ? COLOR.active : withAlpha(COLOR.hwAccent, 0.5)}
              strokeWidth={smActive ? 2 : 1}
              style={cardTransition ? { transition: cardTransition } : undefined}
            />

            {/* HBM stacks, left + right edges */}
            {[0, 1].map((side) => {
              const x = side === 0 ? 0 : FP_W - HBM_W;
              const stackH = (FP_H - 2 * DIE_PAD - (HBM_STACKS - 1) * 6) / HBM_STACKS;
              return (
                <g
                  key={`hbm-${side}`}
                  onMouseEnter={() => setHovered('HBM')}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setIndex(ITEMS.findIndex((it) => it.key === 'HBM'))}
                  style={{ cursor: 'pointer' }}
                >
                  {Array.from({ length: HBM_STACKS }, (_, s) => (
                    <rect
                      key={s}
                      x={x + 2}
                      y={DIE_PAD + s * (stackH + 6)}
                      width={HBM_W - 4}
                      height={stackH}
                      rx={3}
                      fill={withAlpha(COLOR.hwAccent, hbmActive ? 0.55 : 0.28)}
                      stroke={hbmActive ? COLOR.active : withAlpha(COLOR.hwAccent, 0.6)}
                      strokeWidth={hbmActive ? 1.5 : 1}
                      style={cardTransition ? { transition: cardTransition } : undefined}
                    />
                  ))}
                </g>
              );
            })}
            <text
              x={HBM_W / 2}
              y={FP_H - 1}
              textAnchor="middle"
              fontSize={9}
              fill={COLOR.faint}
              className="font-mono"
            >
              HBM
            </text>
            <text
              x={FP_W - HBM_W / 2}
              y={FP_H - 1}
              textAnchor="middle"
              fontSize={9}
              fill={COLOR.faint}
              className="font-mono"
            >
              HBM
            </text>

            {/* SM grid */}
            <g
              onMouseEnter={() => setHovered(COMPUTE)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setIndex(ITEMS.findIndex((it) => it.key === COMPUTE))}
              style={{ cursor: 'pointer' }}
            >
              {cells.map((cell) => {
                // Shimmer wave across the grid (static at base level when paused).
                const wave = reduced
                  ? 0.5
                  : 0.5 + 0.5 * Math.sin(phase - (cell.x + cell.y) * 0.025);
                const fillA = smActive ? 0.22 + 0.5 * wave : 0.12 + 0.22 * wave;
                const coreColor = lerpColor(COLOR.hwAccent, COLOR.active, smActive ? 0.35 : 0);
                return (
                  <g key={cell.i}>
                    <rect
                      x={cell.x}
                      y={cell.y}
                      width={cell.w}
                      height={cell.h}
                      rx={1.5}
                      fill={withAlpha(coreColor, fillA)}
                      stroke={withAlpha(COLOR.hwAccent, smActive ? 0.7 : 0.35)}
                      strokeWidth={0.6}
                    />
                    {/* tensor-core hints: a 2x2 dot cluster */}
                    {GPU_SPEC.tensorCoresPerSm >= 1 &&
                      Array.from({ length: Math.min(4, GPU_SPEC.tensorCoresPerSm) }, (_, k) => {
                        const dx = cell.w * (k % 2 === 0 ? 0.32 : 0.68);
                        const dy = cell.h * (k < 2 ? 0.34 : 0.66);
                        return (
                          <circle
                            key={k}
                            cx={cell.x + dx}
                            cy={cell.y + dy}
                            r={Math.max(0.7, cell.w * 0.07)}
                            fill={withAlpha(
                              smActive ? COLOR.active : COLOR.hwAccent,
                              0.4 + 0.5 * wave,
                            )}
                          />
                        );
                      })}
                  </g>
                );
              })}
            </g>
          </svg>
          <figcaption className="mt-1 text-center text-[0.7rem] text-faint">
            {GPU_SPEC.sms} SMs &middot; tensor cores hinted as dot clusters
          </figcaption>
        </figure>

        {/* ── Memory pyramid ────────────────────────────────────────── */}
        <figure className="m-0 flex-1">
          <svg
            viewBox={`0 0 ${PY_W} ${PY_H}`}
            className="w-full"
            role="img"
            aria-label="Memory pyramid: HBM forms the wide slow base, narrowing up through L2 and SRAM to the tiny, fastest registers at the tip."
          >
            {MEMORY_TIERS.map((tier, idx) => {
              // tier[0] = HBM (base, widest, bottom). Stack upward toward the tip.
              const n = MEMORY_TIERS.length;
              const bandH = (PY_BOTTOM - PY_TOP) / n;
              // band i sits at the bottom for i=0.
              const yBottom = PY_BOTTOM - idx * bandH;
              const yTop = yBottom - bandH;
              const fracB = idx / n;
              const fracT = (idx + 1) / n;
              const wB = PY_MAXW - (PY_MAXW - PY_TIPW) * fracB;
              const wT = PY_MAXW - (PY_MAXW - PY_TIPW) * fracT;
              const cx = PY_W / 2;
              const isActive = active === tier.name;
              const points = [
                `${cx - wB / 2},${yBottom}`,
                `${cx + wB / 2},${yBottom}`,
                `${cx + wT / 2},${yTop}`,
                `${cx - wT / 2},${yTop}`,
              ].join(' ');
              return (
                <g
                  key={tier.name}
                  onMouseEnter={() => setHovered(tier.name)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setIndex(ITEMS.findIndex((it) => it.key === tier.name))}
                  style={{ cursor: 'pointer' }}
                >
                  <polygon
                    points={points}
                    fill={withAlpha(COLOR.hwAccent, isActive ? 0.5 : 0.14 + idx * 0.04)}
                    stroke={isActive ? COLOR.active : withAlpha(COLOR.hwAccent, 0.6)}
                    strokeWidth={isActive ? 2 : 1}
                    style={cardTransition ? { transition: cardTransition } : undefined}
                  />
                  <text
                    x={cx}
                    y={(yTop + yBottom) / 2 - 2}
                    textAnchor="middle"
                    fontSize={12}
                    fill={isActive ? COLOR.active : COLOR.ink}
                    className="font-mono"
                  >
                    {tier.name}
                  </text>
                  <text
                    x={cx}
                    y={(yTop + yBottom) / 2 + 13}
                    textAnchor="middle"
                    fontSize={10}
                    fill={COLOR.muted}
                    className="font-mono"
                  >
                    {formatBytes(tier.bytes)} &middot; {formatSpeed(tier.relSpeed)}
                  </text>
                </g>
              );
            })}
            {/* axis hints */}
            <text
              x={6}
              y={PY_TOP + 4}
              textAnchor="start"
              fontSize={9}
              fill={COLOR.faint}
              className="font-mono"
            >
              faster ↑ smaller
            </text>
            <text
              x={6}
              y={PY_BOTTOM + 14}
              textAnchor="start"
              fontSize={9}
              fill={COLOR.faint}
              className="font-mono"
            >
              slower ↓ bigger
            </text>
          </svg>
          <figcaption className="mt-1 text-center text-[0.7rem] text-faint">
            HBM ~{GPU_SPEC.hbmBandwidthTBs} TB/s baseline &middot; SRAM ~10-30x faster, KBs not GBs
          </figcaption>
        </figure>
      </div>

      {/* ── Selector (keyboard) ───────────────────────────────────── */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs text-muted" id={groupId}>
          Inspect a layer
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={groupId}>
          {ITEMS.map((it, i) => {
            const isSel = i === index;
            return (
              <button
                key={it.key}
                type="button"
                role="radio"
                aria-checked={isSel}
                tabIndex={isSel ? 0 : -1}
                onClick={() => setIndex(i)}
                onMouseEnter={() => setHovered(it.key)}
                onMouseLeave={() => setHovered(null)}
                onKeyDown={(e) => moveRadioFocus(e, index, ITEMS.length, setIndex)}
                className="rounded-md border px-3 py-1 font-mono text-sm transition-colors"
                style={{
                  borderColor: isSel ? COLOR.hwAccent : COLOR.border,
                  backgroundColor: isSel ? withAlpha(COLOR.hwAccent, 0.18) : 'transparent',
                  color: isSel ? COLOR.hwAccent : COLOR.muted,
                }}
              >
                {it.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* ── Readout ───────────────────────────────────────────────── */}
      <div className="rounded-md border border-border bg-surface-raised p-3" aria-live="polite">
        {smActive ? (
          <div className="flex flex-col gap-1">
            <div className="font-mono text-sm" style={{ color: COLOR.active }}>
              Streaming multiprocessor &times; {GPU_SPEC.sms}
            </div>
            <div className="text-xs text-muted">
              Each SM packs {GPU_SPEC.tensorCoresPerSm} tensor cores ({totalTensorCores()} across
              the die) plus {GPU_SPEC.smemKBPerSm} KB of its own SRAM. The cores are voracious; the
              hierarchy on the right exists to keep them fed.
            </div>
          </div>
        ) : activeTier ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-mono text-sm" style={{ color: COLOR.hwAccent }}>
                {activeTier.name}
              </span>
              <Stat label="size" value={formatBytes(activeTier.bytes)} />
              <Stat label="vs HBM" value={formatSpeed(activeTier.relSpeed)} />
              <Stat label="bandwidth" value={`~${activeTier.bandwidthTBs} TB/s`} />
            </div>
            <div className="text-xs text-muted">{activeTier.blurb}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Standard ARIA radiogroup keyboard nav: arrows move + select with wraparound,
 * moving focus to the newly selected radio (roving tabindex driven by props).
 */
function moveRadioFocus(
  e: KeyboardEvent<HTMLButtonElement>,
  currentIndex: number,
  count: number,
  setIndex: (i: number) => void,
): void {
  let next: number;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (currentIndex + 1) % count;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (currentIndex - 1 + count) % count;
  else return;
  e.preventDefault();
  setIndex(next);
  const radios = e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]');
  radios?.[next]?.focus();
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="font-mono text-xs tabular-nums text-ink">
      <span className="text-faint">{label} </span>
      {value}
    </span>
  );
}

/** Human-readable bytes for tier sizes (B / KB / MB / GB, base-1000). */
function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${trim(bytes / 1e9)} GB`;
  if (bytes >= 1e6) return `${trim(bytes / 1e6)} MB`;
  if (bytes >= 1e3) return `${trim(bytes / 1e3)} KB`;
  return `${trim(bytes)} B`;
}

/** Relative-speed label, e.g. "1x", "20x". */
function formatSpeed(rel: number): string {
  return `${trim(rel)}x`;
}

function trim(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export default GpuFloorplan;
