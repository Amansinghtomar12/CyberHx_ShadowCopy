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
 *      must not outlive its event because somebody forgot a redeploy.
 *   2. VITE_THEME_SWITCH is '0'        -> the build default, no overrides.
 *   3. ?theme=pinaka|cyberhx|auto      -> persisted per device, then used.
 *   4. the device override            -> localStorage 'cyberhx.theme'
 *   5. VITE_THEME                      -> the build default ('cyberhx').
 *
 * The authoritative switch is the build: set VITE_THEME in the deployment
 * environment and redeploy. The per-device override exists so a reviewer can
 * preview the skin before it is the default, and so a player who prefers the
 * classic look during the event can keep it (presentation only, so letting
 * them is harmless). See docs/pinaka/RESTORE.md.
 *
 * Resolved once per page load. Switching reloads the page, which keeps every
 * component free of "what if the theme changes under me" logic.
 */

import type React from 'react';

export type ThemeId = 'cyberhx' | 'pinaka';

const THEMES: readonly ThemeId[] = ['cyberhx', 'pinaka'];
const OVERRIDE_KEY = 'cyberhx.theme';

const env = import.meta.env as Record<string, string | undefined>;

function asTheme(v: unknown): ThemeId | null {
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

/** `null` clears the override, so the device follows the build again. */
export function setThemeOverride(theme: ThemeId | null): void {
  try {
    if (theme) localStorage.setItem(OVERRIDE_KEY, theme);
    else localStorage.removeItem(OVERRIDE_KEY);
  } catch { /* storage unavailable: the build default applies */ }
}

let resolved: ThemeId | null = null;

/**
 * Decide the theme for this page load. Reads ?theme= off the URL and removes
 * it so the address a player copies does not carry a preference around.
 */
export function resolveTheme(): ThemeId {
  if (resolved) return resolved;
  if (typeof window === 'undefined') return (resolved = buildTheme());
  if (themeExpired()) return (resolved = 'cyberhx');
  if (!canSwitchTheme()) return (resolved = buildTheme());

  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('theme');
    if (q !== null) {
      const wanted = asTheme(q);
      if (wanted) setThemeOverride(wanted);
      else if (q === 'auto') setThemeOverride(null);
      url.searchParams.delete('theme');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  } catch { /* malformed URL: ignore */ }

  return (resolved = getThemeOverride() ?? buildTheme());
}

export function getTheme(): ThemeId {
  return resolved ?? resolveTheme();
}

export function isPinaka(): boolean {
  return getTheme() === 'pinaka';
}

/**
 * Category icon registry. App.tsx builds its category -> icon map at module
 * load, which is before any theme code has run (static imports are hoisted
 * above bootTheme()). So the map registers itself here, and a theme that
 * carries its own glyphs fills the same object in place during boot. The
 * default theme never touches it.
 */
type IconComponent = React.ComponentType<{ className?: string }>;
let categoryIconMap: Record<string, IconComponent> | null = null;

export function registerCategoryIcons<T extends Record<string, IconComponent>>(map: T): T {
  categoryIconMap = map;
  return map;
}

export function overrideCategoryIcons(icons: Record<string, IconComponent>): void {
  if (!categoryIconMap) return;
  for (const key of Object.keys(icons)) categoryIconMap[key] = icons[key];
}

/**
 * Apply the resolved theme before the first render: the attribute the CSS
 * keys on, the stylesheet (fetched only for a non-default theme), the fonts
 * and the browser chrome colour. Never throws — a theme that fails to load
 * leaves the platform on its default look, which is always correct.
 */
export async function bootTheme(): Promise<ThemeId> {
  const theme = resolveTheme();
  if (typeof document === 'undefined') return theme;
  document.documentElement.dataset.theme = theme;
  if (theme === 'pinaka') {
    try {
      const mod = await import('./pinaka/boot');
      await mod.bootPinaka();
    } catch (err) {
      // Styles failed to arrive (offline, blocked). Fall back to the default
      // skin rather than rendering half-themed.
      console.warn('[theme] Pinaka theme failed to load; using default', err);
      resolved = 'cyberhx';
      document.documentElement.dataset.theme = 'cyberhx';
    }
  }
  return getTheme();
}
