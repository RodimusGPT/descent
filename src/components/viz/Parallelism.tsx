import { COLOR, lerpColor, withAlpha } from '@/lib/encoding';
import { STRATEGIES, type StrategyKey, pipelineBubbleFraction } from '@/lib/parallelism';
import { useInView } from '@/lib/use-in-view';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { type CSSProperties, useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * Parallelism (spec 10.4) — the three ways to split a model across devices.
 *
 * Pick a strategy and watch what gets sharded and what communicates:
 *
 *   TENSOR PARALLEL — every device holds a SHARD of each layer's weight matrix;
 *     an ALL-REDUCE converges the partial activations and broadcasts the sum back
 *     every layer (animated dots dive to the bus and return).
 *
 *   PIPELINE PARALLEL — devices own consecutive layer ranges (stages); a Gantt
 *     timeline shows microbatches flowing stage→stage with the idle "bubble"
 *     drawn explicitly. A microbatch control shrinks the bubble live, driven by
 *     `pipelineBubbleFraction`.
 *
 *   EXPERT PARALLEL — MoE experts spread across devices; tokens are shuffled to
 *     the device holding their expert with an ALL-TO-ALL (crossing route arcs).
 *
 * Self-contained: renders with zero required props. Animation is gated on reduced
 * motion and on-screen visibility; a meaningful static frame renders otherwise.
 */

const W = 760;
const MIN_DEV = 2;
const MAX_DEV = 6;
const MIN_MB = 1;
const MAX_MB = 12;
const TICK_MS = 90;
const CYCLE = 26; // frames per all-reduce / all-to-all loop

/** Selected-pill styling, mirrors the other hardware interactives. */
function pill(active: boolean): CSSProperties {
  return {
    borderColor: active ? COLOR.hwAccent : COLOR.border,
    backgroundColor: active ? withAlpha(COLOR.hwAccent, 0.16) : 'transparent',
    color: active ? COLOR.hwAccent : COLOR.muted,
  };
}

// ---------------------------------------------------------------------------
// Tensor-parallel scene: a row of devices each holding a sharded matrix, joined
// by an all-reduce bus. Dots converge to the bus (sum) then broadcast back up.
// ---------------------------------------------------------------------------
function TensorScene({ n, u, reduced }: { n: number; u: number; reduced: boolean }) {
  const padX = 16;
  const gap = 14;
  const dw = (W - padX * 2 - gap * (n - 1)) / n;
  const topY = 14;
  const dh = 104;
  const busY = topY + dh + 52;
  const rows = 6;

  // Animation phase: 0..0.5 dive down (converge), 0.5..1 rise back (broadcast).
  const diving = reduced ? false : u < 0.5;
  const prog = reduced ? 1 : diving ? u / 0.5 : 1 - (u - 0.5) / 0.5;
  const centerX = W / 2;

  const devs = Array.from({ length: n }, (_, i) => {
    const x = padX + i * (dw + gap);
    return { i, x, cx: x + dw / 2 };
  });

  return (
    <>
      {devs.map((d) => {
        // mini weight-matrix: columns = devices, this device owns column d.i
        const mPad = 12;
        const mx = d.x + mPad;
        const my = topY + 30;
        const mw = dw - mPad * 2;
        const mh = dh - 42;
        const cw = mw / n;
        const ch = mh / rows;
        return (
          <g key={d.i}>
            <rect
              x={d.x}
              y={topY}
              width={dw}
              height={dh}
              rx={8}
              fill={withAlpha(COLOR.hwAccent, 0.05)}
              stroke={withAlpha(COLOR.hwAccent, 0.55)}
            />
            <text
              x={d.x + 10}
              y={topY + 18}
              fontSize={11}
              fill={COLOR.muted}
              fontFamily="monospace"
            >
              dev {d.i}
            </text>
            {Array.from({ length: rows }, (_, r) =>
              Array.from({ length: n }, (_, c) => {
                const mine = c === d.i;
                return (
                  <rect
                    key={`${r}-${c}`}
                    x={mx + c * cw + 0.5}
                    y={my + r * ch + 0.5}
                    width={cw - 1}
                    height={ch - 1}
                    fill={mine ? withAlpha(COLOR.active, 0.85) : withAlpha(COLOR.inert, 0.3)}
                  />
                );
              }),
            )}
            {/* connector from device to bus */}
            <line
              x1={d.cx}
              y1={topY + dh}
              x2={d.cx}
              y2={busY}
              stroke={withAlpha(COLOR.hwAccent, 0.5)}
              strokeWidth={1.5}
            />
          </g>
        );
      })}

      {/* all-reduce bus */}
      <line x1={padX} y1={busY} x2={W - padX} y2={busY} stroke={COLOR.hwAccent} strokeWidth={2} />
      <text
        x={W - padX}
        y={busY + 20}
        fontSize={11}
        fill={COLOR.hwAccent}
        textAnchor="end"
        fontFamily="monospace"
      >
        all-reduce activations · every layer
      </text>

      {/* converging / broadcasting dots */}
      {devs.map((d) => {
        // dive: device → bus along its connector, then slide toward center along bus.
        // broadcast: reverse.
        const yTop = topY + dh;
        const dotY = lerpFloat(yTop, busY, Math.min(1, prog * 1.4));
        const slide = Math.max(0, prog - 0.7) / 0.3; // last leg slides to center on the bus
        const dotX = prog >= 0.7 ? lerpFloat(d.cx, centerX, slide) : d.cx;
        const onBus = prog >= 0.7;
        const cx = onBus ? dotX : d.cx;
        const cy = onBus ? busY : dotY;
        return (
          <circle
            key={d.i}
            cx={cx}
            cy={cy}
            r={4}
            fill={diving ? COLOR.active : COLOR.hwAccent}
            opacity={0.95}
          />
        );
      })}
      {/* the summed value sitting on the bus center */}
      <circle cx={centerX} cy={busY} r={5} fill={COLOR.hwAccent} opacity={prog > 0.6 ? 1 : 0.3} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Expert-parallel scene: a row of devices each holding experts, with all-to-all
// crossing arcs routing tokens to the device that owns their chosen expert.
// ---------------------------------------------------------------------------
function ExpertScene({ n, u, reduced }: { n: number; u: number; reduced: boolean }) {
  const padX = 16;
  const gap = 14;
  const dw = (W - padX * 2 - gap * (n - 1)) / n;
  const topY = 14;
  const dh = 96;
  const fabricY = topY + dh + 70;

  const devs = Array.from({ length: n }, (_, i) => {
    const x = padX + i * (dw + gap);
    return { i, x, cx: x + dw / 2, portY: topY + dh };
  });

  // deterministic routing permutation: token from device i goes to (i*2+1) % n
  const target = (i: number) => (i * 2 + 1) % n;
  // packet progress along each arc (all routes fire at once = all-to-all)
  const prog = reduced ? 0.5 : u;

  const expertsPer = 2;

  return (
    <>
      {devs.map((d) => {
        const ew = (dw - 24) / expertsPer;
        return (
          <g key={d.i}>
            <rect
              x={d.x}
              y={topY}
              width={dw}
              height={dh}
              rx={8}
              fill={withAlpha(COLOR.hwAccent, 0.05)}
              stroke={withAlpha(COLOR.hwAccent, 0.55)}
            />
            <text
              x={d.x + 10}
              y={topY + 18}
              fontSize={11}
              fill={COLOR.muted}
              fontFamily="monospace"
            >
              dev {d.i}
            </text>
            {Array.from({ length: expertsPer }, (_, e) => {
              const idx = d.i * expertsPer + e;
              return (
                <g key={e}>
                  <rect
                    x={d.x + 12 + e * ew}
                    y={topY + 30}
                    width={ew - 8}
                    height={dh - 44}
                    rx={5}
                    fill={withAlpha(COLOR.active, 0.7)}
                    stroke={withAlpha(COLOR.active, 0.9)}
                  />
                  <text
                    x={d.x + 12 + e * ew + (ew - 8) / 2}
                    y={topY + 30 + (dh - 44) / 2 + 4}
                    fontSize={11}
                    fill={COLOR.ink}
                    textAnchor="middle"
                    fontFamily="monospace"
                  >
                    E{idx}
                  </text>
                </g>
              );
            })}
            <line
              x1={d.cx}
              y1={d.portY}
              x2={d.cx}
              y2={d.portY + 16}
              stroke={withAlpha(COLOR.hwAccent, 0.5)}
              strokeWidth={1.5}
            />
          </g>
        );
      })}

      {/* all-to-all crossing arcs through the routing fabric */}
      {devs.map((d) => {
        const t = target(d.i);
        const sx = d.cx;
        const ex = devs[t].cx;
        const sy = d.portY + 16;
        const ey = d.portY + 16;
        const dip = fabricY + (Math.abs(d.i - t) + 1) * 8;
        const path = `M ${sx} ${sy} Q ${(sx + ex) / 2} ${dip} ${ex} ${ey}`;
        // packet position along the quadratic Bézier
        const p = prog;
        const mx = (sx + ex) / 2;
        const px = (1 - p) * (1 - p) * sx + 2 * (1 - p) * p * mx + p * p * ex;
        const py = (1 - p) * (1 - p) * sy + 2 * (1 - p) * p * dip + p * p * ey;
        return (
          <g key={d.i}>
            <path d={path} fill="none" stroke={withAlpha(COLOR.hwAccent, 0.45)} strokeWidth={1.5} />
            <circle cx={px} cy={py} r={4} fill={COLOR.hwAccent} />
          </g>
        );
      })}
      <text
        x={W - padX}
        y={fabricY + 56}
        fontSize={11}
        fill={COLOR.hwAccent}
        textAnchor="end"
        fontFamily="monospace"
      >
        all-to-all token routing
      </text>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pipeline-parallel scene: stages as rows, a Gantt grid of microbatches flowing
// stage→stage, with the idle bubble drawn explicitly. A diagonal wavefront
// sweeps the active cells in execution order.
// ---------------------------------------------------------------------------
function PipelineScene({
  n,
  microbatches,
  wave,
  reduced,
}: {
  n: number;
  microbatches: number;
  wave: number;
  reduced: boolean;
}) {
  const gx = 86;
  const gyTop = 30;
  const T = microbatches + n - 1; // total time slots
  const cellH = 26;
  const gw = W - gx - 16;
  const cellW = Math.min(gw / T, 36);
  const litUpTo = reduced ? T : wave;

  const rows = Array.from({ length: n }, (_, s) => s);
  const cols = Array.from({ length: T }, (_, t) => t);

  return (
    <>
      {rows.map((s) => {
        const y = gyTop + s * cellH;
        return (
          <g key={s}>
            <text
              x={8}
              y={y + cellH / 2 + 4}
              fontSize={11}
              fill={COLOR.muted}
              fontFamily="monospace"
            >
              dev {s}
            </text>
            <text
              x={70}
              y={y + cellH / 2 + 4}
              fontSize={9}
              fill={COLOR.faint}
              textAnchor="end"
              fontFamily="monospace"
            >
              L{s}
            </text>
            {cols.map((t) => {
              const x = gx + t * cellW;
              // stage s processes microbatch (t - s) when it is in flight
              const mb = t - s;
              const active = mb >= 0 && mb < microbatches;
              const lit = active && t <= litUpTo;
              let fill: string;
              let stroke = withAlpha(COLOR.border, 0.6);
              if (!active) {
                // bubble — idle stage time
                fill = withAlpha(COLOR.inert, 0.18);
              } else if (lit) {
                fill = withAlpha(
                  lerpColor(COLOR.active, COLOR.activeHot, mb / Math.max(1, microbatches - 1)),
                  0.9,
                );
                stroke = withAlpha(COLOR.active, 0.9);
              } else {
                fill = withAlpha(COLOR.active, 0.18);
              }
              return (
                <g key={t}>
                  <rect
                    x={x + 1}
                    y={y + 1}
                    width={cellW - 2}
                    height={cellH - 2}
                    rx={3}
                    fill={fill}
                    stroke={stroke}
                  />
                  {active && cellW > 18 && (
                    <text
                      x={x + cellW / 2}
                      y={y + cellH / 2 + 4}
                      fontSize={10}
                      fill={lit ? COLOR.ink : COLOR.faint}
                      textAnchor="middle"
                      fontFamily="monospace"
                    >
                      {mb}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
      {/* labels */}
      <text
        x={gx}
        y={gyTop + n * cellH + 18}
        fontSize={11}
        fill={COLOR.muted}
        fontFamily="monospace"
      >
        time →
      </text>
      <g>
        <rect
          x={gx + 60}
          y={gyTop + n * cellH + 8}
          width={12}
          height={12}
          rx={2}
          fill={withAlpha(COLOR.inert, 0.18)}
          stroke={withAlpha(COLOR.border, 0.6)}
        />
        <text
          x={gx + 78}
          y={gyTop + n * cellH + 18}
          fontSize={11}
          fill={COLOR.faint}
          fontFamily="monospace"
        >
          bubble (idle)
        </text>
      </g>
    </>
  );
}

function lerpFloat(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export interface ParallelismProps {
  initialStrategy?: StrategyKey;
}

export function Parallelism({ initialStrategy = 'tp' }: ParallelismProps) {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const inView = useInView(rootRef);

  const [strategy, setStrategy] = useState<StrategyKey>(initialStrategy);
  const [devices, setDevices] = useState(4);
  const [microbatches, setMicrobatches] = useState(4);
  const [playing, setPlaying] = useState(true);

  const baseId = useId();
  const stratGroupId = `${baseId}-strat`;
  const devId = `${baseId}-dev`;
  const mbId = `${baseId}-mb`;

  const [tick, setTick] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (reduced || !playing || !inView) return;
    timer.current = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [reduced, playing, inView]);

  const u = (tick % CYCLE) / CYCLE;
  const T = microbatches + devices - 1;
  const wave = tick % (T + 4); // pp wavefront slot (with a brief pause past the end)

  const meta = useMemo(
    () => STRATEGIES.find((s) => s.key === strategy) ?? STRATEGIES[0],
    [strategy],
  );
  const bubble = pipelineBubbleFraction(devices, microbatches);

  // scene height per strategy
  const svgH =
    strategy === 'tp'
      ? 14 + 104 + 52 + 30
      : strategy === 'ep'
        ? 14 + 96 + 70 + 64
        : 30 + devices * 26 + 34;

  const ariaLabel =
    strategy === 'tp'
      ? `Tensor parallel across ${devices} devices: each holds a shard of every weight matrix, joined by an all-reduce each layer.`
      : strategy === 'pp'
        ? `Pipeline parallel across ${devices} stages with ${microbatches} microbatches: the idle bubble is ${(bubble * 100).toFixed(0)} percent.`
        : `Expert parallel across ${devices} devices: experts are distributed and tokens routed with an all-to-all.`;

  const panel: CSSProperties = { backgroundColor: COLOR.surface, borderColor: COLOR.border };

  return (
    <section
      ref={rootRef}
      className="mx-auto flex w-full max-w-[900px] flex-col gap-4 rounded-xl border p-4 font-sans text-ink sm:p-5"
      style={panel}
      aria-label="Model parallelism strategies"
    >
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-sm text-ink">Splitting a model across devices</h3>
        <p className="text-xs text-muted">
          Three axes of parallelism. Each shards a different unit and pays a different communication
          cost.
        </p>
      </div>

      {/* strategy selector */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs text-muted" id={stratGroupId}>
          Strategy
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={stratGroupId}>
          {STRATEGIES.map((s) => {
            const active = s.key === strategy;
            return (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setStrategy(s.key)}
                className="rounded-md border px-3 py-1 font-mono text-sm transition-colors"
                style={pill(active)}
              >
                {s.key.toUpperCase()} · {s.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* the scene */}
      <svg
        viewBox={`0 0 ${W} ${svgH}`}
        className="w-full"
        role="img"
        aria-label={ariaLabel}
        style={{ backgroundColor: withAlpha(COLOR.hwAccent, 0.02) }}
      >
        {strategy === 'tp' && <TensorScene n={devices} u={u} reduced={reduced} />}
        {strategy === 'ep' && <ExpertScene n={devices} u={u} reduced={reduced} />}
        {strategy === 'pp' && (
          <PipelineScene n={devices} microbatches={microbatches} wave={wave} reduced={reduced} />
        )}
      </svg>

      {/* controls */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={devId} className="flex items-baseline justify-between text-xs text-muted">
            <span>{strategy === 'pp' ? 'Devices (stages)' : 'Devices'}</span>
            <span className="font-mono tabular-nums" style={{ color: COLOR.hwAccent }}>
              {devices}
            </span>
          </label>
          <input
            id={devId}
            type="range"
            min={MIN_DEV}
            max={MAX_DEV}
            step={1}
            value={devices}
            onChange={(e) => setDevices(Number(e.target.value))}
            className="w-full accent-active"
            aria-valuetext={`${devices} devices`}
          />
        </div>

        {strategy === 'pp' ? (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={mbId}
              className="flex items-baseline justify-between text-xs text-muted"
            >
              <span>Microbatches</span>
              <span className="font-mono tabular-nums" style={{ color: COLOR.active }}>
                {microbatches}
              </span>
            </label>
            <input
              id={mbId}
              type="range"
              min={MIN_MB}
              max={MAX_MB}
              step={1}
              value={microbatches}
              onChange={(e) => setMicrobatches(Number(e.target.value))}
              className="w-full accent-active"
              aria-valuetext={`${microbatches} microbatches`}
            />
          </div>
        ) : (
          <div className="flex items-end">
            {!reduced && (
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                className="rounded-md border px-3 py-1 font-mono text-xs transition-colors"
                style={pill(false)}
                aria-pressed={playing}
              >
                {playing ? 'Pause' : 'Play'} communication
              </button>
            )}
          </div>
        )}
      </div>

      {/* pipeline bubble readout (PP only) */}
      {strategy === 'pp' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-xs text-muted">
            <span>Pipeline bubble — idle stage time</span>
            <span className="font-mono tabular-nums" style={{ color: COLOR.inert }}>
              {(bubble * 100).toFixed(1)}%
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: withAlpha(COLOR.active, 0.7) }}
            role="img"
            aria-label={`${(bubble * 100).toFixed(0)} percent of stage time is idle bubble`}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${bubble * 100}%`,
                backgroundColor: COLOR.inert,
                transition: reduced ? undefined : 'width 200ms ease',
              }}
            />
          </div>
          <p className="text-[0.7rem] text-faint">
            More microbatches keep every stage busier — the bubble shrinks toward zero.
          </p>
        </div>
      )}

      {/* strategy readout from the lib */}
      <dl className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-surface-raised p-3 text-xs sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-faint">shards</dt>
          <dd className="text-ink">{meta.splits}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-faint">communication</dt>
          <dd className="font-mono" style={{ color: COLOR.hwAccent }}>
            {meta.commOp}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-faint">bound by</dt>
          <dd className="text-ink">{meta.boundBy}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted">{meta.note}</p>
    </section>
  );
}

export default Parallelism;
