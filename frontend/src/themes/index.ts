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
 *   3. ?theme=pinaka|cyberhx|auto      -> persisted per device, then used.
 *   4. the device override            -> localStorage 'cyberhx.theme'
 *   5. the organisers' switch         -> event_settings.theme on the server,
 *      read through the public_theme() RPC and the event-settings poll
 *   6. VITE_THEME                      -> the build default ('cyberhx').
 *
 * The organisers' switch is the one that matters during an event: an admin
 * opens the skin for every visitor from Admin → Event (or the nav button) and
 * every open tab follows within the event-settings poll interval, without a
 * reload and without losing a half-typed flag. The device override exists so
 * a reviewer can preview the skin before it is opened, and so a player who
 * prefers the classic look can keep it (presentation only, so letting them
 * is harmless). See docs/pinaka/RESTORE.md.
 */
import type React from 'react';
import { useSyncExternalStore } from 'react';

export type ThemeId = 'cyberhx' | 'pinaka';

const THEMES: readonly ThemeId[] = ['cyberhx', 'pinaka'];
const OVERRIDE_KEY = 'cyberhx.theme';
/** The last theme the server reported, so a return visit paints it at once. */
const SERVER_CACHE_KEY = 'cyberhx.theme.server';
const DEFAULT_THEME_COLOR = '#060b10';

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
 * every open tab. Unknown or missing values mean "the server has no opinion".
 */
export function noteServerTheme(value: unknown): void {
  const t = asTheme(value);
  serverTheme = t;
  try {
    if (t) localStorage.setItem(SERVER_CACHE_KEY, t);
    else localStorage.removeItem(SERVER_CACHE_KEY);
  } catch { /* fine */ }
  serverListeners.forEach(fn => fn(t));
  void applyTheme(effectiveTheme());
}

/* ── Resolution ────────────────────────────────────────────────────────── */

/** Lift ?theme= off the URL once, so a copied address carries no preference. */
function consumeUrlOverride(): void {
  if (typeof window === 'undefined' || !canSwitchTheme()) return;
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('theme');
    if (q === null) return;
    const wanted = asTheme(q);
    if (wanted) setThemeOverride(wanted);
    else if (q === 'auto') setThemeOverride(null);
    url.searchParams.delete('theme');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch { /* malformed URL: ignore */ }
}

/** The theme this device should show right now, from everything known. */
export function effectiveTheme(): ThemeId {
  if (themeExpired()) return 'cyberhx';
  if (canSwitchTheme()) {
    const o = getThemeOverride();
    if (o) return o;
  }
  return getServerTheme() ?? buildTheme();
}

/* ── The current theme, as an external store ───────────────────────────── */

let current: ThemeId | null = null;
const listeners = new Set<(t: ThemeId) => void>();

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

/**
 * Put a theme on the page: the attribute the stylesheet keys on, the
 * stylesheet itself (fetched once, on demand), fonts, the browser chrome
 * colour, the glyphs. Then tell every subscriber. Safe to call repeatedly;
 * a theme that fails to load leaves the page as it was.
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
        return;
      }
    } else {
      restoreCategoryIcons();
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (meta) meta.content = DEFAULT_THEME_COLOR;
    }
    document.documentElement.dataset.theme = next;
    if (next !== current) {
      current = next;
      listeners.forEach(fn => fn(next));
    }
  })();
  try { await applying; } finally { applying = null; }
}

/**
 * Decide and apply the theme before the first render.
 *
 * The server's choice is read through the anonymous `public_theme()` RPC.
 * A return visit paints the cached answer immediately and refreshes it in
 * the background; a first visit waits for the answer, but never more than a
 * moment — the platform must come up even if that call is slow or refused.
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
    if (!cached) await Promise.race([ask, new Promise<void>(r => setTimeout(r, 900))]);
  }

  await applyTheme(effectiveTheme());
  return getTheme();
}
