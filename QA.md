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

## M1–M3
_(added as each interactive lands)_
