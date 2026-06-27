import Token from '@/components/scroll/Token';
import { COLOR } from '@/lib/encoding';
import { type Tok, type TokKind, tokenize } from '@/lib/tokenize';
import { useId, useMemo, useState } from 'react';

/**
 * Tokenizer (spec 10.1) — text → subword tokens → integer ids, live.
 *
 * Type into the textarea and watch the sentence shatter into the pieces a model
 * actually consumes: whole words, subword fragments of longer/compound words,
 * punctuation, and the spaces between them — each carrying its stable vocab id.
 * The readout reminds you that the model counts TOKENS, not characters.
 *
 * Self-contained: renders with zero required props. No animation to gate, so it
 * is reduced-motion safe by construction (the live re-render is the only motion,
 * which the user drives directly).
 */

const DEFAULT_TEXT = 'The transformer reads tokenization as subword pieces.';

export interface TokenizerProps {
  /** Initial textarea contents. */
  initialText?: string;
}

// Per-kind visual encoding, derived from the shared palette (no raw hex here).
// Words read warm-neutral; subword fragments lean into the active amber to show
// they are "inside" a word; punctuation/space stay cool and recessive.
const KIND_STYLE: Record<TokKind, { weight?: number; state?: 'inert' | 'ghost'; label: string }> = {
  word: { weight: 0.42, label: 'word' },
  subword: { weight: 0.72, label: 'subword' },
  punct: { state: 'inert', label: 'punctuation' },
  space: { state: 'ghost', label: 'space' },
};

/** Visible stand-in for whitespace so space tokens are legible as pills. */
function displayText(tok: Tok): string {
  if (tok.kind !== 'space') return tok.text;
  return tok.text
    .replace(/ /g, '·') // middle dot for spaces
    .replace(/\t/g, '→') // arrow for tabs
    .replace(/\n/g, '↵'); // return symbol for newlines
}

export function Tokenizer({ initialText = DEFAULT_TEXT }: TokenizerProps) {
  const [text, setText] = useState(initialText);
  const baseId = useId();
  const fieldId = `${baseId}-text`;

  const tokens = useMemo(() => tokenize(text), [text]);

  // Count only "real" tokens for the headline number; spaces are structural.
  const tokenCount = tokens.length;
  const charCount = text.length;

  return (
    <div
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 text-ink"
      style={{ maxWidth: 860 }}
    >
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-sm text-ink">Tokenizer</h3>
        <p className="text-xs text-muted">
          Text is split into subword tokens, each mapped to an integer id. Edit the sentence and
          watch the pieces — and their ids — change.
        </p>
      </div>

      <label htmlFor={fieldId} className="sr-only">
        Text to tokenize
      </label>
      <textarea
        id={fieldId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        spellCheck={false}
        className="w-full resize-y rounded-md border border-border bg-surface-raised p-3 font-mono text-sm text-ink focus-visible:outline-none"
        style={{ borderColor: COLOR.border }}
        placeholder="Type something to tokenize…"
      />

      {/* Live token stream */}
      <div
        className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-surface-raised p-3"
        aria-label={`${tokenCount} tokens`}
      >
        {tokens.length === 0 ? (
          <span className="font-mono text-xs text-faint">no tokens yet — start typing</span>
        ) : (
          tokens.map((tok, i) => {
            const style = KIND_STYLE[tok.kind];
            return (
              <Token
                // Index is part of the key because identical pieces recur.
                key={`${i}-${tok.text}-${tok.id}`}
                text={displayText(tok)}
                id={tok.id}
                size="sm"
                weight={style.weight}
                state={style.state}
                title={`${style.label} · id ${tok.id}`}
                ariaLabel={`${style.label} ${tok.kind === 'space' ? 'whitespace' : tok.text}, id ${tok.id}`}
              />
            );
          })
        )}
      </div>

      {/* Readout */}
      <div className="flex flex-wrap items-center gap-4 font-mono text-xs">
        <span className="tabular-nums" style={{ color: COLOR.active }}>
          {tokenCount} {tokenCount === 1 ? 'token' : 'tokens'}
        </span>
        <span className="text-faint">/</span>
        <span className="tabular-nums text-muted">{charCount} chars</span>
        {charCount > 0 && (
          <span className="text-faint">
            ≈ {(charCount / Math.max(1, tokenCount)).toFixed(1)} chars / token
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[0.7rem] text-faint">
        {(Object.keys(KIND_STYLE) as TokKind[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <Token
              text={KIND_STYLE[k].label}
              size="sm"
              weight={KIND_STYLE[k].weight}
              state={KIND_STYLE[k].state}
            />
          </span>
        ))}
      </div>
    </div>
  );
}

export default Tokenizer;
