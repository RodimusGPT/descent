# Human visual QA checklist

The agent cannot self-certify visual correctness. This file lists what a human must
eyeball, per part/interactive. Exercise interactives in isolation at `/dev/<slug>`, and
in context at `/parts/<slug>`. Re-run with **reduced motion** on (OS setting) to confirm
static fallbacks still teach.

Legend: ☐ to check · each item names where to look.

## M0 — Scaffold & spine

**The spine — single continuous descent (`/`)**
- ☐ Is the whole thing ONE scrollable page (hero → six parts), and does scrolling it end-to-end
  *feel* like a descent rather than a set of separate pages?
- ☐ `ProgressRail` (desktop, left sidebar): are all six labels always visible, is the section
  in view highlighted, and does the warm fill descend as you scroll? Clicking a label jumps to
  that section (smooth, or instant under reduced motion).
- ☐ Mobile / narrow window: does the slim top bar show a progress line + a working "jump to part"
  dropdown? (The side rail is desktop-only by design.)
- ☐ Hero: does it read well, and does "Begin the descent ↓" jump to Part 0?
- ☐ Part accents: model parts (1, 2) tinted purple, hardware part (4) teal, neutral amber —
  visible in each section's "Part N · Title" eyebrow and the rail dots.

**Step-through navigator (the control, bottom-center)**
- ☐ Do **◀ Prev / Next ▶** move you one stop at a time (each beat + section), at your own pace?
  Does the visual + rail advance with each step?
- ☐ Does the **"n / N" counter** track your position as you also scroll freely by hand?
- ☐ Optional **auto-play** (▷): does it advance hands-free, and does any manual scroll / wheel /
  arrow key instantly stop it? Does the speed chip (1×/1.5×/2×/0.5×) change the pace?
- ☐ Reduced motion: do steps jump **instantly** instead of gliding?

**`ScrollScene` primitive (visible in every part's placeholder scene)**
- ☐ Sticky visual pane stays put while narration scrolls; the active step's narration is
  full-opacity, others dimmed.
- ☐ Prev / Next buttons move the step and scroll the matching narration into view.
- ☐ Reduced motion: stepping snaps instead of smooth-scrolling; nothing breaks.

**`Token` motif (`/dev/token`)**
- ☐ All states legible and distinct: default / active (warm) / inert (cool) / ghost / with-id.
- ☐ Weight ramp reads inert → amber → coral as weight rises (cool to hot).
- ☐ Interactive row: click selects; focus + ← / → moves selection; selected ring is clear.

**`DeeperBlock` (Part 1, "The attention score")**
- ☐ Collapsed by default; expands on click/Enter; the KaTeX formula renders correctly
  (fraction bar, √, superscript), not as raw `$…$`.

**Cross-cutting**
- ☐ No console errors on any route.
- ☐ Keyboard: every control reachable and operable; visible focus ring everywhere.

## M1 — Attention fan (`/dev/attention`)

- ☐ Do the three heads show *distinct, sensible* patterns? Switching head should visibly
  change the fan: "Previous token" (weight on the prior token), a structured/content head,
  and a broad/diffuse head.
- ☐ Is high attention clearly **warmer and thicker** (cool→amber→coral, thin→thick)?
- ☐ Click a token → fan re-roots to it. Focus a token + ←/→ → query moves. Feels right?
- ☐ Hovering/focusing a key token surfaces its numeric weight (readout + tooltip).
- ☐ Reduced motion: re-fan is instant (no line tween).

## M2 — Float exploder (`/dev/float`)

- ☐ Toggling any bit updates the represented value live (try flipping the sign, an exponent
  bit, a mantissa bit).
- ☐ Sign / exponent / mantissa fields are visually delineated and match the format
  (FP32 1/8/23, FP16 1/5/10, BF16 1/8/7).
- ☐ Switch FP16 ↔ BF16 on the same value: BF16 keeps the range but shows fewer mantissa bits —
  does that read clearly?
- ☐ Presets load (0.1, 1/3, max-normal, smallest-subnormal); Infinity/NaN/subnormal labels show.

## M2 — Quantization slider (`/dev/quant`)

- ☐ Does the histogram visibly **stair-step** into discrete levels as precision drops
  FP16 → INT8 → Q4 → Q2?
- ☐ Model-size (GB) and the quality score update live; is the quality clearly labeled
  *illustrative / not a benchmark*? Are the numbers believable (e.g. 7B Q4 ≈ 3.5 GB)?
- ☐ Precision + param-count selectors keyboard-operable; reduced motion snaps without tween.
- ⚠ Known (M9): the precision/param radiogroups are Tab-focusable but lack roving-tabindex
  arrow-key navigation — still operable, refine in the a11y pass.

## M3 — Prefill / decode + KV cache (`/dev/prefill`)

- ☐ Is the parallel-prefill vs token-by-token-decode distinction obvious? Are the
  **compute-bound** (prefill) / **memory-bound** (decode) labels present and placed sensibly?
- ☐ Does the KV-cache grid fill **cell-by-cell** during decode?
- ☐ "No cache" toggle: does the redundant recompute feel wasteful, and does the step counter
  grow ~O(n²) vs ~O(n) cached?
- ☐ Context-length slider + preset switch update the KV-memory readout; does GQA visibly
  shrink the KV vs MHA?
- ☐ Play/Pause works; reduced motion gives a stepped static fallback that still teaches.
- ⚠ Known (M9): in "no cache" mode the recompute is a static re-tint rather than a per-step pulse.

## M4 — Part 1: The transformer (`/`, the Part 1 section, + `/dev/*`)

Read Part 1 top-to-bottom in the page; exercise each visual in isolation at the `/dev` slug noted.

- ☐ **Reads as one descent:** tokenization → embeddings → the stack → attention → Q/K/V →
  FFN/MoE → logits→token → autoregression. Does each beat flow into the next? Do the
  `DeeperBlock` math asides (attention eq., RMSNorm, 2-D caveat) render as real KaTeX?
- ☐ **Two-column beats (desktop):** is the prose paired with its visual side-by-side, and does
  the visual stay **sticky** in view while you read the related text? Do the wide beats
  (attention, Q/K/V, sampling) break to full width sensibly? Does it **stack cleanly on mobile**?
- ☐ Do the interactives keep their own styling inside the figures (no prose color/spacing leaking
  into readouts/labels)?
- ☐ **Tokenizer** (`/dev/tokenizer`): edit the text — do tokens/ids update live? Do compound
  words visibly split into subwords? Do the four kinds (word/subword/punct/space) read clearly?
- ☐ **EmbeddingSpace** (`/dev/embeddings`): are the 5 clusters visually separated? Click a word —
  do its nearest neighbors highlight? Does the analogy overlay (king − man + woman → queen) land?
- ☐ **TransformerStack** (`/dev/stack`): is the pre-norm layer legible (norm → attn → FFN with
  residual arrows)? Does the FFN read as "holds most params"? Do presets change the numbers?
- ☐ **AttentionFan** (`/dev/attention`): still the centerpiece — heads distinct, warm=strong.
- ☐ **QKVMultiHead** (`/dev/qkv`): does Q·Kᵀ → softmax → weighted-V read step-by-step? Do heads
  differ? Does the GQA/MQA toggle visibly share K/V (and the copy now reads sensibly at 1×)?
- ☐ **MoERouter** (`/dev/moe`): do only the top-k experts light up (rest dormant)? Is the
  active-vs-total readout believable (~5 B of ~117 B)?
- ☐ **SamplingPlayground** (`/dev/sampling`): do temperature / top-k / top-p visibly reshape the
  bars? Are filtered-out tokens greyed? Does "Sample" pick sensibly?
- ☐ **Autoregression** (`/dev/autoregression`): does the context grow one token at a time with a
  feedback loop? Does the KV-cache motivation note land? Play/pause + reduced-motion stepped work?
- ⚠ Known minors (M9 polish, non-blocking): embeddings selection follows focus while tabbing;
  sampling's drawn-token readout lacks `aria-live`; autoregression's emitted token is shown
  persistently rather than as a brief flash. None affect correctness.
