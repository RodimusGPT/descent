import { Token } from '@/components/scroll/Token';
import { COLOR, weightToColor, withAlpha } from '@/lib/encoding';
import { PROMPTS, predict, promptById, topToken } from '@/lib/hook';
import { moveRadioFocus } from '@/lib/roving';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { useMemo, useState } from 'react';

/**
 * PromptHook — the Part 0 opening hook (spec 10.0).
 *
 * The first interactive a reader meets. It says, plainly: a prompt is just text the
 * model continues, one token at a time. Pick an evocative prompt, nudge the
 * temperature, and press "Predict the next token" to REVEAL the single token the
 * model would emit — a prominent warm <Token/> — beside the runner-up candidates as
 * a small probability bar list. A planted question ("how did it pick that token?")
 * hands the reader off to the rest of the descent.
 *
 * Self-contained: zero required props; defaults to the built-in prompts.
 */

export interface PromptHookProps {
  /** Optional starting prompt id; defaults to the first prompt. */
  initialPromptId?: string;
}

/** How many candidates to show in the runner-up bar list. */
const TOP_N = 5;

export function PromptHook({ initialPromptId }: PromptHookProps) {
  const reduced = usePrefersReducedMotion();

  const [promptId, setPromptId] = useState(initialPromptId ?? PROMPTS[0].id);
  const [temperature, setTemperature] = useState(0.7);
  const [revealed, setRevealed] = useState(false);

  const prompt = promptById(promptId);
  const predictions = useMemo(() => predict(promptId, temperature), [promptId, temperature]);
  const best = useMemo(() => topToken(promptId, temperature), [promptId, temperature]);

  const top = predictions.slice(0, TOP_N);
  const maxProb = Math.max(1e-6, ...top.map((p) => p.prob));
  const topProb = predictions[0]?.prob ?? 0;

  const transition = reduced ? 'none' : 'width 320ms ease, background-color 320ms ease';

  const selectPrompt = (id: string) => {
    setPromptId(id);
    setRevealed(false);
  };

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-5 rounded-lg border border-border bg-surface p-5">
      {/* Framing */}
      <p className="font-mono text-sm text-muted">
        A prompt is just text the model continues —{' '}
        <span className="text-ink">one token at a time</span>.
      </p>

      {/* Prompt picker */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-mono text-xs text-faint">Pick a prompt</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Example prompts">
          {PROMPTS.map((p, i) => {
            const active = p.id === promptId;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                onClick={() => selectPrompt(p.id)}
                onKeyDown={(e) =>
                  moveRadioFocus(e, i, PROMPTS.length, (n) => selectPrompt(PROMPTS[n].id))
                }
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                className="rounded-md border px-2.5 py-1 text-left font-mono text-xs transition-colors "
                style={{
                  borderColor: active ? COLOR.active : COLOR.border,
                  backgroundColor: active
                    ? withAlpha(COLOR.active, 0.16)
                    : withAlpha(COLOR.border, 0.3),
                  color: active ? COLOR.ink : COLOR.muted,
                }}
              >
                {p.text}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* The prompt as a row of tokens, with the predicted slot */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg p-3">
        <Token text={prompt.text} state="inert" />
        <span aria-hidden="true" className="font-mono text-lg text-faint">
          →
        </span>
        {revealed ? (
          <Token
            text={best}
            weight={Math.max(0.55, Math.min(1, topProb + 0.25))}
            selected
            ariaLabel={`predicted next token: ${best}`}
          />
        ) : (
          <Token text="?" state="ghost" ariaLabel="next token, not yet predicted" />
        )}
      </div>

      {/* Temperature + predict action */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label htmlFor="hook-temp" className="flex min-w-[200px] grow flex-col gap-1">
          <span className="flex items-baseline justify-between font-mono text-xs">
            <span className="text-muted">Temperature</span>
            <span className="tabular-nums" style={{ color: COLOR.active }}>
              {temperature.toFixed(2)}
            </span>
          </span>
          <input
            id="hook-temp"
            type="range"
            min={0.1}
            max={2}
            step={0.05}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            className="w-full"
            style={{ accentColor: COLOR.active }}
            aria-label="Temperature"
          />
        </label>
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="rounded-md border px-3.5 py-2 font-mono text-sm transition-colors "
          style={{
            borderColor: COLOR.active,
            backgroundColor: withAlpha(COLOR.active, 0.16),
            color: COLOR.active,
          }}
        >
          Predict the next token →
        </button>
      </div>

      {/* Reveal: top token + runner-up bars */}
      {revealed && (
        <div className="flex flex-col gap-3" aria-live="polite">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs text-faint">Most likely next token</span>
            <span
              className="inline-flex items-baseline gap-2 rounded-md border px-3 py-1.5 font-mono text-lg"
              style={{
                borderColor: COLOR.active,
                backgroundColor: withAlpha(COLOR.active, 0.2),
                color: COLOR.ink,
                boxShadow: `0 0 0 2px ${withAlpha(COLOR.active, 0.4)}`,
              }}
            >
              <span className="whitespace-pre">{best}</span>
              <span className="text-sm tabular-nums" style={{ color: COLOR.active }}>
                {(topProb * 100).toFixed(1)}%
              </span>
            </span>
          </div>

          <ul className="flex flex-col gap-1.5" aria-label="Top candidate next tokens">
            {top.map((p, i) => {
              const isTop = i === 0;
              const widthPct = (p.prob / maxProb) * 100;
              return (
                <li key={p.token} className="flex items-center gap-2">
                  <span className="w-28 shrink-0">
                    <Token
                      text={p.token}
                      size="sm"
                      state={isTop ? 'active' : 'default'}
                      weight={isTop ? undefined : 0}
                    />
                  </span>
                  <span
                    className="relative h-4 grow overflow-hidden rounded-sm"
                    style={{ backgroundColor: withAlpha(COLOR.border, 0.4) }}
                  >
                    <span
                      className="absolute inset-y-0 left-0 rounded-sm"
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: weightToColor(p.prob / maxProb),
                        transition,
                      }}
                    />
                  </span>
                  <span
                    className="w-14 shrink-0 text-right font-mono text-xs tabular-nums"
                    style={{ color: isTop ? COLOR.ink : COLOR.muted }}
                  >
                    {(p.prob * 100).toFixed(1)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* The planted question */}
      <p className="border-t border-border pt-4 font-mono text-sm text-muted">
        That is the whole trick — but{' '}
        <span className="text-active">how did it pick that token?</span> Everything below is the
        answer.
      </p>
    </div>
  );
}

export default PromptHook;
