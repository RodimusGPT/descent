#!/usr/bin/env bun
/**
 * Invariant I3 — Encoding consistency.
 *
 * Every color in the project must originate from the single source of truth
 * (`src/lib/encoding.ts`) or its CSS mirror (`src/styles/tokens.css`). This guard
 * walks the source tree and fails if any raw hex color literal appears anywhere
 * else. Run as part of `bun run check`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SCAN_DIR = join(ROOT, 'src');

// The two files that are allowed to declare raw colors.
const ALLOWLIST = new Set(['src/lib/encoding.ts', 'src/styles/tokens.css']);

// Extensions where a color literal would be a real encoding violation. We skip
// .mdx prose (English text can incidentally contain "#abc"-looking fragments).
const SCANNED_EXT = ['.ts', '.tsx', '.astro', '.css'];

// Matches #rgb / #rgba / #rrggbb / #rrggbbaa, but not longer word-runs like
// `#define` (the negative lookahead rejects a trailing letter/digit/underscore).
const HEX = /#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z_])/g;

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (SCANNED_EXT.some((ext) => full.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];
for (const file of walk(SCAN_DIR)) {
  const rel = relative(ROOT, file).split('\\').join('/');
  if (ALLOWLIST.has(rel)) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // Only flag literals that look like CSS colors: #rgb, #rgba, #rrggbb, #rrggbbaa.
    for (const match of line.matchAll(HEX)) {
      const hex = match[0].slice(1);
      if ([3, 4, 6, 8].includes(hex.length)) {
        violations.push(`${rel}:${i + 1}  ${match[0]}  (${line.trim()})`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error(
    `\n✖ Encoding guard (I3) failed: ${violations.length} hardcoded hex color(s) outside encoding.ts / tokens.css:\n`,
  );
  for (const v of violations) console.error(`  ${v}`);
  console.error(
    '\nMove the color into src/lib/encoding.ts (+ tokens.css mirror) and reference it.\n',
  );
  process.exit(1);
}

console.log('✓ Encoding guard (I3): no stray hex colors found.');
