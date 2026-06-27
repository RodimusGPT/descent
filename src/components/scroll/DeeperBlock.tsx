import { COLOR, withAlpha } from '@/lib/encoding';
import type { ReactNode } from 'react';

/**
 * DeeperBlock — the expert/math depth track.
 *
 * A collapsible disclosure built on native <details>/<summary>, so it is keyboard
 * accessible and works with zero JavaScript (it can render as a static island in
 * MDX). Collapsed by default. Children may contain KaTeX (math typeset at build
 * time by remark-math + rehype-katex).
 */

export interface DeeperBlockProps {
  summary?: string;
  children: ReactNode;
}

export function DeeperBlock({ summary = 'Go deeper', children }: DeeperBlockProps) {
  return (
    <details
      className="group my-6 rounded-lg border bg-surface/60 px-4 py-1"
      style={{ borderColor: withAlpha(COLOR.modelAccent, 0.4) }}
    >
      <summary
        className="-mx-1 flex cursor-pointer list-none items-center gap-2 rounded px-1 py-3 font-mono text-sm font-medium focus-visible:outline-none"
        style={{ color: COLOR.modelAccent }}
      >
        <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">
          ▸
        </span>
        <span className="uppercase tracking-wide">∇ {summary}</span>
      </summary>
      <div className="prose-deeper pb-4 pt-1 text-sm leading-relaxed text-muted">{children}</div>
    </details>
  );
}

export default DeeperBlock;
