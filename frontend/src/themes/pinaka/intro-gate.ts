/**
 * Whether the first-visit introduction should play on this page load.
 *
 * Kept apart from the intro component so the app can decide without
 * downloading it. Once per device; `?intro=1` replays it (for reviewers and
 * screenshots). The component marks the key the moment it mounts, so a crash
 * mid-sequence can never loop it.
 */
import { PINAKA_STORAGE_KEYS } from './config';

export function shouldShowIntro(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get('intro') === '1') return true;
  } catch { /* ignore */ }
  try {
    return localStorage.getItem(PINAKA_STORAGE_KEYS.introSeen) === null;
  } catch {
    // No storage: play it once per load is worse than never. Skip.
    return false;
  }
}
