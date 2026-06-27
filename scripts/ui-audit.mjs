#!/usr/bin/env node
/**
 * ui-audit.mjs — Playwright UI/UX audit for Descent.
 *
 * Drives a real Chromium against the built/served site to do what static checks
 * cannot: capture screenshots (for human/agent visual review), collect console
 * errors, detect layout problems (horizontal overflow, off-screen content), and
 * exercise key interactions — at desktop and mobile viewports, with an optional
 * reduced-motion pass.
 *
 * Usage:
 *   AUDIT_BASE=http://localhost:4321 node scripts/ui-audit.mjs
 *   AUDIT_BASE=... AUDIT_RM=1 node scripts/ui-audit.mjs   # emulate reduced motion
 *
 * Output: playwright-audit/<viewport>/*.png  and  playwright-audit/report.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.AUDIT_BASE || 'http://localhost:4321';
const REDUCED = process.env.AUDIT_RM === '1';
const OUT = 'playwright-audit';

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

/** Routes to full-page screenshot. Dev sandboxes are discovered from /dev. */
const STATIC_ROUTES = ['/', '/dev'];

const report = { base: BASE, reducedMotion: REDUCED, pages: [] };

function consoleCollector(page, bucket) {
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      bucket.push({ type, text: msg.text().slice(0, 300) });
    }
  });
  page.on('pageerror', (err) =>
    bucket.push({ type: 'pageerror', text: String(err).slice(0, 300) }),
  );
  page.on('requestfailed', (req) =>
    bucket.push({
      type: 'requestfailed',
      text: `${req.url()} ${req.failure()?.errorText ?? ''}`.slice(0, 300),
    }),
  );
}

async function layoutChecks(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const horizontalOverflow = de.scrollWidth - de.clientWidth;
    // Elements that stick out past the right edge of the viewport (layout bugs).
    const vw = window.innerWidth;
    const offenders = [];
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 2 && r.left >= 0) {
        offenders.push(
          `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} +${Math.round(r.right - vw)}px`,
        );
        if (offenders.length >= 8) break;
      }
    }
    return { horizontalOverflow, offenders };
  });
}

async function shoot(page, name, viewport, opts = {}) {
  const dir = `${OUT}/${viewport}`;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: !!opts.fullPage });
}

async function auditRoute(context, viewport, route) {
  const page = await context.newPage();
  const consoles = [];
  consoleCollector(page, consoles);
  const name = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '_');
  const entry = { route, viewport, consoles };
  try {
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(700); // let islands hydrate
    entry.layout = await layoutChecks(page);
    await shoot(page, name, viewport, { fullPage: true });
  } catch (err) {
    entry.error = String(err).slice(0, 300);
  }
  report.pages.push(entry);
  await page.close();
}

/** Home page: capture a scroll sequence so the long-form layout can be reviewed. */
async function auditHomeScroll(context, viewport) {
  const page = await context.newPage();
  const consoles = [];
  consoleCollector(page, consoles);
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(700);
    const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const vh = VIEWPORTS[viewport].height;
    const steps = Math.min(12, Math.max(4, Math.round(docHeight / vh)));
    for (let i = 0; i < steps; i++) {
      const y = Math.round((docHeight - vh) * (i / (steps - 1)));
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(350);
      await shoot(page, `scroll-${String(i).padStart(2, '0')}`, `${viewport}-home`);
    }
    report.pages.push({ route: '/ (scroll sequence)', viewport, steps, consoles });
  } catch (err) {
    report.pages.push({ route: '/ (scroll sequence)', viewport, error: String(err).slice(0, 300) });
  }
  await page.close();
}

/** Exercise the stepper + one interactive, watching for console errors. */
async function auditInteractions(context) {
  const page = await context.newPage();
  const consoles = [];
  consoleCollector(page, consoles);
  const result = { name: 'interactions', consoles, steps: [] };
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(700);
    // Stepper: click Next a few times.
    const next = page.getByRole('button', { name: 'Next step' });
    for (let i = 0; i < 5; i++) {
      if (await next.isVisible()) {
        await next.click();
        await page.waitForTimeout(400);
      }
    }
    await shoot(page, 'after-stepping', 'desktop-home');
    result.steps.push('clicked Next x5');
  } catch (err) {
    result.error = String(err).slice(0, 300);
  }
  report.pages.push(result);
  await page.close();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // Discover dev sandbox routes from /dev.
  let devRoutes = [];
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/dev`, { waitUntil: 'networkidle', timeout: 30000 });
      devRoutes = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href^="/dev/"]'))
          .map((a) => new URL(a.href).pathname)
          .filter((p) => p !== '/dev'),
      );
    } catch {
      // ignore
    }
    await ctx.close();
  }
  devRoutes = [...new Set(devRoutes)].sort();
  report.devRoutes = devRoutes;

  for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({
      viewport,
      reducedMotion: REDUCED ? 'reduce' : 'no-preference',
      deviceScaleFactor: 1,
    });
    // Static routes + every dev sandbox.
    for (const route of [...STATIC_ROUTES, ...devRoutes]) {
      await auditRoute(ctx, vp, route);
    }
    await auditHomeScroll(ctx, vp);
    await ctx.close();
  }

  // Interactions (desktop only).
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop });
    await auditInteractions(ctx);
    await ctx.close();
  }

  await browser.close();

  // Summarize.
  const allConsoles = report.pages.flatMap((p) =>
    (p.consoles || []).map((c) => ({ route: p.route, ...c })),
  );
  const overflow = report.pages.filter((p) => p.layout && p.layout.horizontalOverflow > 2);
  report.summary = {
    pagesAudited: report.pages.length,
    consoleIssues: allConsoles.length,
    routesWithHorizontalOverflow: overflow.map(
      (p) => `${p.viewport}:${p.route} (+${p.layout.horizontalOverflow}px)`,
    ),
  };
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));

  console.log('UI audit complete.');
  console.log('  pages audited:', report.pages.length);
  console.log('  console issues:', allConsoles.length);
  if (allConsoles.length) {
    for (const c of allConsoles.slice(0, 20)) console.log(`    [${c.type}] ${c.route}: ${c.text}`);
  }
  console.log(
    '  horizontal overflow:',
    report.summary.routesWithHorizontalOverflow.length
      ? report.summary.routesWithHorizontalOverflow.join(', ')
      : 'none',
  );
  console.log(`  screenshots + report.json under ${OUT}/`);
}

main().catch((err) => {
  console.error('audit failed:', err);
  process.exit(1);
});
