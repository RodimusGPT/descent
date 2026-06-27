import { partAccent, withAlpha } from '@/lib/encoding';
import type { PartKind } from '@/lib/encoding';
import { Token } from './Token';

/**
 * PlaceholderScene — a compact, intentional "coming soon" card for parts whose
 * real interactive hasn't been built yet (replaced as M7/M8 land). Deliberately
 * small and self-contained: it reads as a planned placeholder rather than an empty
 * frame, carries the descending-token motif, and is a single guided-tour stop (so
 * the stepper pauses here) — without the competing Prev/Next controls a full
 * ScrollScene would add.
 */

export interface PlaceholderSceneProps {
  kind: PartKind;
  label: string;
  /** Name of the signature interactive this part will eventually anchor on. */
  signature?: string;
}

export function PlaceholderScene({ kind, label, signature }: PlaceholderSceneProps) {
  const accent = partAccent(kind);
  return (
    <figure data-tour-stop className="mx-auto my-10 max-w-xl">
      <div
        className="flex flex-col items-center gap-5 rounded-xl border border-dashed px-6 py-12 text-center"
        style={{ borderColor: withAlpha(accent, 0.45), backgroundColor: withAlpha(accent, 0.05) }}
      >
        <div className="flex flex-col items-center gap-1.5" aria-hidden="true">
          <Token text="token" state="active" size="sm" />
          <span style={{ color: accent }}>↓</span>
          <Token text="token" state="inert" size="sm" />
        </div>
        <div>
          <div className="font-mono text-xs uppercase tracking-widest" style={{ color: accent }}>
            {label}
          </div>
          <p className="mt-2 text-sm text-muted">
            {signature ? (
              <>
                The <span className="text-ink">{signature}</span> interactive lands in a later
                milestone.
              </>
            ) : (
              'Coming in a later milestone.'
            )}
          </p>
        </div>
      </div>
    </figure>
  );
}

export default PlaceholderScene;
