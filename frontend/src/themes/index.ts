/**
 * Theme registry — which skin the platform wears.
 *
 * The platform has exactly one functional UI. A theme is a presentation layer
 * on top of it: tokens, fonts, an environment, a few decorative components.
 * Nothing in here touches data, auth, scoring or routing, and the default
 * ('cyberhx') costs nothing: the Pinaka CSS and components are only fetched
 * when that theme is actually selected.
 *
 * HOW A THEME IS CHOSEN (first match wins)
 *   1. VITE_THEME_UNTIL has passed    -> 'cyberhx'. A temporary event skin
 *      must not outlive its event because somebody forgot to switch it off.
 *   2. VITE_THEME_SWITCH is '0'        -> no per-device overrides.
 *   3. ?preview=pinaka|cyberhx|off     -> this tab only (sessionStorage).
 *   4. ?theme=pinaka|cyberhx|auto      -> persisted per device, then used.
 *   5. the device override            -> localStorage 'cyberhx.theme'
 *   6. the organisers' switch         -> event_settings.theme on the server,
 *      read through the public_theme() RPC and the event-settings poll
 *   7. VITE_THEME                      -> the build default ('cyberhx').
 *
 * The organisers' switch is the one that matters during an event: an admin
 * opens the skin for every visitor from Admin → Event (or the nav button) and
 * every open tab follows within the event-settings poll interval, without a
 * reload and without losing a half-typed flag. The tab preview exists so a
 * reviewer or an admin can look at the skin before it is opened without
 * pinning their own device; the device override so a player who prefers the
 * classic look can keep it (presentation only, so letting them is harmless).
 * See docs/pinaka/RESTORE.md.
 */
import type React from 'react';
import { useSyncExternalStore } from 'react';
import { resetTokenCache } from '../lib/brand';

export type ThemeId = 'cyberhx' | 'pinaka';

const THEMES: readonly ThemeId[] = ['cyberhx', 'pinaka'];
const OVERRIDE_KEY = 'cyberhx.theme';
/** This tab's preview, if any: lives and dies with the tab. */
const PREVIEW_KEY = 'cyberhx.theme.preview';
/** The last theme the server reported, so a return visit paints it at once. */
const SERVER_CACHE_KEY = 'cyberhx.theme.server';
const DEFAULT_THEME_COLOR = '#060b10';
/** How long a first visit waits for the organisers' answer before painting. */
const SERVER_WAIT_MS = 700;
/** How long the first paint waits for the skin's own chunks before going ahead without them. */
const APPLY_WAIT_MS = 2500;

const env = import.meta.env as Record<string, string | undefined>;

export function asTheme(v: unknown): ThemeId | null {
  return typeof v === 'string' && (THEMES as readonly string[]).includes(v.toLowerCase())
    ? (v.toLowerCase() as ThemeId)
    : null;
}

/** The theme the deployment was built to show by default. */
export function buildTheme(): ThemeId {
  return asTheme(env.VITE_THEME) ?? 'cyberhx';
}

/** True once VITE_THEME_UNTIL (ISO 8601) has passed on this device's clock. */
export function themeExpired(): boolean {
  const until = env.VITE_THEME_UNTIL;
  if (!until) return false;
  const t = Date.parse(until);
  return Number.isFinite(t) && Date.now() > t;
}

/** Whether a visitor may change the skin for their own device. */
export function canSwitchTheme(): boolean {
  return env.VITE_THEME_SWITCH !== '0' && !themeExpired();
}

export function getThemeOverride(): ThemeId | null {
  try { return asTheme(localStorage.getItem(OVERRIDE_KEY)); } catch { return null; }
}

/** `null` clears the override, so the device follows the organisers again. */
export function setThemeOverride(theme: ThemeId | null): void {
  try {
    if (theme) localStorage.setItem(OVERRIDE_KEY, theme);
    else localStorage.removeItem(OVERRIDE_KEY);
  } catch { /* storage unavailable: the server/build default applies */ }
}

/** The preview this tab is showing, if it opened one (?preview=…). */
export function getPreviewTheme(): ThemeId | null {
  try { return asTheme(sessionStorage.getItem(PREVIEW_KEY)); } catch { return null; }
}

export function setPreviewTheme(theme: ThemeId | null): void {
  try {
    if (theme) sessionStorage.setItem(PREVIEW_KEY, theme);
    else sessionStorage.removeItem(PREVIEW_KEY);
  } catch { /* no session storage: no preview */ }
}

/* ── Server theme ──────────────────────────────────────────────────────── */

let serverTheme: ThemeId | null = null;
const serverListeners = new Set<(t: ThemeId | null) => void>();

/** Follow the organisers' choice itself (the admin control shows it). */
export function subscribeServerTheme(fn: (t: ThemeId | null) => void): () => void {
  serverListeners.add(fn);
  return () => { serverListeners.delete(fn); };
}

function readServerCache(): ThemeId | null {
  try { return asTheme(localStorage.getItem(SERVER_CACHE_KEY)); } catch { return null; }
}

/** The organisers' current choice, as last seen. */
export function getServerTheme(): ThemeId | null {
  return serverTheme ?? readServerCache();
}

/**
 * Record what the server says the skin is. Called at boot (public_theme RPC)
 * and from every event-settings poll, so a switch made by an admin reaches
 * every open tab.
 *
 * Anything that is not a known theme — a missing column before the migration,
 * an RPC that failed and resolved with null, a typo — is "no opinion" and
 * changes nothing: the device keeps what it last knew. Only an explicit value
 * from the server moves the skin, in either direction.
 */
export function noteServerTheme(value: unknown): void {
  const t = asTheme(value);
  if (!t) return;
  const changed = t !== serverTheme;
  serverTheme = t;
  try { localStorage.setItem(SERVER_CACHE_KEY, t); } catch { /* fine */ }
  if (changed) serverListeners.forEach(fn => fn(t));
  void applyTheme(effectiveTheme());
}

/* ── Resolution ────────────────────────────────────────────────────────── */

let introRequested = false;

/** Whether this page load asked for the introduction (?intro=1), read once at boot. */
export function wasIntroRequested(): boolean {
  return introRequested;
}

/**
 * Lift the theme parameters off the URL once, so a copied address carries no
 * preference: ?theme= (this device), ?preview= (this tab), ?intro= (replay
 * the introduction this load).
 */
function consumeUrlOverride(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams;
    let touched = false;

    if (q.has('intro')) {
      introRequested = q.get('intro') === '1';
      q.delete('intro');
      touched = true;
    }
    if (canSwitchTheme()) {
      const theme = q.get('theme');
      if (theme !== null) {
        const wanted = asTheme(theme);
        if (wanted) setThemeOverride(wanted);
        else if (theme === 'auto') setThemeOverride(null);
        q.delete('theme');
        touched = true;
      }
      const preview = q.get('preview');
      if (preview !== null) {
        const wanted = asTheme(preview);
        if (wanted) setPreviewTheme(wanted);
        else if (preview === 'off') setPreviewTheme(null);
        q.delete('preview');
        touched = true;
      }
    }
    if (touched) window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch { /* malformed URL: ignore */ }
}

/** The theme this device should show right now, from everything known. */
export function effectiveTheme(): ThemeId {
  if (themeExpired()) return 'cyberhx';
  if (canSwitchTheme()) {
    const chosen = getPreviewTheme() ?? getThemeOverride();
    if (chosen) return chosen;
  }
  return getServerTheme() ?? buildTheme();
}

/* ── The current theme, as an external store ───────────────────────────── */

let current: ThemeId | null = null;
const listeners = new Set<(t: ThemeId) => void>();
/** Once the skin has been on in this session, the Look switch stays offered. */
let seenPinaka = false;

/**
 * Whether the Look switch (Settings → Experience) should be shown at all: the
 * skin is in play by the build, the organisers, this device, this tab, or it
 * was earlier in this session (so a device that picks Classic can pick the
 * skin back without a URL).
 */
export function themeOffered(): boolean {
  return buildTheme() === 'pinaka' || getServerTheme() === 'pinaka' || getTheme() === 'pinaka'
    || getThemeOverride() !== null || getPreviewTheme() !== null || seenPinaka;
}

export function getTheme(): ThemeId {
  return current ?? (current = effectiveTheme());
}

export function isPinaka(): boolean {
  return getTheme() === 'pinaka';
}

export function subscribeTheme(fn: (t: ThemeId) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The theme as React state: re-renders the caller when the skin changes. */
export function useTheme(): ThemeId {
  return useSyncExternalStore(subscribeTheme, getTheme, buildTheme);
}

/* ── Category icon registry ────────────────────────────────────────────── */

/**
 * App.tsx builds its category -> icon map at module load, which is before any
 * theme code has run (static imports are hoisted above bootTheme()). So the
 * map registers itself here, and a theme that carries its own glyphs fills
 * the same object in place; leaving the theme restores the originals.
 */
type IconComponent = React.ComponentType<{ className?: string }>;
let categoryIconMap: Record<string, IconComponent> | null = null;
let categoryIconDefaults: Record<string, IconComponent> | null = null;

export function registerCategoryIcons<T extends Record<string, IconComponent>>(map: T): T {
  categoryIconMap = map;
  categoryIconDefaults = { ...map };
  return map;
}

export function overrideCategoryIcons(icons: Record<string, IconComponent>): void {
  if (!categoryIconMap) return;
  for (const key of Object.keys(icons)) categoryIconMap[key] = icons[key];
}

export function restoreCategoryIcons(): void {
  if (!categoryIconMap || !categoryIconDefaults) return;
  for (const key of Object.keys(categoryIconDefaults)) categoryIconMap[key] = categoryIconDefaults[key];
}

/* ── Applying a theme ──────────────────────────────────────────────────── */

let applying: Promise<void> | null = null;

/** Commit a theme to the document and tell every subscriber. */
function commit(next: ThemeId): void {
  if (next === 'pinaka') seenPinaka = true;
  document.documentElement.dataset.theme = next;
  // Charts read tokens as literals through lib/brand; the values just changed.
  resetTokenCache();
  if (next !== current) {
    current = next;
    listeners.forEach(fn => fn(next));
  }
}

/**
 * Put a theme on the page: the attribute the stylesheet keys on, the
 * stylesheet itself (fetched once, on demand), fonts, the browser chrome
 * colour, the glyphs. Then tell every subscriber. Safe to call repeatedly.
 * A theme that fails to load commits the default instead, so the DOM and
 * every component always agree on which skin is in force.
 */
export async function applyTheme(next: ThemeId): Promise<void> {
  if (typeof document === 'undefined') { current = next; return; }
  if (applying) await applying;
  if (next === current && document.documentElement.dataset.theme === next) return;
  applying = (async () => {
    if (next === 'pinaka') {
      try {
        const mod = await import('./pinaka/boot');
        await mod.bootPinaka();
      } catch (err) {
        console.warn('[theme] Pinaka theme failed to load; staying on the default look', err);
        restoreCategoryIcons();
        commit('cyberhx');
        return;
      }
    } else {
      restoreCategoryIcons();
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (meta) meta.content = DEFAULT_THEME_COLOR;
    }
    commit(next);
  })();
  try { await applying; } finally { applying = null; }
}

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Decide and apply the theme before the first render.
 *
 * The server's choice is read through the anonymous `public_theme()` RPC.
 * A return visit paints the cached answer immediately and refreshes it in
 * the background; a first visit waits for the answer, but never more than a
 * moment. Likewise the skin's own chunks get a moment to arrive so the first
 * paint wears them; past that the platform paints with the default look and
 * the skin lands in place when the chunks do. The platform must come up even
 * if any of this is slow, stalled or refused.
 */
export async function bootTheme(fetchServerTheme?: () => Promise<unknown>): Promise<ThemeId> {
  consumeUrlOverride();
  const cached = readServerCache();
  serverTheme = cached;

  if (fetchServerTheme && !themeExpired()) {
    const ask = fetchServerTheme().then(
      v => { noteServerTheme(v); },
      () => { /* offline or refused: keep the cached/build answer */ },
    );
    // Nothing cached: this is the only way to know, so give it a moment.
    if (!cached) await Promise.race([ask, delay(SERVER_WAIT_MS)]);
  }

  await Promise.race([applyTheme(effectiveTheme()), delay(APPLY_WAIT_MS)]);
  if (current === null) {
    // The skin is still on its way. Paint the default now; applyTheme will
    // commit the skin, and re-render everything, the moment it has it.
    if (!document.documentElement.dataset.theme) document.documentElement.dataset.theme = 'cyberhx';
    current = 'cyberhx';
  }
  return getTheme();
}
