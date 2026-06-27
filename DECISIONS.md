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
