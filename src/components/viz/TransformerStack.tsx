import { Token } from '@/components/scroll/Token';
import { COLOR, lerpColor, withAlpha } from '@/lib/encoding';
import {
  BLOCK,
  type Block,
  type BlockKind,
  MODEL_PRESETS,
  type ModelConfig,
  paramBreakdown,
} from '@/lib/transformer';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { useState } from 'react';

/**
 * TransformerStack — structural overview of a decoder transformer (spec 10.1).
 *
 * Embeddings enter at the top and flow down through N identical layers; we draw a
 * couple of concrete layers, an "× N" elision, and the final layer, then the output.
 * Each layer expands into its pre-norm sub-blocks (RMSNorm → Attention → +residual
 * → RMSNorm → FFN → +residual). Click or focus any sub-block to highlight it and
 * read its note; the FFN additionally surfaces that it holds most of the params.
 *
 * Self-contained: defaults to MODEL_PRESETS[0] so it renders with zero props.
 */

export interface TransformerStackProps {
  presets?: readonly ModelConfig[];
  initialPreset?: number;
}

/** Color per sub-block role, derived from the shared encoding palette (≤5 categories). */
function kindColor(kind: BlockKind): string {
  switch (kind) {
    case 'attention':
      return COLOR.active;
    case 'ffn':
      return COLOR.modelAccent;
    case 'norm':
      return COLOR.hwAccent;
    default:
      return COLOR.faint;
  }
}

const numberFmt = new Intl.NumberFormat('en-US');

/** Compact human-readable parameter count, e.g. 6.7B, 124M. */
function formatParams(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return numberFmt.format(n);
}

interface SubBlockProps {
  block: Block;
  active: boolean;
  reduced: boolean;
  onSelect: () => void;
}

function SubBlock({ block, active, reduced, onSelect }: SubBlockProps) {
  const color = kindColor(block.kind);
  const isResidual = block.kind === 'residual';
  const transition = reduced ? undefined : 'background-color 160ms ease, border-color 160ms ease';

  if (isResidual) {
    // Residual adds render as a thin labeled connector rather than a full box.
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        title={block.note}
        className="flex w-full items-center justify-center gap-2 rounded py-1 font-mono text-[0.7rem] focus-visible:outline-none"
        style={{ color: active ? COLOR.ink : COLOR.faint, transition }}
      >
        <span aria-hidden="true">⊕</span>
        <span>{block.label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      title={block.note}
      className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left font-mono text-xs focus-visible:outline-none"
      style={{
        borderColor: active ? color : withAlpha(color, 0.5),
        backgroundColor: withAlpha(color, active ? 0.22 : 0.08),
        color: COLOR.ink,
        boxShadow: active ? `0 0 0 1px ${withAlpha(color, 0.6)}` : undefined,
        transition,
      }}
    >
      <span>{block.label}</span>
      {block.kind === 'ffn' && (
        <span className="text-[0.65rem]" style={{ color: withAlpha(COLOR.ink, 0.7) }}>
          most params
        </span>
      )}
    </button>
  );
}

interface LayerCardProps {
  index: number;
  selectedBlock: string | null;
  reduced: boolean;
  onSelectBlock: (id: string) => void;
}

function LayerCard({ index, selectedBlock, reduced, onSelectBlock }: LayerCardProps) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-xs text-muted">Layer {index}</span>
        <span className="text-[0.65rem] text-faint">pre-norm block</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {BLOCK.map((b) => (
          <SubBlock
            key={b.id}
            block={b}
            active={selectedBlock === b.id}
            reduced={reduced}
            onSelect={() => onSelectBlock(b.id)}
          />
        ))}
      </div>
    </div>
  );
}

/** A downward flow arrow between stack stages. */
function FlowArrow() {
  return (
    <div className="flex justify-center py-1 text-faint" aria-hidden="true">
      <span className="font-mono text-sm">↓</span>
    </div>
  );
}

export function TransformerStack({
  presets = MODEL_PRESETS,
  initialPreset = 0,
}: TransformerStackProps) {
  const reduced = usePrefersReducedMotion();
  const [presetIdx, setPresetIdx] = useState(Math.min(initialPreset, presets.length - 1));
  const [selectedBlock, setSelectedBlock] = useState<string | null>('ffn');

  const cfg = presets[Math.min(presetIdx, presets.length - 1)];
  const params = paramBreakdown(cfg);
  const selected = BLOCK.find((b) => b.id === selectedBlock) ?? null;

  const ffnShare = params.perLayer === 0 ? 0 : params.ffnParams / params.perLayer;

  return (
    <div
      className="mx-auto flex w-full flex-col gap-4 rounded-lg border border-border bg-surface p-4"
      style={{ maxWidth: 860 }}
    >
      {/* Preset selector */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="ts-preset" className="text-xs text-faint">
          Model:
        </label>
        <select
          id="ts-preset"
          value={presetIdx}
          onChange={(e) => setPresetIdx(Number(e.target.value))}
          className="rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-xs text-ink focus-visible:outline-none"
        >
          {presets.map((p, i) => (
            <option key={p.name} value={i}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="ml-auto font-mono text-xs text-muted">
          {cfg.nLayers} layers · dModel {numberFmt.format(cfg.dModel)} · {cfg.nHeads} heads ·{' '}
          <span style={{ color: COLOR.modelAccent }}>{formatParams(params.total)} params</span>
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
        {/* The stack */}
        <div className="flex flex-col">
          {/* Input embeddings */}
          <div className="rounded-md border border-border bg-surface-raised p-3">
            <div className="mb-2 text-[0.65rem] uppercase tracking-wide text-faint">
              token embeddings in
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['The', 'cat', 'sat', 'on'].map((t, i) => (
                <Token key={t} text={t} id={i} state="active" size="sm" />
              ))}
            </div>
          </div>

          <FlowArrow />
          <LayerCard
            index={1}
            selectedBlock={selectedBlock}
            reduced={reduced}
            onSelectBlock={setSelectedBlock}
          />
          <FlowArrow />
          <LayerCard
            index={2}
            selectedBlock={selectedBlock}
            reduced={reduced}
            onSelectBlock={setSelectedBlock}
          />

          {/* Elision: × N identical layers */}
          <div className="flex items-center gap-3 py-3" aria-hidden="true">
            <div className="flex-1 border-border border-t border-dashed" />
            <span className="font-mono text-xs text-muted">⋮ × {cfg.nLayers} identical layers</span>
            <div className="flex-1 border-border border-t border-dashed" />
          </div>

          <LayerCard
            index={cfg.nLayers}
            selectedBlock={selectedBlock}
            reduced={reduced}
            onSelectBlock={setSelectedBlock}
          />
          <FlowArrow />

          {/* Output */}
          <div className="rounded-md border border-border bg-surface-raised p-3 text-center font-mono text-xs text-muted">
            final RMSNorm → next-token logits
          </div>
        </div>

        {/* Side panel: detail + param split */}
        <aside className="flex flex-col gap-3">
          <div className="rounded-md border border-border bg-surface-raised p-3" aria-live="polite">
            {selected ? (
              <>
                <div className="mb-1 font-mono text-xs" style={{ color: kindColor(selected.kind) }}>
                  {selected.label}
                </div>
                <p className="text-xs leading-relaxed text-muted">{selected.note}</p>
              </>
            ) : (
              <p className="text-xs leading-relaxed text-faint">
                Select a sub-block to inspect what it does.
              </p>
            )}
          </div>

          {/* Per-layer parameter split */}
          <div className="rounded-md border border-border bg-surface-raised p-3">
            <div className="mb-2 text-[0.65rem] uppercase tracking-wide text-faint">
              per-layer parameters
            </div>
            <div
              className="flex h-3 w-full overflow-hidden rounded"
              role="img"
              aria-label={`Feed-forward holds ${Math.round(ffnShare * 100)} percent of each layer's parameters; attention holds the rest.`}
            >
              <div
                style={{
                  width: `${(1 - ffnShare) * 100}%`,
                  backgroundColor: COLOR.active,
                  transition: reduced ? undefined : 'width 200ms ease',
                }}
              />
              <div
                style={{
                  width: `${ffnShare * 100}%`,
                  backgroundColor: COLOR.modelAccent,
                  transition: reduced ? undefined : 'width 200ms ease',
                }}
              />
            </div>
            <dl className="mt-2 flex flex-col gap-1 font-mono text-[0.7rem]">
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5" style={{ color: COLOR.active }}>
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: COLOR.active }}
                    aria-hidden="true"
                  />
                  Attention
                </dt>
                <dd className="text-muted">{formatParams(params.attnParams)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5" style={{ color: COLOR.modelAccent }}>
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: COLOR.modelAccent }}
                    aria-hidden="true"
                  />
                  Feed-forward
                </dt>
                <dd className="text-muted">{formatParams(params.ffnParams)}</dd>
              </div>
            </dl>
            <p
              className="mt-2 text-[0.7rem] leading-snug"
              style={{ color: lerpColor(COLOR.muted, COLOR.modelAccent, 0.4) }}
            >
              The FFN holds {Math.round(ffnShare * 100)}% of each layer's weights.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default TransformerStack;
