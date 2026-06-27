import { partAccent, withAlpha } from '@/lib/encoding';
import type { PartKind } from '@/lib/encoding';
import { ScrollScene } from './ScrollScene';
import { Token } from './Token';

/**
 * PlaceholderScene — a generic ScrollScene used to make the spine walkable in M0
 * before the real per-part interactives exist (M4–M8 replace these). It still
 * demonstrates the primitives wired together: stepped narration, a sticky visual
 * that reacts to the active step, the Token motif, and per-part accent color.
 */

export interface PlaceholderSceneProps {
  kind: PartKind;
  label: string;
  /** Name of the signature interactive this part will eventually anchor on. */
  signature?: string;
}

export function PlaceholderScene({ kind, label, signature }: PlaceholderSceneProps) {
  const accent = partAccent(kind);

  const steps = [
    {
      id: 'intro',
      narration: (
        <p className="text-lg leading-relaxed text-muted">
          We are descending into <span className="text-ink">{label}</span>. Scroll to follow the
          token down another layer of the stack.
        </p>
      ),
    },
    {
      id: 'detail',
      narration: (
        <p className="text-lg leading-relaxed text-muted">
          Each step here reveals one more mechanism. The sticky panel to the side updates as you
          move — that is the <span className="text-ink">ScrollScene</span> primitive at work.
        </p>
      ),
    },
    {
      id: 'signature',
      narration: (
        <p className="text-lg leading-relaxed text-muted">
          This section's signature interactive
          {signature ? (
            <>
              {' — '}
              <span className="text-ink">{signature}</span>
            </>
          ) : null}{' '}
          lands in a later milestone. For now, the descent itself is the point.
        </p>
      ),
    },
  ];

  return (
    <ScrollScene
      ariaLabel={`${label} (placeholder scene)`}
      steps={steps}
      render={(active) => (
        <div
          className="mx-auto flex aspect-square w-full max-w-md flex-col items-center justify-center gap-6 rounded-xl border p-8"
          style={{ borderColor: withAlpha(accent, 0.5), backgroundColor: withAlpha(accent, 0.05) }}
        >
          <div className="flex flex-col items-center gap-3">
            {[0, 1, 2].map((i) => (
              <Token
                key={i}
                text="token"
                state={i === active ? 'active' : 'inert'}
                size={i === active ? 'md' : 'sm'}
              />
            ))}
          </div>
          <div className="text-center">
            <div className="font-mono text-xs uppercase tracking-widest" style={{ color: accent }}>
              {label}
            </div>
            <div className="mt-1 text-sm text-muted">
              placeholder visual · step {active + 1} of {steps.length}
            </div>
          </div>
        </div>
      )}
    />
  );
}

export default PlaceholderScene;
