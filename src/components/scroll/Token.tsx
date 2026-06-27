import { COLOR, weightToColor, withAlpha } from '@/lib/encoding';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';

/**
 * Token — the recurring motif of the whole site (Invariant I5).
 *
 * A "token" is the character the reader follows all the way down the stack, so it
 * must render identically everywhere. This is the ONLY component that draws one;
 * nothing else should hand-roll a token pill.
 *
 * Visual encoding (consistent with encoding.ts):
 *   state="active" → warm amber  · state="inert" → cool slate · "ghost" → faint outline
 *   weight (0..1)  → background tint along the inert→amber→coral ramp (overrides state hue)
 */

export type TokenState = 'default' | 'active' | 'inert' | 'ghost';

export interface TokenProps {
  /** Token text. Either `children` or `text` may be used. */
  children?: ReactNode;
  text?: string;
  /** Optional integer token id, rendered as a small subscript. */
  id?: number;
  /** Semantic state. Ignored for hue purposes when `weight` is provided. */
  state?: TokenState;
  /** Attention/energy weight in [0,1]; tints the background via weightToColor. */
  weight?: number;
  /** Renders a selected ring (e.g. the current query token). */
  selected?: boolean;
  size?: 'sm' | 'md';
  title?: string;
  className?: string;
  /** When provided, the token renders as a real <button> for keyboard a11y. */
  onClick?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
  tabIndex?: number;
  ariaLabel?: string;
  ariaPressed?: boolean;
}

function hueForState(state: TokenState): string {
  switch (state) {
    case 'active':
      return COLOR.active;
    case 'inert':
      return COLOR.inert;
    case 'ghost':
      return COLOR.faint;
    default:
      return COLOR.border;
  }
}

export function Token({
  children,
  text,
  id,
  state = 'default',
  weight,
  selected = false,
  size = 'md',
  title,
  className = '',
  onClick,
  onKeyDown,
  tabIndex,
  ariaLabel,
  ariaPressed,
}: TokenProps) {
  const hue = weight === undefined ? hueForState(state) : weightToColor(weight);
  const fillAlpha =
    weight === undefined ? (state === 'default' ? 0.06 : 0.16) : 0.18 + 0.5 * weight;

  const style: CSSProperties = {
    borderColor: selected ? COLOR.active : hue,
    backgroundColor: withAlpha(hue, fillAlpha),
    color: state === 'ghost' ? COLOR.muted : COLOR.ink,
    boxShadow: selected ? `0 0 0 2px ${withAlpha(COLOR.active, 0.55)}` : undefined,
  };

  const sizeClasses = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1';
  const label = children ?? text ?? '';

  const inner = (
    <span className="inline-flex items-baseline gap-1 whitespace-pre">
      <span>{label}</span>
      {id !== undefined && (
        <span className="text-[0.6em] tabular-nums opacity-60" aria-hidden="true">
          {id}
        </span>
      )}
    </span>
  );

  const baseClass = `inline-flex select-none items-center rounded-md border font-mono leading-none transition-colors ${sizeClasses} ${className}`;

  if (onClick || onKeyDown) {
    return (
      <button
        type="button"
        className={`${baseClass} cursor-pointer focus-visible:outline-none`}
        style={style}
        title={title}
        onClick={onClick}
        onKeyDown={onKeyDown}
        tabIndex={tabIndex}
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        aria-pressed={ariaPressed}
      >
        {inner}
      </button>
    );
  }

  return (
    <span className={baseClass} style={style} title={title} aria-label={ariaLabel}>
      {inner}
    </span>
  );
}

export default Token;
