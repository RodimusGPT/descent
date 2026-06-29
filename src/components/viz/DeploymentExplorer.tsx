import {
  DEPLOY_MODES,
  type DeployMode,
  type DeployTraits,
  TRAIT_KEYS,
  TRAIT_LABELS,
  TRAIT_MAX,
  deployModeByKey,
} from '@/lib/deploy';
import { CATEGORICAL, COLOR, weightToColor, withAlpha } from '@/lib/encoding';
import { moveRadioFocus } from '@/lib/roving';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { useId, useState } from 'react';

/**
 * DeploymentExplorer (Part 3) — the same open-weights model, three places to run
 * it. Local on your own machine, self-hosted on GPUs you rent or own, or a
 * managed API where someone else runs the GPU. Pick a mode to read its full
 * character, a few representative tools, and a small bar rating of its five
 * illustrative trade-off traits (control / convenience / cost-at-scale /
 * latency / model choice).
 *
 * The three mode cards form a single radiogroup with roving focus: arrow keys
 * move between modes, Enter / Space selects. Each mode carries its own
 * CATEGORICAL identity color (NOT the model/hardware accents). Reduced-motion
 * safe — the only transitions are short and all disabled under reduced motion.
 *
 * Self-contained: renders with zero required props.
 */

/** Map an illustrative 1..TRAIT_MAX rating onto the encoding warmth ramp. */
function traitColor(value: number): string {
  // Spread 1..max across the warm half of the ramp so even low ratings read as a
  // distinct color rather than fully inert.
  return weightToColor(0.15 + 0.85 * ((value - 1) / (TRAIT_MAX - 1)));
}

/** The opening clause of a blurb — up to the first em-dash, semicolon, or period. */
function tagline(blurb: string): string {
  const match = blurb.match(/^[^—;.]+/);
  return (match ? match[0] : blurb).trim();
}

export interface DeploymentExplorerProps {
  /** Key of the mode selected on first render. */
  initialKey?: string;
}

export function DeploymentExplorer({ initialKey = DEPLOY_MODES[0]?.key }: DeploymentExplorerProps) {
  const reduced = usePrefersReducedMotion();
  const baseId = useId();
  const groupId = `${baseId}-modes`;
  const panelId = `${baseId}-panel`;

  // Resolve the requested key to a real mode (falling back to the first).
  const initialMode = deployModeByKey(initialKey ?? '') ?? DEPLOY_MODES[0];
  const initialIndex = Math.max(
    0,
    DEPLOY_MODES.findIndex((m) => m.key === initialMode?.key),
  );
  const [index, setIndex] = useState<number>(initialIndex);

  const selected: DeployMode =
    DEPLOY_MODES[Math.min(index, DEPLOY_MODES.length - 1)] ?? DEPLOY_MODES[0];
  const accent = CATEGORICAL[index % CATEGORICAL.length];

  const cardTransition = reduced
    ? undefined
    : 'border-color 200ms ease, background-color 200ms ease';
  const barTransition = reduced ? undefined : 'width 260ms ease, background-color 260ms ease';

  return (
    <div className="flex w-full max-w-[900px] flex-col gap-4 rounded-lg border border-border bg-surface p-4 text-ink">
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-sm text-ink">Where it runs</h3>
        <p className="text-xs text-muted">
          The same model, three places to run it — trading control for convenience.
        </p>
      </div>

      {/* Mode cards — a radiogroup with roving focus */}
      <div
        className="grid grid-cols-1 gap-2 sm:grid-cols-3"
        role="radiogroup"
        aria-label="Deployment modes"
        id={groupId}
      >
        {DEPLOY_MODES.map((mode, i) => {
          const isActive = mode.key === selected.key;
          const color = CATEGORICAL[i % CATEGORICAL.length];
          return (
            <button
              key={mode.key}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setIndex(i)}
              onKeyDown={(e) => moveRadioFocus(e, i, DEPLOY_MODES.length, setIndex)}
              className="flex flex-col gap-1 rounded-md border p-2.5 text-left"
              style={{
                borderColor: isActive ? color : COLOR.border,
                backgroundColor: isActive ? withAlpha(color, 0.16) : 'transparent',
                transition: cardTransition,
              }}
            >
              <span
                className="font-mono text-xs"
                style={{ color: isActive ? COLOR.ink : COLOR.muted }}
              >
                {mode.label}
              </span>
              <span className="text-[0.7rem] leading-snug text-faint">{tagline(mode.blurb)}</span>
            </button>
          );
        })}
      </div>

      {/* Detail panel for the selected mode */}
      <div
        id={panelId}
        aria-live="polite"
        className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-3"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-sm" style={{ color: accent }}>
            {selected.label}
          </span>
          <span className="text-[0.7rem] text-faint">illustrative, not a ranking — ~2026</span>
        </div>

        <p className="text-xs leading-relaxed text-ink">{selected.blurb}</p>

        {/* Representative tools */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[0.7rem] text-faint">Representative tools</span>
          <ul className="flex flex-col gap-1.5">
            {selected.tools.map((tool) => (
              <li
                key={tool.name}
                className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2"
              >
                <span className="shrink-0 font-mono text-xs text-ink">{tool.name}</span>
                <span className="text-[0.7rem] leading-snug text-muted">{tool.note}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Trait bars */}
        <ul className="flex flex-col gap-2">
          {TRAIT_KEYS.map((key) => {
            const value = selected.traits[key as keyof DeployTraits];
            const color = traitColor(value);
            return (
              <li key={key} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[0.7rem] text-muted">{TRAIT_LABELS[key]}</span>
                <div
                  className="h-2 flex-1 overflow-hidden rounded-full"
                  style={{ backgroundColor: withAlpha(COLOR.muted, 0.16) }}
                  role="meter"
                  aria-valuemin={1}
                  aria-valuemax={TRAIT_MAX}
                  aria-valuenow={value}
                  aria-label={`${TRAIT_LABELS[key]} rating ${value} of ${TRAIT_MAX}`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(value / TRAIT_MAX) * 100}%`,
                      backgroundColor: color,
                      transition: barTransition,
                    }}
                  />
                </div>
                <span
                  className="w-6 shrink-0 text-right font-mono text-[0.7rem] tabular-nums"
                  style={{ color }}
                >
                  {value}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default DeploymentExplorer;
