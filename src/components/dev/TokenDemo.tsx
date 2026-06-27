import { useState } from 'react';
import { Token } from '../scroll/Token';

/**
 * Dev sandbox showcase for the Token motif. Verifies every visual state, the
 * weight ramp, and keyboard/click interactivity in one place.
 */

const SAMPLE = ['The', 'quick', 'brown', 'fox'];
const RAMP = [0, 0.25, 0.5, 0.75, 1];

function Label({ children }: { children: string }) {
  return (
    <h3 className="mb-3 font-mono text-xs uppercase tracking-widest text-muted">{children}</h3>
  );
}

export function TokenDemo() {
  const [selected, setSelected] = useState(0);

  return (
    <div className="space-y-8">
      <section>
        <Label>states</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Token text="default" />
          <Token text="active" state="active" />
          <Token text="inert" state="inert" />
          <Token text="ghost" state="ghost" />
          <Token text="with id" id={1337} state="active" />
        </div>
      </section>

      <section>
        <Label>weight ramp (inert → amber → coral)</Label>
        <div className="flex flex-wrap items-center gap-2">
          {RAMP.map((w) => (
            <Token key={w} text={w.toFixed(2)} weight={w} />
          ))}
        </div>
      </section>

      <section>
        <Label>interactive — click or focus + ← / →</Label>
        <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
          <legend className="sr-only">Selectable tokens</legend>
          {SAMPLE.map((t, i) => (
            <Token
              key={t}
              text={t}
              selected={i === selected}
              ariaPressed={i === selected}
              tabIndex={0}
              onClick={() => setSelected(i)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') setSelected((s) => Math.min(SAMPLE.length - 1, s + 1));
                if (e.key === 'ArrowLeft') setSelected((s) => Math.max(0, s - 1));
              }}
            />
          ))}
        </fieldset>
        <p className="mt-3 text-sm text-muted">
          selected: <span className="text-ink">{SAMPLE[selected]}</span>
        </p>
      </section>
    </div>
  );
}

export default TokenDemo;
