/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // Colors map to CSS custom properties defined in src/styles/tokens.css.
      // Components reference these semantic names (e.g. `bg-surface`, `text-ink`)
      // so no raw hex ever appears outside tokens.css / encoding.ts (Invariant I3).
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-raised': 'var(--color-surface-raised)',
        border: 'var(--color-border)',
        ink: 'var(--color-ink)',
        muted: 'var(--color-muted)',
        faint: 'var(--color-faint)',
        active: 'var(--color-active)',
        'active-hot': 'var(--color-active-hot)',
        inert: 'var(--color-inert)',
        'model-accent': 'var(--color-model-accent)',
        'hw-accent': 'var(--color-hw-accent)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      maxWidth: {
        prose: '42rem',
      },
    },
  },
  plugins: [],
};
