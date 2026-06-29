#!/usr/bin/env node
/**
 * a11y-runtime.mjs — M9 launch-readiness accessibility verification.
 *
 * Drives real Chromium against the served site to verify what static checks
 * cannot:
 *   1. axe-core WCAG 2.1 A/AA scan on every route (hard violation count).
 *   2. Keyboard "roving tabindex" behavior on the radio groups: exactly one
 *      option in the tab order, and ArrowRight moves BOTH selection
 *      (aria-checked) and DOM focus to the next option (with wraparound).
 *   3. Console errors per route.
 *
 * Run against the built + served site (see `bun run a11y`):
 *   AUDIT_BASE=http://localhost:4321 node scripts/a11y-runtime.mjs
 */
import { AxeBuilder } from '@axe-core/playwright';
import { chromium } from 'playwright';

const BASE = process.env.AUDIT_BASE || 'http://localhost:4321';

// Pages whose first radiogroup we exercise with the keyboard. Each is a dev
// sandbox isolating one interactive that the M9 pass converted to the radio
// pattern (button-based or Token-based groups).
const ROVING_PAGES = [
  '/dev/quant',
  '/dev/moe',
  '/dev/parallelism',
  '/dev/attention',
  '/dev/hook',
  '/dev/gemm',
  '/dev/blockscale',
  '/dev/float',
  '/dev/qkv',
  '/dev/paged',
  '/dev/batching',
  '/dev/distill',
  '/dev/config',
  '/dev/budget',
  '/dev/deploy',
  '/dev/accelerators',
  '/dev/throughput',
];

async function discoverDevRoutes(ctx) {
  const page = await ctx.newPage();
  let routes = [];
  try {
    await page.goto(`${BASE}/dev`, { waitUntil: 'networkidle', timeout: 30000 });
    routes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href^="/dev/"]'))
        .map((a) => new URL(a.href).pathname)
        .filter((p) => p !== '/dev'),
    );
  } catch {
    /* ignore */
  }
  await page.close();
  return [...new Set(routes)].sort();
}

async function axeScan(ctx, route) {
  const page = await ctx.newPage();
  const consoles = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoles.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => consoles.push(`pageerror: ${String(e).slice(0, 200)}`));
  const entry = { route, violations: [], consoleErrors: consoles };
  try {
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    entry.violations = results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
      help: v.help,
      targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
    }));
  } catch (err) {
    entry.error = String(err).slice(0, 200);
  }
  await page.close();
  return entry;
}

async function rovingCheck(ctx, route) {
  const page = await ctx.newPage();
  const out = { route, groups: 0, checks: [], ok: true };
  try {
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(500);
    const groups = page.locator('[role="radiogroup"]');
    const gcount = await groups.count();
    out.groups = gcount;
    if (gcount === 0) {
      out.ok = false;
      out.checks.push({ group: -1, error: 'no radiogroup found' });
      await page.close();
      return out;
    }
    for (let g = 0; g < gcount; g++) {
      const radios = groups.nth(g).locator('[role="radio"]');
      const n = await radios.count();
      if (n < 2) continue;
      // (a) exactly one radio in the tab order
      let tab0 = 0;
      let checkedIdx = -1;
      for (let i = 0; i < n; i++) {
        const ti = await radios.nth(i).getAttribute('tabindex');
        const ck = await radios.nth(i).getAttribute('aria-checked');
        if (ti === '0') tab0++;
        if (ck === 'true') checkedIdx = i;
      }
      if (checkedIdx < 0) checkedIdx = 0;
      // (b) ArrowRight moves selection + focus to the next (wrap)
      await radios.nth(checkedIdx).focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(80);
      const expected = (checkedIdx + 1) % n;
      const nextChecked = (await radios.nth(expected).getAttribute('aria-checked')) === 'true';
      const focusMoved = await radios.nth(expected).evaluate((el) => el === document.activeElement);
      const pass = tab0 === 1 && nextChecked && focusMoved;
      if (!pass) out.ok = false;
      out.checks.push({ group: g, options: n, tabZeroCount: tab0, nextChecked, focusMoved, pass });
    }
  } catch (err) {
    out.ok = false;
    out.error = String(err).slice(0, 200);
  }
  await page.close();
  return out;
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const devRoutes = await discoverDevRoutes(ctx);
  const axeRoutes = ['/', ...devRoutes];

  // 1. axe scan on everything
  const axe = [];
  for (const r of axeRoutes) axe.push(await axeScan(ctx, r));

  // 2. roving keyboard behavior
  const roving = [];
  for (const r of ROVING_PAGES) roving.push(await rovingCheck(ctx, r));

  await browser.close();

  // Summaries
  const totalViolations = axe.reduce((s, e) => s + e.violations.length, 0);
  const byImpact = {};
  const uniqueRules = new Set();
  for (const e of axe) {
    for (const v of e.violations) {
      byImpact[v.impact] = (byImpact[v.impact] || 0) + 1;
      uniqueRules.add(v.id);
    }
  }
  const consoleErrs = axe.filter((e) => (e.consoleErrors || []).length);
  const rovingFail = roving.filter((r) => !r.ok);

  console.log('=== axe-core WCAG 2.1 A/AA scan ===');
  console.log(`routes scanned: ${axe.length}`);
  console.log(`total violations: ${totalViolations}`, JSON.stringify(byImpact));
  if (totalViolations) {
    console.log(`rules: ${[...uniqueRules].join(', ')}`);
    for (const e of axe) {
      if (!e.violations.length) continue;
      console.log(`  ${e.route}:`);
      for (const v of e.violations)
        console.log(`    [${v.impact}] ${v.id} (${v.nodes})  ${v.targets.join(' | ')}`);
    }
  }
  console.log('\n=== keyboard roving-tabindex behavior ===');
  console.log(`pages checked: ${roving.length}, failing: ${rovingFail.length}`);
  for (const r of roving) {
    const tag = r.ok ? 'OK ' : 'XX ';
    const detail = r.error
      ? r.error
      : r.checks
          .map(
            (c) =>
              `g${c.group}:${c.pass ? 'pass' : `FAIL(tab0=${c.tabZeroCount},sel=${c.nextChecked},foc=${c.focusMoved})`}`,
          )
          .join(' ');
    console.log(`  ${tag}${r.route} (${r.groups} groups) ${detail}`);
  }
  console.log('\n=== console errors ===');
  console.log(
    consoleErrs.length
      ? consoleErrs.map((e) => `${e.route}: ${e.consoleErrors.join('; ')}`).join('\n')
      : 'none',
  );

  const pass = totalViolations === 0 && rovingFail.length === 0 && consoleErrs.length === 0;
  console.log(`\nRESULT: ${pass ? 'PASS' : 'ISSUES FOUND'}`);
}

main().catch((e) => {
  console.error('a11y-runtime failed:', e);
  process.exit(1);
});
