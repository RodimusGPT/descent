# Human visual QA checklist

The agent cannot self-certify visual correctness. This file lists what a human must
eyeball, per part/interactive. Exercise interactives in isolation at `/dev/<slug>`, and
in context at `/parts/<slug>`. Re-run with **reduced motion** on (OS setting) to confirm
static fallbacks still teach.

Legend: ☐ to check · each item names where to look.

## M0 — Scaffold & spine

**The spine (`/` then any `/parts/*`)**
- ☐ Does scrolling a part *feel* like a descent — narration moving past a fixed visual?
- ☐ `ProgressRail` (left edge, desktop): is the current part highlighted, and does the warm
  fill descend as you scroll? Do the node dots link to the right parts? Is it legible?
- ☐ Landing page: does the hero read well, and does the six-part "table of contents that is
  the journey" make the descent obvious? Do all six cards link correctly?
- ☐ Part accents: model parts (1, 2) tinted purple, hardware part (4) teal, neutral amber.

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
