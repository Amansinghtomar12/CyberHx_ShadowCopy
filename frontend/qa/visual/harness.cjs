#!/usr/bin/env node
'use strict';
/**
 * harness.cjs — visual-QA screenshot runner for the CyberHX frontend.
 *
 *   node harness.cjs [--theme cyberhx|pinaka] [--viewport desktop,mobile]
 *                    [--scenes a,b,c] [--rm] [--base http://127.0.0.1:5198/] [--list]
 *
 * Every scene runs in a fresh browser context against the dev server, with
 * the Supabase backend replaced by mock.cjs (page.route) and the clock shifted
 * to the scene's moment. Output: out/<theme>/<viewport>[-rm]/<scene>.png and
 * out/<theme>/report[.rm].json. A failing scene is recorded and the run goes on.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, execFileSync } = require('child_process');
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const { createMock, HOST } = require('./mock.cjs');

const ROOT = __dirname;
const OUT = process.env.QA_OUT ? path.resolve(process.env.QA_OUT) : path.join(ROOT, 'out');
const FONT_CACHE = path.join(ROOT, '.cache', 'fonts');
const CHROMIUM = process.env.QA_CHROMIUM || '/opt/pw-browsers/chromium';
const DEFAULT_BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:5198/';
const STEP_TIMEOUT = 25_000;             // every wait in a scene is capped here (< 30 s)
const LIVE = '2026-11-14T10:30:00Z';      // six hours into the synthetic event
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

/** Declares a scene. opts: now, event, me, loggedOut, invite, down, hintTexts,
    submitResult, storage, only ('desktop'|'mobile'), skip, ignoreConsole (RegExp),
    before(page, h), shots: [{ name?, before?, waitText?, waitSelector?, waitHidden?, css?, at, full?, clip?, pad? }]. */
function scene(name, opts = {}) { return { name, ...opts }; }

// ── Fonts: Chromium cannot reach the proxy's CA, so curl fetches Google Fonts
// once and the bytes are served from a disk cache for every later run.
const fontMem = new Map();
function fetchFont(url) {
  if (fontMem.has(url)) return fontMem.get(url);
  fs.mkdirSync(FONT_CACHE, { recursive: true });
  const file = path.join(FONT_CACHE, crypto.createHash('sha1').update(url).digest('hex'));
  let buf = null;
  if (fs.existsSync(file)) buf = fs.readFileSync(file);
  else {
    try { buf = execFileSync('curl', ['-sSfL', '--max-time', '20', '-A', UA, url], { maxBuffer: 64 * 1024 * 1024 }); fs.writeFileSync(file, buf); }
    catch { buf = null; }
  }
  fontMem.set(url, buf);
  return buf;
}

// ── Init scripts (run in the page before any app code) ─────────────────────
function shiftDate(target) {
  // Date reads as the scene's moment, but keeps running so animations,
  // countdowns and timers behave exactly as they do live.
  const RealDate = Date; const offset = target - RealDate.now();
  class ShiftedDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(RealDate.now() + offset); else super(...a); }
    static now() { return RealDate.now() + offset; }
  }
  ShiftedDate.parse = RealDate.parse; ShiftedDate.UTC = RealDate.UTC;
  window.Date = ShiftedDate;
  // Pin the capability tier so the ambient environment does not depend on
  // the machine that happens to run the harness.
  try {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
  } catch {}
}
function seedStorage({ session, invite, extra }) {
  try {
    if (session) localStorage.setItem('sb-mock-auth-token', session);
    if (invite) localStorage.setItem('cyberhx.invite', invite);
    for (const [k, v] of Object.entries(extra || {})) localStorage.setItem(k, v);
  } catch {}
}

// ── Page helpers handed to scene.before / shot.before ──────────────────────
function helpers(page, run) {
  const mobile = run.viewport === 'mobile';
  const park = () => page.mouse.move(mobile ? 2 : 1438, mobile ? 842 : 898);
  const h = {
    mobile, park,
    text: (t) => page.getByText(t, { exact: false }).first(),
    waitText: (t) => page.getByText(t, { exact: false }).first().waitFor({ state: 'visible' }),
    clickText: (t) => page.getByText(t, { exact: false }).first().click(),
    boardReady: () => page.locator('#board-search').first().waitFor({ state: 'visible' }),
    /** Header navigation: Users, Teams, Challenges, Scoreboard, Admin, Team, Profile, Settings. */
    nav: async (label) => {
      if (mobile) {
        await page.getByRole('button', { name: 'Open menu' }).click();
        await page.getByText('Navigate', { exact: true }).waitFor({ state: 'visible' });
        const name = { Team: 'My Team' }[label] || label;
        await page.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }).first().click();
      } else {
        const aria = { Team: 'My team', Profile: 'My profile', Settings: 'Settings' };
        await page.getByRole('button', { name: aria[label] || label, exact: true }).first().click();
      }
      await park();
    },
    /** Opens an operation card by title and returns its dialog locator. */
    openChallenge: async (title) => {
      await h.boardReady();
      // During the Pinaka event a Free challenge with a battle scene is an
      // arena door rather than an ordinary card: the whole card is not the
      // button, its call to arms is. Try that first, fall back to the card.
      // A scene card opens in two presses: the call to arms enters the
      // arena and reveals the real name, then "Open the brief" opens the
      // dialog. The closed face no longer carries the title, so find the
      // card by the title its turned face reveals, falling back to the
      // whole grid when nothing is open yet.
      const card = page.locator('.pk-scenecard').filter({ hasText: title });
      if (await card.count()) {
        const enter = card.locator('.pk-scenecard__enter').first();
        await enter.click();
        await page.waitForTimeout(700);
        const brief = card.locator('.pk-scenecard__brief').first();
        if (await brief.count()) await brief.click();
      } else {
        // Title hidden on a closed arena: enter each one until it shows.
        const all = page.locator('.pk-scenecard');
        let opened = false;
        for (let i = 0; i < await all.count(); i++) {
          const c = all.nth(i);
          await c.locator('.pk-scenecard__enter').first().click();
          await page.waitForTimeout(700);
          if (await c.filter({ hasText: title }).count()) {
            await c.locator('.pk-scenecard__brief').first().click();
            opened = true; break;
          }
          await c.locator('.pk-scenecard__leave').first().click().catch(() => {});
          await page.waitForTimeout(400);
        }
        if (!opened) await page.locator('button[data-diff]', { hasText: title }).first().click();
      }
      const dialog = page.getByRole('dialog', { name: title });
      await dialog.waitFor({ state: 'visible' });
      await park();
      return dialog;
    },
    /** Board mode tabs: 'Free' | 'Chained' | 'B2R'; the B2R sub-mode tablist is index 1. */
    boardTab: async (name, list = 0) => {
      await h.boardReady();
      await page.getByRole('tablist').nth(list).getByRole('tab', { name, exact: true }).click();
      await park();
    },
  };
  return h;
}

// ── One scene, one context ─────────────────────────────────────────────────
async function runScene(browser, def, run) {
  const entry = { scene: def.name, viewport: run.viewport, theme: run.theme, reducedMotion: run.reducedMotion, status: 'ok', shots: [], pageErrors: [], consoleErrors: [], mockGaps: [], failedRequests: [], tier: null, durationMs: 0 };
  const skip = def.only && def.only !== run.viewport ? `${def.only}-only scene` : typeof def.skip === 'function' ? def.skip(run) : def.skip;
  if (skip) { entry.status = 'skipped'; entry.reason = skip; return entry; }

  const t0 = Date.now();
  const now = def.now || LIVE;
  const mock = createMock({ now, event: def.event, me: def.me, down: def.down, hintTexts: def.hintTexts, submitResult: def.submitResult, log: (m) => entry.mockGaps.push(m) });
  const ctx = await browser.newContext({ ...VIEWPORTS[run.viewport], reducedMotion: run.reducedMotion, colorScheme: 'dark', timezoneId: 'Asia/Kolkata', locale: 'en-IN' });
  ctx.setDefaultTimeout(STEP_TIMEOUT);
  const page = await ctx.newPage();
  page.on('pageerror', e => entry.pageErrors.push(String(e.message || e).split('\n')[0].slice(0, 300)));
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text().split('\n')[0].slice(0, 300);
    if (def.ignoreConsole && def.ignoreConsole.test(text)) entry.consoleErrorsExpected = (entry.consoleErrorsExpected || 0) + 1;
    else entry.consoleErrors.push(text);
  });
  page.on('requestfailed', r => { if (!r.url().includes(HOST)) entry.failedRequests.push(r.url().slice(0, 200)); });
  await page.addInitScript(shiftDate, Date.parse(now));
  // The event skin's first-visit intro would otherwise sit over every scene;
  // only the intro scene itself asks for it (?intro=1).
  const skinSeed = run.theme === 'pinaka' && !/\bintro=1\b/.test(def.query || '') ? { 'cyberhx.pinaka.intro.v1': '1' } : {};
  await page.addInitScript(seedStorage, { session: def.loggedOut ? null : JSON.stringify(mock.session), invite: def.invite || null, extra: { ...skinSeed, ...(def.storage || {}) } });
  await page.route('**/*', async route => {
    if (await mock.handle(route)) return;
    const u = new URL(route.request().url());
    if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') {
      const body = fetchFont(u.href);
      if (!body) { entry.mockGaps.push('font unavailable: ' + u.href); return route.fulfill({ status: 204, body: '' }); }
      return route.fulfill({ status: 200, contentType: u.hostname === 'fonts.googleapis.com' ? 'text/css' : 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body });
    }
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return route.continue();
    return route.fulfill({ status: 204, body: '' }); // nothing else leaves the sandbox
  });

  try {
    await page.goto(run.base + '?theme=' + run.theme + (def.query ? '&' + def.query : ''), { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ content: '.cursor-ring{display:none!important}' });
    const h = helpers(page, run);
    if (def.before) await def.before(page, h);
    for (const shot of def.shots || [{ at: 1000 }]) {
      if (shot.before) await shot.before(page, h);
      if (shot.waitText) await h.waitText(shot.waitText);
      if (shot.waitSelector) await page.locator(shot.waitSelector).first().waitFor({ state: 'visible' });
      if (shot.waitHidden) await page.locator(shot.waitHidden).first().waitFor({ state: 'hidden' });
      if (shot.css) await page.addStyleTag({ content: shot.css });
      await page.waitForTimeout(shot.at ?? 800);
      const file = path.join(run.outDir, shot.name ? `${def.name}-${shot.name}.png` : `${def.name}.png`);
      const o = { path: file, timeout: 60_000, fullPage: !!shot.full };
      if (shot.clip) {
        const box = typeof shot.clip === 'string' ? await page.locator(shot.clip).first().boundingBox() : shot.clip;
        if (box) { const pad = shot.pad ?? 24; o.clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + 2 * pad, height: box.height + 2 * pad }; o.fullPage = true; }
      }
      await page.screenshot(o);
      entry.shots.push(path.relative(OUT, file));
    }
    entry.tier = await page.evaluate(() => document.querySelector('[data-tier]')?.getAttribute('data-tier') ?? null).catch(() => null);
  } catch (e) {
    entry.status = 'failed';
    entry.error = String(e.message || e).split('\n')[0].slice(0, 400);
    try { const f = path.join(run.outDir, `${def.name}.FAILED.png`); await page.screenshot({ path: f, timeout: 15_000 }); entry.shots.push(path.relative(OUT, f)); } catch {}
  } finally {
    entry.durationMs = Date.now() - t0;
    await ctx.close().catch(() => {});
  }
  return entry;
}

// ── CLI ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { theme: 'cyberhx', viewport: 'desktop,mobile', scenes: '', rm: false, base: DEFAULT_BASE, list: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--rm') a.rm = true; else if (k === '--list') a.list = true;
    else if (k.startsWith('--')) a[k.slice(2)] = argv[++i];
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const all = require('./scenes.cjs');
  if (args.list) { all.forEach(s => console.log(s.name.padEnd(24), s.only ? `(${s.only} only)` : '')); return; }
  const wanted = args.scenes ? args.scenes.split(',').map(s => s.trim()).filter(Boolean) : null;
  const defs = wanted ? wanted.map(n => all.find(s => s.name === n) || { name: n, skip: 'unknown scene' }) : all;
  const viewports = args.viewport.split(',').map(s => s.trim()).filter(v => VIEWPORTS[v]);
  const reducedMotion = args.rm ? 'reduce' : 'no-preference';
  const themeDir = path.join(OUT, args.theme);
  const reportFile = path.join(themeDir, args.rm ? 'report.rm.json' : 'report.json');
  fs.mkdirSync(themeDir, { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const entries = [];
  for (const viewport of viewports) {
    const outDir = path.join(themeDir, args.rm ? `${viewport}-rm` : viewport);
    fs.mkdirSync(outDir, { recursive: true });
    const run = { theme: args.theme, viewport, reducedMotion, base: args.base, outDir };
    for (const def of defs) {
      const e = await runScene(browser, def, run);
      entries.push(e);
      const extra = e.status === 'failed' ? ` — ${e.error}` : e.status === 'skipped' ? ` — ${e.reason}` : '';
      const errs = e.pageErrors.length || e.consoleErrors.length ? ` [${e.pageErrors.length} page err, ${e.consoleErrors.length} console err]` : '';
      console.log(`${e.status.padEnd(7)} ${viewport.padEnd(7)} ${def.name.padEnd(24)} ${String(e.durationMs).padStart(6)}ms${errs}${extra}`);
    }
  }
  await browser.close();

  // Merge into the existing report so a partial rerun does not erase the rest.
  let prev = []; try { prev = JSON.parse(fs.readFileSync(reportFile, 'utf8')).scenes || []; } catch {}
  const key = e => `${e.viewport}/${e.scene}`;
  const merged = [...prev.filter(p => !entries.some(e => key(e) === key(p))), ...entries];
  const summary = { ok: 0, failed: 0, skipped: 0 };
  merged.forEach(e => { summary[e.status] = (summary[e.status] || 0) + 1; });
  const report = { generatedAt: new Date().toISOString(), base: args.base, theme: args.theme, reducedMotion, summary, scenes: merged };
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`\n${summary.ok} ok, ${summary.failed} failed, ${summary.skipped} skipped → ${path.relative(ROOT, reportFile)}`);
  process.exitCode = summary.failed ? 1 : 0;
}

module.exports = { scene, runScene, helpers, VIEWPORTS, LIVE, OUT };
if (require.main === module) main().catch(e => { console.error(e); process.exit(2); });
