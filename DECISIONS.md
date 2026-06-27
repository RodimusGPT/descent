# Decisions

Choices not fully fixed by the GOAL spec. Format: decision — rationale.

## M0 — Scaffold & spine

- **Version pins: Astro 4.16 / React 18.3 / @astrojs/react 3 / Tailwind 3.4 / Vitest 2.**
  The spec locks "Astro 4+, React 18". This is the known-compatible Astro-4-era set;
  staying off Astro 5 / React 19 avoids integration churn the spec didn't ask for.
- **`typecheck` = `astro sync && tsc --noEmit`.** The spec says `tsc --noEmit`. `astro sync`
  is a required pre-step: it generates the `astro:content` virtual-module types that
  `content/config.ts` depends on. Core of the check is still plain `tsc --noEmit`.
- **Biome: rely on `files.ignore`, not `files.include`.** Biome's `include` globs did not
  match `src/**` in 1.9.4 (it processed 0 files), so we allow everything and ignore
  `.astro` / `.mdx` / `.css` (Biome lints those poorly) plus build/dep dirs. Disabled
  `suspicious/noArrayIndexKey` (viz uses stable index keys) and `style/noNonNullAssertion`.
- **`encoding-guard` scope.** Scans `src/**` for raw hex outside `encoding.ts` / `tokens.css`.
  Skips `.mdx` (English prose yields false positives) and everything under `public/`
  (`favicon.svg` legitimately carries brand colors — it is a static asset, not code).
- **Added `src/lib/parts.ts`.** Not in the spec's file tree, but the spine needs one
  serializable source of part order/metadata shared by the landing page, part pages, and
  the `ProgressRail` island. Cross-checked against the MDX files in `test/spine.test.ts`.
- **System font stacks, no web fonts.** Keeps Invariant I7 (no runtime network) airtight and
  avoids FOUT. KaTeX CSS is imported and its fonts are bundled locally by Vite.
- **`dev/[component].astro` uses explicit per-slug island conditionals.** Astro cannot
  generate a hydration script for a dynamically-selected component variable, so each
  sandbox slug maps to a statically-referenced `<Island client:load />`. `DEV_SANDBOXES`
  (in `lib/dev-registry.ts`) remains the single registry/source of routes.
- **`ProgressRail` is desktop-only (`hidden md:flex`).** Desktop-first per the non-goals; on
  mobile the in-page Prev/Next "ascend/descend" nav covers reachability (I2).
- **`ScrollScene` keyboard model.** Narration steps are non-focusable `<li>`s; the scene is
  operated by keyboard via real Prev/Next `<button>`s in the sticky pane (avoids dozens of
  tab stops and non-interactive-tabindex a11y violations) while `scrollama` drives it on scroll.
- **Dark theme is the base.** The design's resting state is dark; the spec defers dark-mode
  *polish* to M9, not the base palette.

## Navigation — single continuous descent (post-M3, user-directed)

- **The descent is one scrollable page, not six.** Per direct user feedback that page-to-page
  navigation felt unintuitive, `index.astro` now renders the hero followed by all six parts as
  in-page `<section id={slug}>` blocks. You scroll the whole stack top-to-bottom — which is what
  the "descent" metaphor always promised. This **supersedes the spec's `pages/parts/[slug].astro`
  + `PartLayout.astro`** (both removed): per-part URLs were redundant once `/#slug` deep-links to a
  section, and keeping them would have meant duplicate content at orphaned routes. The content
  collection (MDX) is unchanged — it is the single source rendered into the page.
- **`ProgressRail` reworked into the persistent spine.** Desktop: a left sidebar with an
  always-visible label per part (the missing wayfinding), a warm fill that descends with scroll,
  and live highlighting of the section in view (scroll-position tracking). Mobile: a slim sticky
  top bar with a progress line + a `<select>` jump menu (the side rail can't show on narrow
  screens). All entries are in-page anchors; reduced-motion uses instant (not smooth) scroll.
- **`ProgressRail` keeps an optional `currentSlug` "focused part" mode** even though no route uses
  it now — cheap to keep, and ready if per-part deep-pages return later.
- **Guided-descent autoplay (`DescentTour`).** A floating, opt-in "Descend" control that walks the
  reader down stop-by-stop — every ScrollScene narration step (`[data-scrollstep]`) plus each
  section header (`[data-tour-stop]`), in document order. It drives the page scroll, so the
  existing scrollama + rail advance the visuals for free. Dwell per stop is proportional to that
  stop's reading length (≈200 wpm, 2–9 s), with a 1× / 1.5× / 2× / 0.5× speed control. Guardrails:
  never auto-starts; any manual wheel/touch/scroll-key pauses it instantly; reduced-motion steps
  instantly instead of gliding (WCAG 2.2.2). Step-level only for now — driving each interactive's
  own animation at its stop ("full cinematic") is a deliberate later layer.

## M1–M3 — Signature interactives

- **Built in parallel, then integrated.** The four signature interactives (AttentionFan,
  FloatExploder, QuantizationSlider, PrefillDecode) are independent units (disjoint
  lib/component/test files), so they were implemented by parallel agents against the frozen
  M0 foundation, each followed by an adversarial math verifier (IEEE-754 layouts, the
  KV-cache formula, quantization-error monotonicity, attention row-normalization). The whole
  tree was then type-checked, linted, encoding-guarded, and tested together (100 tests green)
  before committing. Per-milestone commits are bookkeeping over that one parallel build.
- **Disabled Biome `a11y/useSemanticElements`.** The interactives use valid, labeled,
  keyboard-operable ARIA grouping roles (`role="group"`/`radiogroup` with labels, toggle
  buttons with `aria-pressed`). The rule wants these rewritten to `<fieldset>`/`<input radio>`,
  which would restyle the chip-button controls and risk the polish of the signature pieces for
  a stylistic preference. Functional a11y (I4: keyboard + reduced-motion + labels) is met, so
  the rule is off; the canonical radiogroup keyboard pattern is a documented M9 follow-up.
- **`AttentionFan` uses an isomorphic layout effect.** It measures token centers
  (`getBoundingClientRect`) to draw the SVG fan, which needs `useLayoutEffect` on the client;
  on the server it falls back to `useEffect` to avoid React's SSR warning (keeps the console clean).
- **Deferred to the M9 a11y/polish pass (logged in QA.md):** roving-tabindex/arrow-key
  navigation for the QuantizationSlider precision/param radiogroups; making the PrefillDecode
  "no cache" recompute a per-step pulse rather than a static re-tint. Both are minor; functional
  behavior is correct now.

## M4 — Part 1 (the transformer)

- **Shared `lib/nn.ts` before fan-out.** softmax / softmaxWithTemperature / argmax / dot /
  cosineSimilarity / scaledScores are single-sourced and tested, then the seven Part-1 visuals
  (QKV, MoE, sampling, embeddings, …) build on them — so the core numerics are correct once, not
  reimplemented seven times. Same parallel build + adversarial-verify pattern as M1–M3.
- **MDX integration pattern.** Prose stays flat markdown (so the `.descent-prose` direct-child
  typography keeps working); interactives are embedded via a `Figure.astro` wrapper that frames +
  captions them and is a guided-tour stop. Because `.descent-prose` only styles *direct* children,
  the interactive inside a `<figure>` is untouched by prose rules — no `not-prose` gymnastics.
- **Tour stops in real content.** A dependency-free `rehypeTourStops` plugin tags content `h2`/`h3`
  as `data-tour-stop`, and `Figure` adds one per visual — so the guided descent pauses at each prose
  beat and each interactive. The section eyebrow lost its explicit stop to avoid doubling with the
  first heading.
- **Distance-based tour dwell.** DescentTour now sets each stop's dwell from the gap to the next
  stop (content-agnostic), replacing the placeholder-era word-count heuristic — paces sensibly over
  real prose.
- **MoE preset uses top-4 (not the spec's top-8 example)** so the active/total params land near the
  stated "~5 B active of ~117 B total" illustration; documented in `moe.ts`.

## M5 — Part 2 (weights as numbers)

- **Reused M2's FloatExploder + QuantizationSlider in prose**; built four new visuals in parallel
  (build + adversarial verify): ZoomToWeight, MemoryBudget, BlockScaling, Distillation.
- **`budget.ts` composes the existing libs** (`modelSizeBytes` from quant, `kvCacheBytes` from
  memory) rather than re-deriving memory math — single source.
- **MXFP4 illustration is a Beat (visual) + an inline DeeperBlock (mechanics)**, not a DeeperBlock
  wrapping the island. The spec calls for a DeeperBlock, but a `client:visible` island inside a
  collapsed `<details>` hydrates awkwardly; showing `BlockScaling` in the beat's visual slot and
  keeping the E2M1/E8M0 detail in a text DeeperBlock honors the intent more reliably.

## Presentation (post-M4, user-directed)

- **Step-through navigator replaces auto-play as the primary control.** Per user feedback, the
  bottom control is now ◀ Prev / "n / N" / Next ▶ — the reader advances stop-by-stop at their own
  pace. Auto-play is kept as a small optional toggle (▷) with a speed chip. Stops are the same set
  (`[data-tour-stop]` beats/headers + `[data-scrollstep]` scene steps); the counter tracks the
  nearest stop as you also scroll freely.
- **Two-column "Beat" layout** (`Beat.astro`) pairs each explanation with its visual: prose left,
  interactive right and **sticky** so it stays in view while you read; wide interactives (attention,
  Q/K/V, sampling) use a stacked full-width variant; everything stacks on mobile. Replaced the
  flat prose-then-`Figure` flow in Part 1.
- **Prose isolation via `:not(figure *)`.** Because interactives now live in two-column figures
  inside the prose container, the `.descent-prose` typography rules are scoped to skip anything
  inside a `<figure>` — so a bare `<p>` in a viz no longer inherits prose color/margins. Removed the
  rehype heading-tagging (Beats/section-headers are the explicit tour stops now).
