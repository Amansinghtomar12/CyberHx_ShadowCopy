/**
 * Design tokens, read back as literal values.
 *
 * Almost everything styles itself through CSS variables and never needs this.
 * The exception is SVG drawn by a charting library (Recharts writes `stroke`
 * and `stop-color` as presentation attributes), where a raw hex is the safe
 * choice. Reading the token at call time means a theme that re-points
 * --color-neon before the first render is honoured, and the default theme
 * gets exactly the value index.css declares.
 *
 * Cached per token until the theme changes: themes/index.ts resets the cache
 * when it switches the skin in place, so charts follow the new tokens.
 */
const cache = new Map<string, string>();

/** Forget every cached token; the next read sees the stylesheet as it is now. */
export function resetTokenCache(): void {
  cache.clear();
}

export function tokenValue(name: string, fallback: string): string {
  const hit = cache.get(name);
  if (hit) return hit;
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  let value = '';
  try {
    value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  } catch { /* detached document: fall through */ }
  const out = value || fallback;
  cache.set(name, out);
  return out;
}

/** The brand accent, for the one series on a chart that should read as "you". */
export const accent = () => tokenValue('--color-neon', '#c6ff00');
export const accentDim = () => tokenValue('--color-neon-dim', '#8fb800');
export const accentBright = () => tokenValue('--color-neon-bright', '#ddff6b');
