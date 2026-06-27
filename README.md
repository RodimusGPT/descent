# Descent

A visual, scroll-driven explainer of how LLM inference works — a single continuous
*descent* from the transformer model, down through how weights become numbers, down
through the serving stack, to the GPU silicon.

Static site: **Astro 4** + **React 18** islands + **MDX** + **Tailwind**, typed in strict
TypeScript. Interactive math lives in `src/lib/*` and is unit-tested with **Vitest**.

## Commands (Bun)

```bash
bun install        # install deps
bun run dev        # dev server  → http://localhost:4321
bun run build      # static build → dist/
bun run check      # green-bar gate: typecheck + lint + encoding-guard + tests
bun run test       # vitest only
```

## Structure

- `src/lib/encoding.ts` — single source of truth for color encoding (Invariant I3).
- `src/lib/parts.ts` — the six-part descent metadata (the spine).
- `src/components/scroll/` — shared primitives: `Token`, `ScrollScene`, `ProgressRail`,
  `DeeperBlock`.
- `src/components/viz/` — the interactive visualizations.
- `src/content/parts/*.mdx` — the prose for each part, with interactives embedded.
- `src/pages/dev/[component]` — isolated sandboxes for each interactive (for visual QA).

## Conventions

- All color comes from `encoding.ts` / `tokens.css`; `bun run encoding-guard` enforces it.
- Every interactive is keyboard-operable and respects `prefers-reduced-motion`.
- Non-trivial math is pure (in `src/lib`) and unit-tested.

See `DECISIONS.md` for choices not fixed by the spec and `QA.md` for the human visual-QA
checklist.
