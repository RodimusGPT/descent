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

## UI/UX polish pass (post-M6, from a Playwright design review)

A 5-lens design review over the audit screenshots drove a batch of high-impact / low-effort fixes:
- **One content left edge.** The hero, flat intros, part eyebrows, and the *wide* beats were
  centered at differing widths while two-column beats were left-aligned — "three competing left
  edges." Now everything left-aligns to one column edge: flat prose uses `margin-inline: 0`, the
  hero/eyebrow/wide-beat drop their `mx-auto`, and the hero sits in the same `max-w-6xl` container.
- **Hero scale.** Bumped to text-6xl/7xl with a tighter (~34rem) measure so the opening lands.
- **Heading hierarchy.** Beat `h3` → 1.4rem/700 so section titles clearly out-rank inline-bold terms.
- **Contrast.** Lifted `--color-faint` #5b6880 → #7e8aa0 so captions/helper text clear ~4.5:1
  (encoding.ts + tokens.css kept in sync; mirror test still passes).
- **Categorical palette.** Added a non-semantic `CATEGORICAL` identity palette (amber/blue/pink/
  green/coral) for embedding clusters and batch/paged sequences — so "verbs" stops using inert
  slate (= "off") and sequences stop borrowing the purple/teal part accents.
- **Affordance.** Restored `cursor: pointer` on buttons globally (Tailwind preflight drops it) and
  added a "Click any bit to flip it" hint to FloatExploder; bumped the mobile stepper tap targets.

All of the above, plus every other deferred / known-minor item, were then knocked out in a
**fix-everything pass** (10 parallel component-fix agents + shared-chrome edits): QKV panel
density, block-scaling ramp + gradient legend, batching reduced-motion stepping + selected toggle
+ labels, paged mobile restack + labels, sampling aria-live, autoregression emit-flash (no longer
previews the next token at rest), zoom breadcrumb affordance + FP16 value/bits consistency, budget
+ quant ARIA radiogroup roving-tabindex/arrow-keys + budget overflow clamp, tokenizer mobile ids,
prefill transport grouping, embeddings focus/selection decoupling, rail index numbers (accent-
colored + tabular), a stronger stepper backing, and compact "coming soon" placeholder cards (which
also retired the ScrollScene's competing Prev/Next on placeholder parts). Verified via re-audit:
0 console errors, 0 layout overflow.

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

## M9 — Global polish & launch readiness

Driven by a parallel audit (one agent per interactive + cross-cutting) → triage → parallel fix →
adversarial re-audit, then an objective runtime gate (`scripts/a11y-runtime.mjs` = axe-core + a
keyboard-roving harness) and Lighthouse. Choices made:

- **One shared `moveRadioFocus` (`src/lib/roving.ts`), ref-free.** Every single-select chip group
  (precision, model, GPU, head, strategy, mode, prompt, top-k, and the Token-based query/route rows)
  is now a conformant WAI-ARIA radiogroup: `role="radiogroup"` container, each option
  `role="radio"` + `aria-checked` + roving `tabIndex={active?0:-1}`, and one `onKeyDown` →
  `moveRadioFocus`, which finds siblings via `closest('[role="radiogroup"]')` (no ref arrays) and
  moves selection+focus on Arrow/Home/End with wrap. This **supersedes the M0 decision to defer the
  radiogroup pattern** and the `a11y/useSemanticElements`-off rationale: the chip buttons keep their
  styling AND are now keyboard-conformant. Two pre-existing local copies (Quant `handleRovingKey`,
  Budget `moveRadioFocus`) + a third in ConfigSandbox were collapsed into this one. `Token` gained
  `role`/`ariaChecked` props so token rows can be true radios. Verified on 28 groups.
- **`aria-live="polite"` on every result readout** that changes as the result of a user action
  (sampled/predicted/emitted tokens, fit/throughput verdicts, MoE routing, paged waste, the tour
  step counter, the replay reveal). Screen-reader users now hear the outcome of each interaction.
- **Reduced motion: CSS via global backstop, JS via the hook.** The global
  `@media (prefers-reduced-motion: reduce)` rule already neutralizes every CSS `transition`/
  `animation` with `!important`, so per-component `transition-colors` classes are intentionally NOT
  individually gated — the audit's 21 "ungated transition" findings were verified non-issues. What
  matters and is gated in JS: autoplay/`setInterval`/rAF clocks and that manual Step controls stay
  live under reduced motion.
- **Contrast (WCAG AA 4.5:1), palette-constrained.** Lifted `--color-faint` #7e8aa0 → #8c97ac
  (still distinct from muted, clears 4.5:1 on surface-raised). Killed all opacity-based text dimming
  (suffix `opacity-70`, the replay `opacity-50` upcoming cards). **Active chips use ink labels, not
  the accent** — accent-on-its-own-tint failed for the purple model accent (4.50); the accent
  border + fill + ring carry "selected" instead. **Capped the Token weight fill** at `0.14+0.26·w`
  (was `0.18+0.5·w`) so the hottest token keeps a dark-enough background for near-white ink to clear
  AA. Encoding-guard kept everything in `encoding.ts`/`tokens.css`.
- **Dropped the id subscript from the *interactive* token rows** (attention fan, MoE router, Q/K/V
  query row): it was decorative clutter there and tripped WCAG 2.5.3 (label-in-name, since the
  visible id wasn't in the aria-label). The I5 "token carries its id" motif stays everywhere it
  teaches (tokenizer, zoom, prompt hook, score grid).
- **Heading order.** The per-part eyebrow "Part N · Title" is now an `<h2>` (was a styled `<span>`),
  giving h1 (hero) → h2 (part) → h3 (beats) — sequential for screen-reader heading nav.
- **Dark mode finalized.** Added `<meta name="color-scheme" content="dark">` + `<meta name="theme-color">`
  (= `COLOR.bg`). Fixed a latent bug: the `COLOR` object never exposed `bg`/`surfaceRaised`
  (so `COLOR.bg` was `undefined`) — added them (mirrored in the encoding test).
- **`a11y` script + axe devDeps.** Added `bun run a11y` (`scripts/a11y-runtime.mjs`) and
  `@axe-core/playwright` + `axe-core` as devDeps — a reusable, server-driven launch gate alongside
  the existing `audit`. Kept out of `bun run check` (which must stay offline/fast).
- **Lighthouse target met.** Production-representative (gzipped) home page: perf 96–97 / a11y 100 /
  best-practices 100 / SEO 100, CLS 0. The uncompressed-localhost perf 85 is entirely missing server
  text-compression (~2.25 s of LCP); not a site-architecture issue (total weight 685 KiB passes).

## M10 — Software & hardware landscape (current systems), user-directed

Add the latest inference systems (software + hardware, cloud + local), woven in *relevantly* rather
than bolted on. Web-researched the ~2026 field; kept it evergreen.

- **Two new interactive beats, NOT a new Part.** The descent's 6-part arc (model → … → silicon →
  synthesis) is vertical; a "landscape" is horizontal/practical. So the additions live as beats inside
  the parts whose *question* they answer: Part 3 ("How is it served?") gains **"Where it runs"**
  (`DeploymentExplorer` — local / self-hosted / managed API); Part 4 ("How does the silicon run it?")
  gains **"The accelerator landscape"** (`AcceleratorLandscape` — today's chips by memory × bandwidth).
- **The accelerator scatter teaches the site's core law with real chips.** Plotting capacity (x) vs
  bandwidth (y) makes "does it fit?" and "how fast does it decode?" literal; a fixed *70B-at-FP8*
  reference shows fit + the decode ceiling per chip (`decodeTokPerSec` in `accelerators.ts`). The
  SRAM / wafer-scale outliers (Groq, Cerebras) are deliberately kept OFF the HBM plane and annotated
  separately — plotting their tiny SRAM on a capacity axis would mislead.
- **Evergreen handling.** All product names/numbers are ILLUSTRATIVE (~2026 public specs, not
  benchmarks) and centralized in two libs (`accelerators.ts`, `deploy.ts`) plus the refreshed
  config/budget/engines presets, so a future refresh is a one-file edit.
- **Data refresh.** GPU presets moved off the 4090/A100 era to RTX 5090 / H100 / H200 / B200 / MI300X
  / M3 Ultra; `EnginesOverview` gained **NVIDIA Dynamo** (5th — disaggregated, datacenter-scale) and
  its grid + the Part 3 prose/caption were updated to match. A disaggregated-serving + KV-offload
  `DeeperBlock` covers the big 2025–26 serving idea. The `GpuFloorplan` teaching baseline was later
  refreshed from H100 to **Blackwell B200** (148 SMs, 192 GB HBM3e, ~8 TB/s, 96 MB L2, 228 KB SRAM/SM),
  with the Part 4 "The GPU" prose updated to match — superseding the earlier "keep H100 as the baseline"
  note, at the user's request.
- **Reused the established patterns + built via orchestration.** The two new viz were built by parallel
  agents against the lib contracts, then adversarially verified, then I integrated + ran the gates.
  They follow the lib+component+test+dev-registry+[component] recipe; mirror `Roofline` (scatter) and
  `EnginesOverview` (cards); and use the shared `moveRadioFocus` radiogroup + aria-live + reduced-motion
  gating + encoding (`hwAccent` teal for Part 4, `CATEGORICAL` for the 3 deployment modes). Verified by
  the same gates as M9: axe 0 violations, roving pass, reduced-motion clean.
