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
