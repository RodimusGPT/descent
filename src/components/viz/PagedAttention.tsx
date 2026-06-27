import { CATEGORICAL, COLOR, withAlpha } from '@/lib/encoding';
import {
  BLOCK_SIZE,
  type Seq,
  allocateContiguous,
  allocatePaged,
  blocksFor,
  withSharedPrefix,
} from '@/lib/paged';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { type CSSProperties, useCallback, useMemo, useState } from 'react';

/**
 * PagedAttention — spec 10.3, the KV cache as OS-style paging.
 *
 * Two views of the same idea:
 *   CONTIGUOUS — every sequence reserves room for the maximum context up front,
 *                so short sequences strand whole blocks (internal fragmentation).
 *   PAGED      — fixed-size blocks are handed out on demand and tracked by a
 *                block table; the only waste is the tail of each last block.
 *
 * A shared-prefix example shows two sequences whose identical prompt prefix maps
 * to the SAME physical blocks (warm / highlighted), stored once.
 *
 * Self-contained: renders standalone with zero props. Reduced-motion users get a
 * fully-rendered static frame (color transitions disabled).
 */

/** Per-sequence non-semantic categorical colors (avoids the purple/teal part accents). */
const SEQ_COLORS = CATEGORICAL;

const DEFAULT_SEQS: Seq[] = [
  { id: 0, len: 5 },
  { id: 1, len: 10 },
  { id: 2, len: 3 },
];

const MAX_LEN_CAP = 28; // upper bound for the reserve-max slider
const SEQ_LEN_CAP = 16; // a single sequence can't exceed this here

type Mode = 'contiguous' | 'paged';

export interface PagedAttentionProps {
  /** Starting view. */
  initialMode?: Mode;
}

export function PagedAttention({ initialMode = 'contiguous' }: PagedAttentionProps) {
  const reduced = usePrefersReducedMotion();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [shared, setShared] = useState(false);
  const [seqLens, setSeqLens] = useState<number[]>(DEFAULT_SEQS.map((s) => s.len));
  const [maxLen, setMaxLen] = useState(16);
  const [sharedTokens, setSharedTokens] = useState(6);

  const tw = reduced ? '' : 'transition-colors';

  const seqs: Seq[] = useMemo(() => seqLens.map((len, id) => ({ id, len })), [seqLens]);

  // --- the two normal-mode allocations ---------------------------------------
  const cont = useMemo(() => allocateContiguous(seqs, maxLen, BLOCK_SIZE), [seqs, maxLen]);
  const paged = useMemo(() => allocatePaged(seqs, BLOCK_SIZE), [seqs]);

  // --- the shared-prefix scenario (two sequences) ----------------------------
  const sharedSeqs: [Seq, Seq] = useMemo(
    () => [
      { id: 0, len: 12 },
      { id: 1, len: 9 },
    ],
    [],
  );
  const sharedAlloc = useMemo(
    () => withSharedPrefix(sharedSeqs[0], sharedSeqs[1], sharedTokens, BLOCK_SIZE),
    [sharedSeqs, sharedTokens],
  );

  // --- token +/- controls ----------------------------------------------------
  const bump = useCallback((id: number, delta: number) => {
    setSeqLens((prev) =>
      prev.map((len, i) => (i === id ? Math.max(1, Math.min(SEQ_LEN_CAP, len + delta)) : len)),
    );
  }, []);

  const reset = useCallback(() => {
    setSeqLens(DEFAULT_SEQS.map((s) => s.len));
    setMaxLen(16);
    setSharedTokens(6);
  }, []);

  // --- panel styles ----------------------------------------------------------
  const panel: CSSProperties = { backgroundColor: COLOR.surface, borderColor: COLOR.border };

  return (
    <section
      className="mx-auto flex w-full max-w-[900px] flex-col gap-4 rounded-xl border p-4 font-sans text-ink sm:p-6"
      style={panel}
      aria-label="Paged attention: the KV cache as OS-style paging"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="font-mono text-sm font-semibold text-ink">Paged KV cache</h3>
          <p className="font-mono text-[0.7rem] text-faint">
            {BLOCK_SIZE} tokens per block · block table maps logical → physical
          </p>
        </div>

        {/* mode segmented control */}
        <div
          className="flex items-center gap-1 rounded-md border p-1"
          style={{ borderColor: COLOR.border }}
          role="group"
          aria-label="Allocation strategy"
        >
          {(['contiguous', 'paged'] as const).map((m) => {
            const on = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={on}
                className={`rounded px-3 py-1 font-mono text-xs ${tw} `}
                style={{
                  backgroundColor: on ? withAlpha(COLOR.modelAccent, 0.18) : 'transparent',
                  color: on ? COLOR.ink : COLOR.muted,
                }}
              >
                {m === 'contiguous' ? 'Contiguous' : 'Paged'}
              </button>
            );
          })}
        </div>
      </header>

      {shared ? (
        <SharedPrefixView
          seqs={sharedSeqs}
          alloc={sharedAlloc}
          sharedTokens={sharedTokens}
          tw={tw}
        />
      ) : (
        <NormalView mode={mode} seqs={seqs} maxLen={maxLen} paged={paged} tw={tw} onBump={bump} />
      )}

      {/* wasted-blocks readout */}
      <WasteReadout
        shared={shared}
        mode={mode}
        contWasted={cont.wasted}
        contReserved={cont.reserved}
        pagedWasted={paged.wasted}
        pagedUsed={paged.physicalUsed}
        sharedSaved={sharedAlloc.sharedBlocks.length}
      />

      {/* controls */}
      <div className="flex flex-col gap-3 border-t pt-3" style={{ borderColor: COLOR.border }}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-muted">
            <input
              type="checkbox"
              checked={shared}
              onChange={(e) => setShared(e.target.checked)}
              className="h-4 w-4"
              style={{ accentColor: COLOR.activeHot }}
            />
            Shared-prefix example
          </label>

          {!shared && mode === 'contiguous' && (
            <label className="flex flex-1 flex-col gap-1 font-mono text-xs text-muted">
              <span>
                Reserve max length: <span className="tabular-nums text-ink">{maxLen}</span> tokens (
                {blocksFor(maxLen, BLOCK_SIZE)} blocks / seq)
              </span>
              <input
                type="range"
                min={SEQ_LEN_CAP}
                max={MAX_LEN_CAP}
                step={1}
                value={maxLen}
                onChange={(e) => setMaxLen(Number(e.target.value))}
                className="w-full"
                style={{ accentColor: COLOR.active }}
                aria-label="Reserved maximum context length, in tokens"
              />
            </label>
          )}

          {shared && (
            <label className="flex flex-1 flex-col gap-1 font-mono text-xs text-muted">
              <span>
                Shared prefix: <span className="tabular-nums text-ink">{sharedTokens}</span> tokens
                ({blocksFor(sharedTokens, BLOCK_SIZE)} blocks)
              </span>
              <input
                type="range"
                min={1}
                max={9}
                step={1}
                value={sharedTokens}
                onChange={(e) => setSharedTokens(Number(e.target.value))}
                className="w-full"
                style={{ accentColor: COLOR.activeHot }}
                aria-label="Number of shared prefix tokens"
              />
            </label>
          )}

          <button
            type="button"
            onClick={reset}
            className={`ml-auto rounded-md border px-3 py-1 font-mono text-xs text-muted ${tw} hover:bg-surface-raised `}
            style={{ borderColor: COLOR.border, backgroundColor: COLOR.surface }}
          >
            Reset
          </button>
        </div>

        {reduced && (
          <p className="font-mono text-[0.7rem] text-faint">
            Reduced motion: color transitions are disabled; the full allocation is shown.
          </p>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Normal view: three sequences, contiguous OR paged                          */
/* -------------------------------------------------------------------------- */

function NormalView({
  mode,
  seqs,
  maxLen,
  paged,
  tw,
  onBump,
}: {
  mode: Mode;
  seqs: Seq[];
  maxLen: number;
  paged: ReturnType<typeof allocatePaged>;
  tw: string;
  onBump: (id: number, delta: number) => void;
}) {
  const reservedPerSeq = blocksFor(maxLen, BLOCK_SIZE);

  // Physical assignment per mode, so the pool below can be colored by owner.
  // Contiguous: each seq owns a fixed run of reservedPerSeq blocks.
  // Paged: from the block table.
  const totalPhysical = mode === 'contiguous' ? reservedPerSeq * seqs.length : paged.physicalUsed;

  // owner + filled status for each physical block index
  const poolCells: { owner: number; filled: boolean }[] = [];
  if (mode === 'contiguous') {
    for (const s of seqs) {
      const used = blocksFor(Math.min(s.len, maxLen), BLOCK_SIZE);
      for (let b = 0; b < reservedPerSeq; b++) {
        poolCells.push({ owner: s.id, filled: b < used });
      }
    }
  } else {
    for (const s of seqs) {
      const n = paged.blockTable[s.id].length;
      for (let b = 0; b < n; b++) poolCells.push({ owner: s.id, filled: true });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* sequence rows */}
      <div className="flex flex-col gap-2">
        {seqs.map((s) => {
          const usedBlocks = blocksFor(s.len, BLOCK_SIZE);
          const drawnBlocks =
            mode === 'contiguous' ? Math.max(usedBlocks, reservedPerSeq) : usedBlocks;
          const physIds = mode === 'paged' ? paged.blockTable[s.id] : undefined;
          const color = SEQ_COLORS[s.id % SEQ_COLORS.length];
          return (
            <div key={s.id} className="flex flex-wrap items-center gap-2">
              <span className="w-16 shrink-0 font-mono text-xs" style={{ color }}>
                Seq {s.id}
              </span>
              <span className="w-20 shrink-0 font-mono text-[0.7rem] text-faint tabular-nums">
                {s.len} tok
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {Array.from({ length: drawnBlocks }, (_, b) => {
                  const filled = b < usedBlocks;
                  const physId = physIds?.[b];
                  return (
                    <LogicalBlock
                      key={b}
                      filled={filled}
                      color={color}
                      physId={physId}
                      tw={tw}
                      tokens={filled ? Math.min(BLOCK_SIZE, s.len - b * BLOCK_SIZE) : 0}
                    />
                  );
                })}
              </div>
              {/* per-seq token controls */}
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onBump(s.id, -1)}
                  className={`rounded border px-2 py-0.5 font-mono text-xs text-muted ${tw} hover:bg-surface-raised `}
                  style={{ borderColor: COLOR.border }}
                  aria-label={`Remove a token from sequence ${s.id}`}
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => onBump(s.id, +1)}
                  className={`rounded border px-2 py-0.5 font-mono text-xs text-muted ${tw} hover:bg-surface-raised `}
                  style={{ borderColor: COLOR.border }}
                  aria-label={`Add a token to sequence ${s.id}`}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* physical pool */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-muted">
            Physical block pool · {totalPhysical} blocks
          </span>
          <span className="font-mono text-[0.7rem] text-faint">
            {mode === 'contiguous' ? 'reserved up front' : 'allocated on demand'}
          </span>
        </div>
        <div
          className="flex flex-wrap gap-1 rounded-md border p-2"
          style={{ borderColor: COLOR.border, backgroundColor: withAlpha(COLOR.faint, 0.06) }}
          role="img"
          aria-label={`Physical block pool with ${totalPhysical} blocks`}
        >
          {poolCells.map((cell, i) => {
            const color = SEQ_COLORS[cell.owner % SEQ_COLORS.length];
            return (
              <div
                key={i}
                className={`h-5 w-5 rounded-[3px] border ${tw}`}
                style={{
                  backgroundColor: cell.filled
                    ? withAlpha(color, 0.5)
                    : withAlpha(COLOR.inert, 0.15),
                  borderColor: cell.filled ? color : withAlpha(COLOR.inert, 0.5),
                  borderStyle: cell.filled ? 'solid' : 'dashed',
                }}
                title={cell.filled ? `Seq ${cell.owner}` : 'reserved · empty (wasted)'}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** A single logical block in a sequence row, with optional physical mapping. */
function LogicalBlock({
  filled,
  color,
  physId,
  tokens,
  tw,
}: {
  filled: boolean;
  color: string;
  physId?: number;
  tokens: number;
  tw: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className={`flex h-6 items-center justify-center gap-0.5 rounded-[3px] border px-1 ${tw}`}
        style={{
          backgroundColor: filled ? withAlpha(color, 0.28) : withAlpha(COLOR.inert, 0.12),
          borderColor: filled ? color : withAlpha(COLOR.inert, 0.5),
          borderStyle: filled ? 'solid' : 'dashed',
          minWidth: `${BLOCK_SIZE * 6 + 8}px`,
        }}
      >
        {Array.from({ length: BLOCK_SIZE }, (_, t) => (
          <span
            key={t}
            className="inline-block h-3 w-1 rounded-[1px]"
            style={{
              backgroundColor: filled && t < tokens ? color : withAlpha(COLOR.faint, 0.25),
            }}
          />
        ))}
      </div>
      <span className="font-mono text-[0.6rem] text-faint tabular-nums">
        {physId === undefined ? '·' : `p${physId}`}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared-prefix view                                                         */
/* -------------------------------------------------------------------------- */

function SharedPrefixView({
  seqs,
  alloc,
  sharedTokens,
  tw,
}: {
  seqs: [Seq, Seq];
  alloc: ReturnType<typeof withSharedPrefix>;
  sharedTokens: number;
  tw: string;
}) {
  const tables = [alloc.tableA, alloc.tableB];
  const sharedSet = new Set(alloc.sharedBlocks);

  // gather every physical block id used, for the pool
  const allPhys = Array.from(new Set([...alloc.tableA, ...alloc.tableB])).sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-[0.7rem] text-muted">
        Two sequences share their first{' '}
        <span style={{ color: COLOR.activeHot }}>{sharedTokens} prompt tokens</span>. The leading
        blocks map to the <em>same</em> physical blocks — stored once.
      </p>

      <div className="flex flex-col gap-2">
        {seqs.map((s, si) => {
          const table = tables[si];
          const color = si === 0 ? COLOR.active : COLOR.modelAccent;
          return (
            <div key={s.id} className="flex flex-wrap items-center gap-2">
              <span className="w-16 shrink-0 font-mono text-xs" style={{ color }}>
                Seq {s.id}
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {table.map((physId, b) => {
                  const isShared = sharedSet.has(physId);
                  const cellColor = isShared ? COLOR.activeHot : color;
                  const tokens = Math.min(BLOCK_SIZE, s.len - b * BLOCK_SIZE);
                  return (
                    <div key={b} className="flex flex-col items-center gap-0.5">
                      <div
                        className={`flex h-6 items-center justify-center gap-0.5 rounded-[3px] border px-1 ${tw}`}
                        style={{
                          backgroundColor: withAlpha(cellColor, isShared ? 0.4 : 0.28),
                          borderColor: cellColor,
                          minWidth: `${BLOCK_SIZE * 6 + 8}px`,
                        }}
                      >
                        {Array.from({ length: BLOCK_SIZE }, (_, t) => (
                          <span
                            key={t}
                            className="inline-block h-3 w-1 rounded-[1px]"
                            style={{
                              backgroundColor:
                                t < tokens ? cellColor : withAlpha(COLOR.faint, 0.25),
                            }}
                          />
                        ))}
                      </div>
                      <span
                        className="font-mono text-[0.6rem] tabular-nums"
                        style={{ color: isShared ? COLOR.activeHot : COLOR.faint }}
                      >
                        p{physId}
                        {isShared ? '*' : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* physical pool, shared blocks warm */}
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs text-muted">
          Physical pool · {allPhys.length} blocks ({alloc.sharedBlocks.length} shared)
        </span>
        <div
          className="flex flex-wrap gap-1 rounded-md border p-2"
          style={{ borderColor: COLOR.border, backgroundColor: withAlpha(COLOR.faint, 0.06) }}
          role="img"
          aria-label={`Physical pool with ${allPhys.length} blocks, ${alloc.sharedBlocks.length} shared`}
        >
          {allPhys.map((physId) => {
            const isShared = sharedSet.has(physId);
            const c = isShared ? COLOR.activeHot : COLOR.inert;
            return (
              <div
                key={physId}
                className={`flex h-5 w-5 items-center justify-center rounded-[3px] border font-mono text-[0.55rem] ${tw}`}
                style={{
                  backgroundColor: withAlpha(c, isShared ? 0.5 : 0.25),
                  borderColor: c,
                  color: COLOR.ink,
                }}
                title={isShared ? `shared block p${physId}` : `block p${physId}`}
              >
                {isShared ? '★' : ''}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Waste readout                                                              */
/* -------------------------------------------------------------------------- */

function WasteReadout({
  shared,
  mode,
  contWasted,
  contReserved,
  pagedWasted,
  pagedUsed,
  sharedSaved,
}: {
  shared: boolean;
  mode: Mode;
  contWasted: number;
  contReserved: number;
  pagedWasted: number;
  pagedUsed: number;
  sharedSaved: number;
}) {
  let label: string;
  let value: string;
  let color: string;
  if (shared) {
    label = 'blocks stored once via prefix sharing';
    value = `${sharedSaved}`;
    color = COLOR.activeHot;
  } else if (mode === 'contiguous') {
    label = `whole blocks reserved but never used (of ${contReserved})`;
    value = `${contWasted}`;
    color = COLOR.activeHot;
  } else {
    label = `unused token slots (tails of ${pagedUsed} blocks)`;
    value = `${pagedWasted}`;
    color = COLOR.hwAccent;
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
      style={{ borderColor: COLOR.border, backgroundColor: withAlpha(COLOR.faint, 0.08) }}
    >
      <span className="font-mono text-xs text-muted">
        {shared ? 'sharing' : mode === 'contiguous' ? 'internal fragmentation' : 'waste'}
      </span>
      <span className="flex items-baseline gap-2 font-mono text-sm">
        <span className="font-semibold tabular-nums" style={{ color }}>
          {value}
        </span>
        <span className="text-xs text-faint">{label}</span>
      </span>
    </div>
  );
}

export default PagedAttention;
